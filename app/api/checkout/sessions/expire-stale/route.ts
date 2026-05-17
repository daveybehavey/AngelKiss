import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError } from "@/lib/observability/log";
import {
  expireStaleCheckoutSessions,
  reconcileFiniteProductReservations
} from "@/lib/server/checkout-inventory";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/checkout/sessions/expire-stale
 * Optional header `x-checkout-maintenance-secret` must match CHECKOUT_MAINTENANCE_SECRET when set.
 */
export async function POST(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    const expected = process.env.CHECKOUT_MAINTENANCE_SECRET?.trim();
    if (expected) {
      const provided = request.headers.get("x-checkout-maintenance-secret")?.trim() ?? "";
      if (provided !== expected) {
        return badRequest("Unauthorized");
      }
    }

    const expiredCount = await expireStaleCheckoutSessions();
    const reconciledCount = await reconcileFiniteProductReservations();

    return NextResponse.json(
      {
        expiredSessions: expiredCount,
        reconciledProducts: reconciledCount
      },
      { status: 200 }
    );
  } catch (error) {
    logError("checkout.expire_stale.unhandled", error, requestMeta);
    return serverError(
      "Failed to expire stale checkout sessions",
      error instanceof Error ? error.message : error
    );
  }
}
