-- Promo codes for checkout (e.g. live PayPal test with minimal charge).

begin;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_percent integer NOT NULL CHECK (discount_percent >= 1 AND discount_percent <= 100),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_normalized CHECK (code = upper(trim(code)))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_codes_code ON public.promo_codes (code);

ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS promo_code text,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code text,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);

CREATE OR REPLACE FUNCTION public.apply_promo_code_to_checkout(
  p_checkout_session_id uuid,
  p_promo_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_promo public.promo_codes%ROWTYPE;
  v_subtotal integer;
  v_shipping integer;
  v_gross integer;
  v_discount integer;
  v_new_total integer;
BEGIN
  v_code := upper(trim(coalesce(p_promo_code, '')));
  IF v_code = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_promo
  FROM public.promo_codes pc
  WHERE pc.code = v_code
    AND pc.active = true
    AND (pc.expires_at IS NULL OR pc.expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired promo code';
  END IF;

  SELECT cs.subtotal_cents, cs.shipping_cents
  INTO v_subtotal, v_shipping
  FROM public.checkout_sessions cs
  WHERE cs.id = p_checkout_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session % not found', p_checkout_session_id;
  END IF;

  v_gross := v_subtotal + v_shipping;
  v_discount := floor(v_gross::numeric * v_promo.discount_percent / 100)::integer;
  IF v_discount > v_gross THEN
    v_discount := v_gross;
  END IF;

  -- PayPal requires a positive amount; keep at least one cent when a promo is used.
  v_new_total := greatest(1, v_gross - v_discount);

  UPDATE public.checkout_sessions cs
  SET
    promo_code = v_code,
    discount_cents = v_gross - v_new_total,
    total_cents = v_new_total
  WHERE cs.id = p_checkout_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_checkout_session(
  p_customer_email text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_promo_code text DEFAULT NULL
)
RETURNS TABLE (
  checkout_session_id uuid,
  status public.checkout_session_status,
  expires_at timestamptz,
  subtotal_cents integer,
  shipping_cents integer,
  discount_cents integer,
  promo_code text,
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
  v_discount integer := 0;
  v_promo text := NULL;
  v_total integer;
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
    total_cents,
    promo_code,
    discount_cents
  )
  VALUES (
    trim(p_customer_email),
    p_shipping_address,
    'open',
    0,
    0,
    0,
    NULL,
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

  IF p_promo_code IS NOT NULL AND trim(p_promo_code) <> '' THEN
    PERFORM public.apply_promo_code_to_checkout(v_session_id, p_promo_code);
  END IF;

  SELECT cs.discount_cents, cs.promo_code, cs.total_cents
  INTO v_discount, v_promo, v_total
  FROM public.checkout_sessions cs
  WHERE cs.id = v_session_id;

  checkout_session_id := v_session_id;
  status := 'open';
  expires_at := v_expires_at;
  subtotal_cents := v_calc.subtotal_cents;
  shipping_cents := v_calc.shipping_cents;
  discount_cents := coalesce(v_discount, 0);
  promo_code := v_promo;
  total_cents := coalesce(v_total, v_calc.total_cents);
  shipping_zone := v_calc.shipping_zone;
  free_shipping_applied := v_calc.free_shipping_applied;

  RETURN NEXT;
END;
$$;

INSERT INTO public.promo_codes (code, discount_percent, active, description)
VALUES (
  'ANGELTEST',
  99,
  true,
  'Live checkout test: 99% off (minimum charge $0.01 CAD)'
)
ON CONFLICT (code) DO UPDATE
SET
  discount_percent = EXCLUDED.discount_percent,
  active = EXCLUDED.active,
  description = EXCLUDED.description;

commit;
