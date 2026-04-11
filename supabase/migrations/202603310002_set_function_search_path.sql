begin;

-- Security hardening: make function lookup deterministic by pinning search_path.
-- This addresses Supabase Security Advisor warning:
-- "function_search_path_mutable".

ALTER FUNCTION public.is_valid_order_status_transition(public.order_status, public.order_status)
  SET search_path = public;

ALTER FUNCTION public.enforce_order_status_transition()
  SET search_path = public;

ALTER FUNCTION public.normalize_country_code(text)
  SET search_path = public;

ALTER FUNCTION public.assert_product_category_match()
  SET search_path = public;

ALTER FUNCTION public.set_updated_at()
  SET search_path = public;

ALTER FUNCTION public.adjust_product_inventory(uuid, integer, public.inventory_movement_reason, text, uuid)
  SET search_path = public;

ALTER FUNCTION public.determine_shipping_zone(text, text, text)
  SET search_path = public;

ALTER FUNCTION public.find_shipping_rate(public.shipping_zone)
  SET search_path = public;

ALTER FUNCTION public.calculate_shipping_for_checkout(integer, text, text, text)
  SET search_path = public;

ALTER FUNCTION public.trg_recalculate_checkout_totals_from_items()
  SET search_path = public;

ALTER FUNCTION public.trg_recalculate_checkout_totals_from_address()
  SET search_path = public;

commit;
