begin;

CREATE OR REPLACE FUNCTION public.determine_shipping_zone(
  p_destination_country text,
  p_destination_province text,
  p_destination_city text
)
RETURNS public.shipping_zone
LANGUAGE plpgsql
STABLE
SET search_path = public
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
    RETURN 'usa'::public.shipping_zone;
  END IF;

  IF v_country <> 'CA' THEN
    RAISE EXCEPTION 'Destination country % is not supported in MVP shipping rules', p_destination_country;
  END IF;

  IF v_dest_province = upper(trim(v_origin.province_code))
     AND v_dest_city <> ''
     AND v_dest_city = upper(trim(v_origin.city)) THEN
    RETURN 'local'::public.shipping_zone;
  END IF;

  IF v_dest_province = upper(trim(v_origin.province_code)) THEN
    RETURN 'regional'::public.shipping_zone;
  END IF;

  RETURN 'national'::public.shipping_zone;
END;
$$;

commit;
