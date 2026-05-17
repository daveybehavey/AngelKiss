import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/** Expire past-due checkout sessions and release their inventory holds. */
export async function expireStaleCheckoutSessions(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("expire_stale_checkout_sessions");

  if (error) {
    throw new Error(error.message || "expire_stale_checkout_sessions failed");
  }

  return Array.isArray(data) ? data.length : 0;
}

/** Align reserved_quantity with active checkout holds (repair orphaned reservations). */
export async function reconcileFiniteProductReservations(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("reconcile_finite_product_reservations");

  if (error) {
    throw new Error(error.message || "reconcile_finite_product_reservations failed");
  }

  return Array.isArray(data) ? data.length : 0;
}
