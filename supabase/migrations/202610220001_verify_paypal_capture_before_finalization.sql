-- Verify PayPal money before finalizing an order.
--
-- Replaces public.process_paypal_webhook_event (originally defined in
-- 202603280003_checkout_and_paypal_functions.sql) with a version that:
--   1. Treats CHECKOUT.ORDER.APPROVED as an intermediate signal only. An
--      approval fires before any capture exists, so it no longer creates a
--      'paid' order or a 'captured' payment row; the event is recorded and
--      marked processed, and finalization waits for a verified capture.
--   2. Finalizes only on PAYMENT.CAPTURE.COMPLETED whose resource.status is
--      'COMPLETED' and whose captured amount + currency match the checkout
--      session's total_cents and the currency recorded in the session's item
--      snapshots. On any mismatch the discrepancy is written to
--      paypal_webhook_events.processing_error and the order is left
--      uncreated / the session uncompleted.
--   3. Records the verified captured amount and currency on the order and
--      payment rows instead of asserting the session total and 'USD'.
--
-- Event-id deduplication is unchanged (PayPal delivers at-least-once), and a
-- second verified delivery for an already-finalized session still converges
-- on the existing order.
--
-- Rollback: re-apply the process_paypal_webhook_event definition from
-- 202603280003_checkout_and_paypal_functions.sql (CREATE OR REPLACE). This
-- migration changes no table data and no existing rows.

begin;

CREATE OR REPLACE FUNCTION public.process_paypal_webhook_event(
  p_paypal_event_id text,
  p_event_type text,
  p_payload jsonb
)
RETURNS TABLE (
  processed boolean,
  duplicate boolean,
  order_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_row_id uuid;
  v_checkout public.checkout_sessions%ROWTYPE;
  v_order_id uuid;
  v_capture_id text;
  v_capture_status text;
  v_captured_value text;
  v_captured_cents integer;
  v_captured_currency text;
  v_expected_currency text;
  v_currency_kinds integer;
  v_currency_missing boolean;
  v_paypal_order_id text;
  v_item record;
BEGIN
  IF trim(coalesce(p_paypal_event_id, '')) = '' THEN
    RAISE EXCEPTION 'paypal_event_id is required';
  END IF;

  INSERT INTO public.paypal_webhook_events (
    paypal_event_id,
    event_type,
    resource_type,
    payload
  )
  VALUES (
    p_paypal_event_id,
    coalesce(p_event_type, ''),
    p_payload->>'resource_type',
    p_payload
  )
  ON CONFLICT (paypal_event_id) DO NOTHING
  RETURNING id
  INTO v_webhook_row_id;

  IF v_webhook_row_id IS NULL THEN
    processed := true;
    duplicate := true;
    order_id := NULL;
    message := 'Duplicate event';
    RETURN NEXT;
    RETURN;
  END IF;

  -- An approval is not a payment: the buyer has approved the order but no
  -- capture exists yet. Record the event and stop; only a verified capture
  -- (below) may finalize the order.
  IF p_event_type = 'CHECKOUT.ORDER.APPROVED' THEN
    UPDATE public.paypal_webhook_events
    SET processed_at = now()
    WHERE id = v_webhook_row_id;

    processed := true;
    duplicate := false;
    order_id := NULL;
    message := 'Approval recorded; awaiting capture';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_event_type <> 'PAYMENT.CAPTURE.COMPLETED' THEN
    UPDATE public.paypal_webhook_events
    SET processed_at = now()
    WHERE id = v_webhook_row_id;

    processed := true;
    duplicate := false;
    order_id := NULL;
    message := 'Event ignored';
    RETURN NEXT;
    RETURN;
  END IF;

  v_paypal_order_id := coalesce(
    p_payload#>>'{resource,supplementary_data,related_ids,order_id}',
    p_payload#>>'{resource,id}'
  );

  IF v_paypal_order_id IS NULL OR trim(v_paypal_order_id) = '' THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = 'Missing PayPal order id in payload'
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Missing PayPal order id';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_checkout
  FROM public.checkout_sessions cs
  WHERE cs.paypal_order_id = v_paypal_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = concat('Checkout session not found for paypal_order_id ', v_paypal_order_id)
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Checkout session not found';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Verify the capture itself before trusting it: it must be a completed
  -- capture carrying an identifiable amount and currency.
  v_capture_status := p_payload#>>'{resource,status}';
  v_capture_id := nullif(p_payload#>>'{resource,id}', '');
  v_captured_value := p_payload#>>'{resource,amount,value}';
  v_captured_currency := nullif(upper(coalesce(p_payload#>>'{resource,amount,currency_code}', '')), '');

  IF coalesce(v_capture_status, '') <> 'COMPLETED' THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = concat('Capture status is not COMPLETED: ', coalesce(v_capture_status, '<missing>'))
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Capture not completed';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_capture_id IS NULL THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = 'Missing capture id in payload'
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Missing capture id';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_captured_value IS NULL OR v_captured_value !~ '^[0-9]+(\.[0-9]+)?$' OR v_captured_currency IS NULL THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = 'Captured amount or currency missing or malformed in payload'
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Captured amount unverifiable';
    RETURN NEXT;
    RETURN;
  END IF;

  -- The captured amount must resolve to an exact whole number of cents.
  -- A fractional-cent value (e.g. 49.999) fails verification outright;
  -- rounding it could turn a non-matching capture into an apparent match.
  IF v_captured_value::numeric * 100 <> trunc(v_captured_value::numeric * 100) THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = concat('Captured amount is not an exact number of cents: ', v_captured_value)
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Captured amount unverifiable';
    RETURN NEXT;
    RETURN;
  END IF;

  v_captured_cents := (v_captured_value::numeric * 100)::integer;

  -- The session's expected currency is the one recorded in its item
  -- snapshots at creation time. If the items do not agree on exactly one
  -- currency, the capture cannot be verified against the session.
  SELECT count(DISTINCT csi.product_snapshot->>'currency'),
         min(csi.product_snapshot->>'currency'),
         bool_or(csi.product_snapshot->>'currency' IS NULL)
  INTO v_currency_kinds, v_expected_currency, v_currency_missing
  FROM public.checkout_session_items csi
  WHERE csi.checkout_session_id = v_checkout.id;

  IF coalesce(v_currency_kinds, 0) <> 1 OR coalesce(v_currency_missing, true) THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = 'Cannot determine a single checkout currency from session items'
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Checkout currency unverifiable';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_captured_cents <> v_checkout.total_cents OR v_captured_currency <> upper(v_expected_currency) THEN
    UPDATE public.paypal_webhook_events
    SET processing_error = concat(
      'Captured amount mismatch: expected ',
      v_checkout.total_cents, ' ', upper(v_expected_currency),
      ', captured ',
      v_captured_cents, ' ', v_captured_currency
    )
    WHERE id = v_webhook_row_id;

    processed := false;
    duplicate := false;
    order_id := NULL;
    message := 'Captured amount mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT o.id
  INTO v_order_id
  FROM public.orders o
  WHERE o.checkout_session_id = v_checkout.id;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (
      checkout_session_id,
      paypal_order_id,
      customer_email,
      customer_name,
      shipping_address,
      status,
      subtotal_cents,
      shipping_cents,
      total_cents,
      currency
    )
    VALUES (
      v_checkout.id,
      v_checkout.paypal_order_id,
      v_checkout.customer_email,
      null,
      v_checkout.shipping_address,
      'paid',
      v_checkout.subtotal_cents,
      v_checkout.shipping_cents,
      v_checkout.total_cents,
      v_captured_currency
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price_cents,
      product_snapshot,
      customization_json
    )
    SELECT
      v_order_id,
      csi.product_id,
      csi.quantity,
      csi.unit_price_cents,
      csi.product_snapshot,
      csi.customization_json
    FROM public.checkout_session_items csi
    WHERE csi.checkout_session_id = v_checkout.id;

    INSERT INTO public.payments (
      order_id,
      provider,
      provider_order_id,
      provider_capture_id,
      status,
      amount_cents,
      currency,
      raw_payload
    )
    VALUES (
      v_order_id,
      'paypal',
      v_paypal_order_id,
      v_capture_id,
      'captured',
      v_captured_cents,
      v_captured_currency,
      p_payload
    )
    ON CONFLICT (provider, provider_order_id) DO NOTHING;

    INSERT INTO public.order_status_history (
      order_id,
      from_status,
      to_status,
      note
    )
    VALUES (
      v_order_id,
      'pending_payment',
      'paid',
      concat('paypal event ', p_paypal_event_id)
    );

    FOR v_item IN
      SELECT p.id AS product_id, p.inventory_mode, csi.quantity
      FROM public.checkout_session_items csi
      JOIN public.products p ON p.id = csi.product_id
      WHERE csi.checkout_session_id = v_checkout.id
    LOOP
      IF v_item.inventory_mode = 'finite' THEN
        UPDATE public.products p
        SET stock_quantity = p.stock_quantity - v_item.quantity,
            reserved_quantity = GREATEST(p.reserved_quantity - v_item.quantity, 0)
        WHERE p.id = v_item.product_id
          AND p.stock_quantity >= v_item.quantity;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Unable to commit inventory for product %', v_item.product_id;
        END IF;

        INSERT INTO public.product_inventory_movements (
          product_id,
          delta,
          reason,
          note
        )
        VALUES (
          v_item.product_id,
          -v_item.quantity,
          'order_commit',
          concat('order:', v_order_id::text)
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.checkout_sessions
  SET status = 'completed'
  WHERE id = v_checkout.id;

  UPDATE public.paypal_webhook_events
  SET processed_at = now()
  WHERE id = v_webhook_row_id;

  processed := true;
  duplicate := false;
  order_id := v_order_id;
  message := 'Processed';
  RETURN NEXT;
END;
$$;

commit;
