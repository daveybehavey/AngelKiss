import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { createPayPalOrder } from "@/lib/paypal/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutSessionRow = {
  id: string;
  status: "open" | "paypal_order_created" | "completed" | "expired" | "failed";
  paypal_order_id: string | null;
  total_cents: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestMeta = getRequestMeta(request);

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();

    const { data: session, error: sessionError } = await supabase
      .from("checkout_sessions")
      .select("id,status,paypal_order_id,total_cents")
      .eq("id", id)
      .maybeSingle();

    if (sessionError) {
      logWarn("checkout.paypal_order.create.fetch_failed", {
        ...requestMeta,
        checkoutSessionId: id,
        message: sessionError.message
      });
      return badRequest(sessionError.message);
    }

    const checkout = (session as CheckoutSessionRow | null) ?? null;
    if (!checkout) {
      logWarn("checkout.paypal_order.create.not_found", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("Checkout session not found");
    }

    if (checkout.status === "completed") {
      logWarn("checkout.paypal_order.create.already_completed", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("Checkout session already completed");
    }

    if (checkout.status === "failed" || checkout.status === "expired") {
      logWarn("checkout.paypal_order.create.invalid_status", {
        ...requestMeta,
        checkoutSessionId: id,
        status: checkout.status
      });
      return badRequest(`Checkout session is ${checkout.status}`);
    }

    if (checkout.paypal_order_id && checkout.paypal_order_id.trim().length > 0) {
      return NextResponse.json(
        {
          checkoutSessionId: checkout.id,
          paypalOrderId: checkout.paypal_order_id,
          reused: true
        },
        { status: 200 }
      );
    }

    const paypalOrder = await createPayPalOrder({
      checkoutSessionId: checkout.id,
      totalCents: checkout.total_cents,
      currencyCode: "CAD"
    });

    // Conditional write: the PayPal create above is a slow external call, and
    // a concurrent transition (webhook completion, expiry/failure, or a
    // competing create) can land while it is in flight. Only claim the
    // session if it is still in a non-terminal state with no PayPal order
    // attached — terminal states and an already-recorded order win, so this
    // create can never resurrect or overwrite them.
    const { data: claimed, error: updateError } = await supabase
      .from("checkout_sessions")
      .update({
        paypal_order_id: paypalOrder.id,
        status: "paypal_order_created"
      })
      .eq("id", checkout.id)
      .is("paypal_order_id", null)
      .in("status", ["open", "paypal_order_created"])
      .select("id");

    if (updateError) {
      logWarn("checkout.paypal_order.create.update_failed", {
        ...requestMeta,
        checkoutSessionId: id,
        message: updateError.message
      });
      return badRequest(updateError.message);
    }

    if (!claimed || claimed.length === 0) {
      // The session changed underneath us; the PayPal order just created is
      // orphaned (nothing references it, so it can never be captured).
      // Re-read and answer from the winning state.
      const { data: current, error: refetchError } = await supabase
        .from("checkout_sessions")
        .select("id,status,paypal_order_id,total_cents")
        .eq("id", checkout.id)
        .maybeSingle();

      const winner = (current as CheckoutSessionRow | null) ?? null;
      logWarn("checkout.paypal_order.create.race_lost", {
        ...requestMeta,
        checkoutSessionId: id,
        orphanedPaypalOrderId: paypalOrder.id,
        winnerStatus: winner?.status ?? null,
        message: refetchError?.message
      });

      // Terminal status is checked before the recorded order, mirroring
      // the initial fetch: a session that completed, failed, or expired
      // after a competing create attached its order must not send the
      // customer through approval for a dead checkout.
      if (winner?.status === "completed") {
        return badRequest("Checkout session already completed");
      }

      if (winner?.status === "failed" || winner?.status === "expired") {
        return badRequest(`Checkout session is ${winner.status}`);
      }

      if (winner?.paypal_order_id && winner.paypal_order_id.trim().length > 0) {
        return NextResponse.json(
          {
            checkoutSessionId: winner.id,
            paypalOrderId: winner.paypal_order_id,
            reused: true
          },
          { status: 200 }
        );
      }

      return badRequest("Checkout session changed while creating the PayPal order");
    }

    return NextResponse.json(
      {
        checkoutSessionId: checkout.id,
        paypalOrderId: paypalOrder.id,
        status: paypalOrder.status
      },
      { status: 200 }
    );
  } catch (error) {
    logError("checkout.paypal_order.create.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error creating PayPal order",
      error instanceof Error ? error.message : error
    );
  }
}
