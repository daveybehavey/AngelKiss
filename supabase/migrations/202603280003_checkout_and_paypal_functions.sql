-- AngelKiss checkout/session and paypal webhook helper functions

begin;

CREATE OR REPLACE FUNCTION public.create_checkout_session(
  p_customer_email text,
  p_shipping_address jsonb,
  p_items jsonb
)
RETURNS TABLE (
  checkout_session_id uuid,
  status public.checkout_session_status,
  expires_at timestamptz,
  subtotal_cents integer,
  shipping_cents integer,
  total_cents integer,
  shipping_zone public.shipping_zone,
  free_shipping_applied boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_expires_at timestamptz;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_quantity integer;
  v_customization jsonb;
  v_calc record;
BEGIN
  IF trim(coalesce(p_customer_email, '')) = '' THEN
    RAISE EXCEPTION 'customer_email is required';
  END IF;

  IF p_shipping_address IS NULL OR jsonb_typeof(p_shipping_address) <> 'object' THEN
    RAISE EXCEPTION 'shipping_address must be a JSON object';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items must be a non-empty JSON array';
  END IF;

  INSERT INTO public.checkout_sessions (
    customer_email,
    shipping_address,
    status,
    subtotal_cents,
    shipping_cents,
    total_cents
  )
  VALUES (
    trim(p_customer_email),
    p_shipping_address,
    'open',
    0,
    0,
    0
  )
  RETURNING id, expires_at
  INTO v_session_id, v_expires_at;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each item quantity must be > 0';
    END IF;

    SELECT *
    INTO v_product
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND p.is_available = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found or unavailable: %', v_item->>'product_id';
    END IF;

    IF v_product.inventory_mode = 'finite' THEN
      IF (v_product.stock_quantity - v_product.reserved_quantity) < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %', v_product.id;
      END IF;

      UPDATE public.products p
      SET reserved_quantity = p.reserved_quantity + v_quantity
      WHERE p.id = v_product.id;

      INSERT INTO public.product_inventory_movements (
        product_id,
        delta,
        reason,
        note
      )
      VALUES (
        v_product.id,
        v_quantity,
        'checkout_reserve',
        concat('checkout_session:', v_session_id::text)
      );
    END IF;

    v_customization := coalesce(v_item->'customization', '{}'::jsonb);

    INSERT INTO public.checkout_session_items (
      checkout_session_id,
      product_id,
      quantity,
      unit_price_cents,
      product_snapshot,
      customization_json
    )
    VALUES (
      v_session_id,
      v_product.id,
      v_quantity,
      v_product.base_price_cents,
      jsonb_build_object(
        'id', v_product.id,
        'slug', v_product.slug,
        'name', v_product.name,
        'category', v_product.category,
        'base_price_cents', v_product.base_price_cents,
        'currency', v_product.currency
      ),
      v_customization
    );
  END LOOP;

  SELECT *
  INTO v_calc
  FROM public.recalculate_checkout_session_totals(v_session_id);

  checkout_session_id := v_session_id;
  status := 'open';
  expires_at := v_expires_at;
  subtotal_cents := v_calc.subtotal_cents;
  shipping_cents := v_calc.shipping_cents;
  total_cents := v_calc.total_cents;
  shipping_zone := v_calc.shipping_zone;
  free_shipping_applied := v_calc.free_shipping_applied;

  RETURN NEXT;
END;
$$;

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

  IF p_event_type NOT IN ('PAYMENT.CAPTURE.COMPLETED', 'CHECKOUT.ORDER.APPROVED') THEN
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
      'USD'
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

    v_capture_id := p_payload#>>'{resource,id}';

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
      nullif(v_capture_id, ''),
      'captured',
      v_checkout.total_cents,
      'USD',
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

CREATE OR REPLACE FUNCTION public.cancel_checkout_session(
  p_checkout_session_id uuid,
  p_mark_status public.checkout_session_status DEFAULT 'failed'
)
RETURNS TABLE (
  id uuid,
  status public.checkout_session_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.checkout_sessions%ROWTYPE;
  v_item record;
  v_reserved integer;
  v_release integer;
BEGIN
  IF p_mark_status NOT IN ('failed', 'expired') THEN
    RAISE EXCEPTION 'cancel status must be failed or expired';
  END IF;

  SELECT *
  INTO v_session
  FROM public.checkout_sessions cs
  WHERE cs.id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session % not found', p_checkout_session_id;
  END IF;

  IF v_session.status IN ('failed', 'expired', 'completed') THEN
    id := v_session.id;
    status := v_session.status;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT p.id AS product_id, p.inventory_mode, csi.quantity
    FROM public.checkout_session_items csi
    JOIN public.products p ON p.id = csi.product_id
    WHERE csi.checkout_session_id = p_checkout_session_id
  LOOP
    IF v_item.inventory_mode = 'finite' THEN
      SELECT p.reserved_quantity
      INTO v_reserved
      FROM public.products p
      WHERE p.id = v_item.product_id
      FOR UPDATE;

      v_release := LEAST(coalesce(v_reserved, 0), v_item.quantity);

      IF v_release > 0 THEN
        UPDATE public.products p
        SET reserved_quantity = p.reserved_quantity - v_release
        WHERE p.id = v_item.product_id;

        INSERT INTO public.product_inventory_movements (
          product_id,
          delta,
          reason,
          note
        )
        VALUES (
          v_item.product_id,
          -v_release,
          'checkout_release',
          concat('checkout_session:', p_checkout_session_id::text)
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.checkout_sessions cs
  SET status = p_mark_status
  WHERE cs.id = p_checkout_session_id;

  id := p_checkout_session_id;
  status := p_mark_status;
  RETURN NEXT;
END;
$$;

commit;
