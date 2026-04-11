-- AngelKiss simple shipping zones + checkout shipping logic (logic-first MVP)

begin;

-- 1) Simple shipping configuration tables
DO $$ BEGIN
  CREATE TYPE public.shipping_zone AS ENUM ('local', 'regional', 'national', 'usa');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.store_shipping_origin (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  country_code char(2) NOT NULL DEFAULT 'CA' CHECK (country_code = upper(country_code)),
  province_code text NOT NULL DEFAULT 'BC',
  city text NOT NULL DEFAULT 'Sooke',
  postal_code text NOT NULL DEFAULT 'V9Z0V1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_store_shipping_origin_updated_at ON public.store_shipping_origin;
CREATE TRIGGER trg_store_shipping_origin_updated_at
BEFORE UPDATE ON public.store_shipping_origin
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.store_shipping_origin (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shipping_rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone public.shipping_zone NOT NULL,
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = upper(currency)),
  is_active boolean NOT NULL DEFAULT true,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_rules_lookup
  ON public.shipping_rate_rules (zone, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_shipping_rate_rules_updated_at ON public.shipping_rate_rules;
CREATE TRIGGER trg_shipping_rate_rules_updated_at
BEFORE UPDATE ON public.shipping_rate_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Simple launch defaults (no weight tiers)
INSERT INTO public.shipping_rate_rules (
  zone,
  shipping_cents,
  currency,
  is_active,
  label,
  sort_order
)
VALUES
  ('local',    2100, 'USD', true, 'Local shipping', 10),
  ('regional', 2100, 'USD', true, 'Regional shipping', 20),
  ('national', 3100, 'USD', true, 'Across Canada shipping', 30),
  ('usa',      2700, 'USD', true, 'USA tracked shipping', 40)
ON CONFLICT (zone) DO NOTHING;

-- 2) Shipping calculation functions
CREATE OR REPLACE FUNCTION public.normalize_country_code(p_country text)
RETURNS char(2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(trim(coalesce(p_country, '')));
BEGIN
  IF v IN ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN
    RETURN 'US';
  ELSIF v IN ('CA', 'CAN', 'CANADA') THEN
    RETURN 'CA';
  ELSIF length(v) = 2 THEN
    RETURN v::char(2);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.determine_shipping_zone(
  p_destination_country text,
  p_destination_province text,
  p_destination_city text
)
RETURNS public.shipping_zone
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_country char(2);
  v_origin public.store_shipping_origin%ROWTYPE;
  v_dest_province text := upper(trim(coalesce(p_destination_province, '')));
  v_dest_city text := upper(trim(coalesce(p_destination_city, '')));
BEGIN
  SELECT *
  INTO v_origin
  FROM public.store_shipping_origin
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store shipping origin is not configured';
  END IF;

  v_country := public.normalize_country_code(p_destination_country);

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Destination country is required for shipping';
  END IF;

  IF v_country = 'US' THEN
    RETURN 'usa';
  END IF;

  IF v_country <> 'CA' THEN
    RAISE EXCEPTION 'Destination country % is not supported in MVP shipping rules', p_destination_country;
  END IF;

  IF v_dest_province = upper(trim(v_origin.province_code))
     AND v_dest_city <> ''
     AND v_dest_city = upper(trim(v_origin.city)) THEN
    RETURN 'local';
  END IF;

  IF v_dest_province = upper(trim(v_origin.province_code)) THEN
    RETURN 'regional';
  END IF;

  RETURN 'national';
END;
$$;

CREATE OR REPLACE FUNCTION public.find_shipping_rate(
  p_zone public.shipping_zone
)
RETURNS TABLE (
  rule_id uuid,
  shipping_cents integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id, r.shipping_cents
  FROM public.shipping_rate_rules r
  WHERE r.zone = p_zone
    AND r.is_active = true
  ORDER BY r.sort_order ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.calculate_shipping_for_checkout(
  p_subtotal_cents integer,
  p_destination_country text,
  p_destination_province text,
  p_destination_city text
)
RETURNS TABLE (
  shipping_zone public.shipping_zone,
  shipping_cents integer,
  free_shipping_applied boolean,
  matched_rule_id uuid
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings public.store_settings%ROWTYPE;
BEGIN
  IF p_subtotal_cents < 0 THEN
    RAISE EXCEPTION 'Subtotal cannot be negative';
  END IF;

  SELECT *
  INTO v_settings
  FROM public.store_settings
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store settings row is missing';
  END IF;

  shipping_zone := public.determine_shipping_zone(
    p_destination_country,
    p_destination_province,
    p_destination_city
  );

  IF v_settings.free_shipping_enabled = true
     AND p_subtotal_cents >= v_settings.free_shipping_threshold_cents THEN
    shipping_cents := 0;
    free_shipping_applied := true;
    matched_rule_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT r.rule_id, r.shipping_cents
  INTO matched_rule_id, shipping_cents
  FROM public.find_shipping_rate(shipping_zone) r;

  IF matched_rule_id IS NULL THEN
    RAISE EXCEPTION 'No active shipping rate found for zone %', shipping_zone;
  END IF;

  free_shipping_applied := false;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_checkout_session_totals(
  p_checkout_session_id uuid
)
RETURNS TABLE (
  checkout_session_id uuid,
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
  v_shipping_address jsonb;
  v_subtotal integer := 0;
  v_country text;
  v_province text;
  v_city text;
  v_calc record;
BEGIN
  SELECT
    cs.shipping_address,
    COALESCE(SUM(csi.quantity * csi.unit_price_cents), 0)
  INTO
    v_shipping_address,
    v_subtotal
  FROM public.checkout_sessions cs
  LEFT JOIN public.checkout_session_items csi
    ON csi.checkout_session_id = cs.id
  WHERE cs.id = p_checkout_session_id
  GROUP BY cs.id, cs.shipping_address;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session % not found', p_checkout_session_id;
  END IF;

  v_country := COALESCE(
    v_shipping_address->>'country_code',
    v_shipping_address->>'countryCode',
    v_shipping_address->>'country'
  );

  v_province := COALESCE(
    v_shipping_address->>'province_code',
    v_shipping_address->>'provinceCode',
    v_shipping_address->>'province',
    v_shipping_address->>'state_code',
    v_shipping_address->>'state'
  );

  v_city := COALESCE(
    v_shipping_address->>'city',
    v_shipping_address->>'locality',
    ''
  );

  SELECT *
  INTO v_calc
  FROM public.calculate_shipping_for_checkout(
    v_subtotal,
    v_country,
    v_province,
    v_city
  );

  UPDATE public.checkout_sessions cs
  SET subtotal_cents = v_subtotal,
      shipping_cents = v_calc.shipping_cents,
      total_cents = v_subtotal + v_calc.shipping_cents
  WHERE cs.id = p_checkout_session_id;

  checkout_session_id := p_checkout_session_id;
  subtotal_cents := v_subtotal;
  shipping_cents := v_calc.shipping_cents;
  total_cents := v_subtotal + v_calc.shipping_cents;
  shipping_zone := v_calc.shipping_zone;
  free_shipping_applied := v_calc.free_shipping_applied;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_checkout_totals_from_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_checkout_session_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_checkout_session_id := OLD.checkout_session_id;
  ELSE
    v_checkout_session_id := NEW.checkout_session_id;
  END IF;

  PERFORM public.recalculate_checkout_session_totals(v_checkout_session_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkout_items_recalculate_totals ON public.checkout_session_items;
CREATE TRIGGER trg_checkout_items_recalculate_totals
AFTER INSERT OR UPDATE OF quantity, unit_price_cents OR DELETE
ON public.checkout_session_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_checkout_totals_from_items();

CREATE OR REPLACE FUNCTION public.trg_recalculate_checkout_totals_from_address()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.shipping_address IS DISTINCT FROM OLD.shipping_address THEN
    PERFORM public.recalculate_checkout_session_totals(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkout_address_recalculate_totals ON public.checkout_sessions;
CREATE TRIGGER trg_checkout_address_recalculate_totals
AFTER UPDATE OF shipping_address
ON public.checkout_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_checkout_totals_from_address();

-- 3) RLS for new config tables
ALTER TABLE public.store_shipping_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping origin" ON public.store_shipping_origin;
CREATE POLICY "Public read shipping origin"
ON public.store_shipping_origin
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins manage shipping origin" ON public.store_shipping_origin;
CREATE POLICY "Admins manage shipping origin"
ON public.store_shipping_origin
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read active shipping rate rules" ON public.shipping_rate_rules;
CREATE POLICY "Public read active shipping rate rules"
ON public.shipping_rate_rules
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage shipping rate rules" ON public.shipping_rate_rules;
CREATE POLICY "Admins manage shipping rate rules"
ON public.shipping_rate_rules
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

commit;
