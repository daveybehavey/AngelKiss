-- Checkout inventory lifecycle: expire stale holds, reconcile orphaned reservations.

CREATE OR REPLACE FUNCTION public.expire_stale_checkout_sessions()
RETURNS TABLE (
  session_id uuid,
  previous_status public.checkout_session_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_cancel record;
BEGIN
  FOR v_row IN
    SELECT cs.id, cs.status
    FROM public.checkout_sessions cs
    WHERE cs.status IN ('open', 'paypal_order_created')
      AND cs.expires_at < now()
    ORDER BY cs.expires_at ASC
  LOOP
    SELECT c.id, c.status
    INTO v_cancel
    FROM public.cancel_checkout_session(v_row.id, 'expired') AS c(id, status)
    LIMIT 1;

    session_id := v_row.id;
    previous_status := v_row.status;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_checkout_sessions IS
  'Marks past-due open/paypal checkout sessions as expired and releases finite inventory reservations.';

CREATE OR REPLACE FUNCTION public.reconcile_finite_product_reservations()
RETURNS TABLE (
  product_id uuid,
  previous_reserved integer,
  corrected_reserved integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_expected integer;
BEGIN
  FOR v_product IN
    SELECT p.id, p.reserved_quantity
    FROM public.products p
    WHERE p.inventory_mode = 'finite'
      AND p.deleted_at IS NULL
    FOR UPDATE OF p
  LOOP
    SELECT coalesce(sum(csi.quantity), 0)::integer
    INTO v_expected
    FROM public.checkout_session_items csi
    JOIN public.checkout_sessions cs ON cs.id = csi.checkout_session_id
    WHERE csi.product_id = v_product.id
      AND cs.status IN ('open', 'paypal_order_created');

    IF v_product.reserved_quantity IS DISTINCT FROM v_expected THEN
      UPDATE public.products p
      SET reserved_quantity = v_expected
      WHERE p.id = v_product.id;

      INSERT INTO public.product_inventory_movements (
        product_id,
        delta,
        reason,
        note
      )
      VALUES (
        v_product.id,
        v_expected - v_product.reserved_quantity,
        'manual_adjustment',
        'reconcile_finite_product_reservations'
      );

      product_id := v_product.id;
      previous_reserved := v_product.reserved_quantity;
      corrected_reserved := v_expected;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reconcile_finite_product_reservations IS
  'Sets reserved_quantity to the sum held by active checkout sessions (open / paypal_order_created).';
