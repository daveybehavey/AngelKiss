-- Fix ambiguous `expires_at` reference in create_checkout_session function.

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

  INSERT INTO public.checkout_sessions AS cs (
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
  RETURNING cs.id, cs.expires_at
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

commit;
