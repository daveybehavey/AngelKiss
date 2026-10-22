-- Manual verification for migration 202610220001
-- (verify PayPal capture before finalizing an order).
--
-- Run against a LOCAL / DEV database only, with all migrations applied:
--   psql "$DATABASE_URL" -f scripts/verify-paypal-finalization.sql
--
-- The whole script runs in one transaction and ends with ROLLBACK, so it
-- leaves no data behind. Every check raises an exception on failure; a clean
-- run prints one NOTICE per passed check.

begin;

do $$
declare
  v_product_id uuid;
  v_session_id uuid;
  v_session2_id uuid;
  v_session3_id uuid;
  v_session4_id uuid;
  v_processed boolean;
  v_duplicate boolean;
  v_order_id uuid;
  v_message text;
  v_count integer;
  v_status text;
  v_check_order_id text;
  v_check_total integer;
  v_payment record;
begin
  -- Seed: one made-to-order product priced CAD 50.00 and a checkout session
  -- whose PayPal order exists but has not been captured.
  insert into public.products (slug, name, category, base_price_cents, currency, inventory_mode, status, is_available)
  values ('verify-paypal-finalization', 'Verify PayPal Finalization', 'custom_sublimation', 5000, 'CAD', 'made_to_order', 'published', true)
  returning id into v_product_id;

  insert into public.checkout_sessions (customer_email, shipping_address, status, paypal_order_id, subtotal_cents, shipping_cents, total_cents)
  values ('verify@example.com', '{}'::jsonb, 'paypal_order_created', 'VERIFY-ORDER-1', 5000, 0, 5000)
  returning id into v_session_id;

  insert into public.checkout_session_items (checkout_session_id, product_id, quantity, unit_price_cents, product_snapshot)
  values (v_session_id, v_product_id, 1, 5000, jsonb_build_object('id', v_product_id, 'currency', 'CAD'));

  -- 1. CHECKOUT.ORDER.APPROVED records the event but must NOT create a paid
  --    order or a payment, and must not complete the session.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-approve',
    'CHECKOUT.ORDER.APPROVED',
    '{"resource_type":"checkout-order","resource":{"id":"VERIFY-ORDER-1","status":"APPROVED"}}'::jsonb
  );

  select count(*) into v_count from public.orders where checkout_session_id = v_session_id;
  if v_count <> 0 then raise exception 'FAIL 1: APPROVED created an order'; end if;
  select count(*) into v_count from public.payments p join public.orders o on o.id = p.order_id where o.checkout_session_id = v_session_id;
  if v_count <> 0 then raise exception 'FAIL 1: APPROVED created a payment'; end if;
  if (select status from public.checkout_sessions where id = v_session_id) <> 'paypal_order_created' then
    raise exception 'FAIL 1: APPROVED changed the session status';
  end if;
  raise notice 'PASS 1: APPROVED recorded only (message: %)', v_message;

  -- 2. A capture for the wrong amount must be rejected and recorded, leaving
  --    no order behind.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-wrong-amount',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-1","status":"COMPLETED","amount":{"value":"49.99","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-1"}}}}'::jsonb
  );

  if v_processed then raise exception 'FAIL 2: wrong-amount capture was processed'; end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session_id;
  if v_count <> 0 then raise exception 'FAIL 2: wrong-amount capture created an order'; end if;
  if not exists (select 1 from public.paypal_webhook_events where paypal_event_id = 'evt-verify-wrong-amount' and processing_error like 'Captured amount mismatch%') then
    raise exception 'FAIL 2: mismatch was not recorded in processing_error';
  end if;
  raise notice 'PASS 2: wrong-amount capture rejected and recorded (message: %)', v_message;

  -- 3. A capture whose resource status is not COMPLETED must be rejected.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-pending',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-1","status":"PENDING","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-1"}}}}'::jsonb
  );

  if v_processed then raise exception 'FAIL 3: non-completed capture was processed'; end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session_id;
  if v_count <> 0 then raise exception 'FAIL 3: non-completed capture created an order'; end if;
  raise notice 'PASS 3: non-completed capture rejected (message: %)', v_message;

  -- 4. A verified capture finalizes: paid order, payment row carrying the
  --    captured amount/currency and the real capture id, session completed.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-capture',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-1","status":"COMPLETED","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-1"}}}}'::jsonb
  );

  if not v_processed or v_order_id is null then raise exception 'FAIL 4: verified capture did not finalize'; end if;
  if (select status from public.orders where id = v_order_id) <> 'paid' then
    raise exception 'FAIL 4: order is not paid';
  end if;
  if (select currency from public.orders where id = v_order_id) <> 'CAD' then
    raise exception 'FAIL 4: order currency is not the verified captured currency';
  end if;
  select * into v_payment from public.payments where order_id = v_order_id;
  if v_payment.amount_cents <> 5000 or v_payment.currency <> 'CAD' or v_payment.provider_capture_id <> 'CAP-VERIFY-1' or v_payment.status <> 'captured' then
    raise exception 'FAIL 4: payment row does not carry the verified capture (amount %, currency %, capture %)', v_payment.amount_cents, v_payment.currency, v_payment.provider_capture_id;
  end if;
  if (select status from public.checkout_sessions where id = v_session_id) <> 'completed' then
    raise exception 'FAIL 4: session not completed';
  end if;
  raise notice 'PASS 4: verified capture finalized order %', v_order_id;

  -- 5. Redelivery of the same event id is a duplicate and changes nothing.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-capture',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-1","status":"COMPLETED","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-1"}}}}'::jsonb
  );

  if not v_duplicate then raise exception 'FAIL 5: redelivered event was not flagged duplicate'; end if;
  raise notice 'PASS 5: duplicate delivery deduplicated';

  -- 6. A second, distinct verified event for the same capture (the real
  --    webhook after the capture-route finalization, or vice versa) converges
  --    on the same single order and payment.
  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-capture-second',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-1","status":"COMPLETED","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-1"}}}}'::jsonb
  );

  if not v_processed then raise exception 'FAIL 6: second verified delivery did not converge'; end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session_id;
  if v_count <> 1 then raise exception 'FAIL 6: expected exactly one order, found %', v_count; end if;
  select count(*) into v_count from public.payments p join public.orders o on o.id = p.order_id where o.checkout_session_id = v_session_id;
  if v_count <> 1 then raise exception 'FAIL 6: expected exactly one payment, found %', v_count; end if;
  raise notice 'PASS 6: dual delivery converged on one order and one payment';

  -- 7. A capture in a different currency than the session's item snapshots
  --    must NOT finalize, even when the amount matches: the discrepancy is
  --    recorded and no order is created.
  insert into public.checkout_sessions (customer_email, shipping_address, status, paypal_order_id, subtotal_cents, shipping_cents, total_cents)
  values ('verify@example.com', '{}'::jsonb, 'paypal_order_created', 'VERIFY-ORDER-2', 5000, 0, 5000)
  returning id into v_session2_id;

  insert into public.checkout_session_items (checkout_session_id, product_id, quantity, unit_price_cents, product_snapshot)
  values (v_session2_id, v_product_id, 1, 5000, jsonb_build_object('id', v_product_id, 'currency', 'CAD'));

  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-currency-mismatch',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-2","status":"COMPLETED","amount":{"value":"50.00","currency_code":"USD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-2"}}}}'::jsonb
  );

  -- Strict assertions (the same style is used in 8 and 9): processed must
  -- be exactly false -- a bare "if v_processed" check would also pass on
  -- NULL -- and the session must be proven untouched by existence plus
  -- equality with the seeded values, not by a <> comparison, which passes
  -- vacuously when the row is missing.
  if v_processed is distinct from false then
    raise exception 'FAIL 7: wrong-currency capture was not rejected (processed=%)', v_processed;
  end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session2_id;
  if v_count <> 0 then raise exception 'FAIL 7: wrong-currency capture created an order'; end if;
  select count(*) into v_count from public.payments p join public.orders o on o.id = p.order_id where o.checkout_session_id = v_session2_id;
  if v_count <> 0 then raise exception 'FAIL 7: wrong-currency capture created a payment'; end if;
  if not exists (select 1 from public.paypal_webhook_events where paypal_event_id = 'evt-verify-currency-mismatch' and processing_error like 'Captured amount mismatch%') then
    raise exception 'FAIL 7: currency mismatch was not recorded in processing_error';
  end if;
  select status, paypal_order_id, total_cents into v_status, v_check_order_id, v_check_total
  from public.checkout_sessions where id = v_session2_id;
  if not found
     or v_status is distinct from 'paypal_order_created'
     or v_check_order_id is distinct from 'VERIFY-ORDER-2'
     or v_check_total is distinct from 5000 then
    raise exception 'FAIL 7: wrong-currency capture did not leave the session untouched (status=%, paypal_order_id=%, total_cents=%)', v_status, v_check_order_id, v_check_total;
  end if;
  raise notice 'PASS 7: wrong-currency capture rejected and recorded (message: %)', v_message;

  -- 8. A session whose items carry no snapshot currency at all must fail
  --    closed: the capture cannot be verified against the session.
  insert into public.checkout_sessions (customer_email, shipping_address, status, paypal_order_id, subtotal_cents, shipping_cents, total_cents)
  values ('verify@example.com', '{}'::jsonb, 'paypal_order_created', 'VERIFY-ORDER-3', 5000, 0, 5000)
  returning id into v_session3_id;

  insert into public.checkout_session_items (checkout_session_id, product_id, quantity, unit_price_cents, product_snapshot)
  values (v_session3_id, v_product_id, 1, 5000, jsonb_build_object('id', v_product_id));

  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-no-snapshot-currency',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-3","status":"COMPLETED","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-3"}}}}'::jsonb
  );

  if v_processed is distinct from false then
    raise exception 'FAIL 8: capture for a session with no snapshot currency was not rejected (processed=%)', v_processed;
  end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session3_id;
  if v_count <> 0 then raise exception 'FAIL 8: capture with no snapshot currency created an order'; end if;
  select count(*) into v_count from public.payments p join public.orders o on o.id = p.order_id where o.checkout_session_id = v_session3_id;
  if v_count <> 0 then raise exception 'FAIL 8: capture with no snapshot currency created a payment'; end if;
  if not exists (select 1 from public.paypal_webhook_events where paypal_event_id = 'evt-verify-no-snapshot-currency' and processing_error like 'Cannot determine a single checkout currency%') then
    raise exception 'FAIL 8: missing snapshot currency was not recorded in processing_error';
  end if;
  select status, paypal_order_id, total_cents into v_status, v_check_order_id, v_check_total
  from public.checkout_sessions where id = v_session3_id;
  if not found
     or v_status is distinct from 'paypal_order_created'
     or v_check_order_id is distinct from 'VERIFY-ORDER-3'
     or v_check_total is distinct from 5000 then
    raise exception 'FAIL 8: capture with no snapshot currency did not leave the session untouched (status=%, paypal_order_id=%, total_cents=%)', v_status, v_check_order_id, v_check_total;
  end if;
  raise notice 'PASS 8: session with no snapshot currency failed closed (message: %)', v_message;

  -- 9. A session whose items carry conflicting snapshot currencies must
  --    fail closed the same way: no single expected currency exists.
  insert into public.checkout_sessions (customer_email, shipping_address, status, paypal_order_id, subtotal_cents, shipping_cents, total_cents)
  values ('verify@example.com', '{}'::jsonb, 'paypal_order_created', 'VERIFY-ORDER-4', 5000, 0, 5000)
  returning id into v_session4_id;

  insert into public.checkout_session_items (checkout_session_id, product_id, quantity, unit_price_cents, product_snapshot)
  values
    (v_session4_id, v_product_id, 1, 2500, jsonb_build_object('id', v_product_id, 'currency', 'CAD')),
    (v_session4_id, v_product_id, 1, 2500, jsonb_build_object('id', v_product_id, 'currency', 'USD'));

  select processed, duplicate, order_id, message
    into v_processed, v_duplicate, v_order_id, v_message
  from public.process_paypal_webhook_event(
    'evt-verify-conflicting-currency',
    'PAYMENT.CAPTURE.COMPLETED',
    '{"resource_type":"capture","resource":{"id":"CAP-VERIFY-4","status":"COMPLETED","amount":{"value":"50.00","currency_code":"CAD"},"supplementary_data":{"related_ids":{"order_id":"VERIFY-ORDER-4"}}}}'::jsonb
  );

  if v_processed is distinct from false then
    raise exception 'FAIL 9: capture for a session with conflicting snapshot currencies was not rejected (processed=%)', v_processed;
  end if;
  select count(*) into v_count from public.orders where checkout_session_id = v_session4_id;
  if v_count <> 0 then raise exception 'FAIL 9: capture with conflicting snapshot currencies created an order'; end if;
  select count(*) into v_count from public.payments p join public.orders o on o.id = p.order_id where o.checkout_session_id = v_session4_id;
  if v_count <> 0 then raise exception 'FAIL 9: capture with conflicting snapshot currencies created a payment'; end if;
  if not exists (select 1 from public.paypal_webhook_events where paypal_event_id = 'evt-verify-conflicting-currency' and processing_error like 'Cannot determine a single checkout currency%') then
    raise exception 'FAIL 9: conflicting snapshot currencies were not recorded in processing_error';
  end if;
  select status, paypal_order_id, total_cents into v_status, v_check_order_id, v_check_total
  from public.checkout_sessions where id = v_session4_id;
  if not found
     or v_status is distinct from 'paypal_order_created'
     or v_check_order_id is distinct from 'VERIFY-ORDER-4'
     or v_check_total is distinct from 5000 then
    raise exception 'FAIL 9: capture with conflicting snapshot currencies did not leave the session untouched (status=%, paypal_order_id=%, total_cents=%)', v_status, v_check_order_id, v_check_total;
  end if;
  raise notice 'PASS 9: session with conflicting snapshot currencies failed closed (message: %)', v_message;

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
