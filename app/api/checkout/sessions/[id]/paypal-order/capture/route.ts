import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { capturePayPalOrder, extractCaptureId } from "@/lib/paypal/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutSessionRow = {
  id: string;
  status: "open" | "paypal_order_created" | "completed" | "expired" | "failed";
  paypal_order_id: string | null;
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
      .select("id,status,paypal_order_id")
      .eq("id", id)
      .maybeSingle();

    if (sessionError) {
      logWarn("checkout.paypal_order.capture.fetch_failed", {
        ...requestMeta,
        checkoutSessionId: id,
        message: sessionError.message
      });
      return badRequest(sessionError.message);
    }

    const checkout = (session as CheckoutSessionRow | null) ?? null;
    if (!checkout) {
      logWarn("checkout.paypal_order.capture.not_found", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("Checkout session not found");
    }

    if (checkout.status === "completed") {
      const { data: order } = await supabase
        .from("orders")
        .select("id,order_number,status")
        .eq("checkout_session_id", checkout.id)
        .maybeSingle();

      return NextResponse.json(
        {
          checkoutSessionId: checkout.id,
          alreadyCompleted: true,
          order: order ?? null
        },
        { status: 200 }
      );
    }

    if (checkout.status === "failed" || checkout.status === "expired") {
      logWarn("checkout.paypal_order.capture.invalid_status", {
        ...requestMeta,
        checkoutSessionId: id,
        status: checkout.status
      });
      return badRequest(`Checkout session is ${checkout.status}`);
    }

    if (!checkout.paypal_order_id) {
      logWarn("checkout.paypal_order.capture.missing_paypal_order", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("No PayPal order attached to this checkout session");
    }

    const captureResult = await capturePayPalOrder(checkout.paypal_order_id);
    const captureId = extractCaptureId(captureResult) ?? `manual-${checkout.paypal_order_id}-${Date.now()}`;

    const syntheticPayload = {
      id: captureId,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: captureId,
        supplementary_data: {
          related_ids: {
            order_id: checkout.paypal_order_id
          }
        }
      }
    };

    const { data: webhookResult, error: webhookError } = await supabase.rpc("process_paypal_webhook_event", {
      p_paypal_event_id: `manual_capture_${captureId}`,
      p_event_type: "PAYMENT.CAPTURE.COMPLETED",
      p_payload: syntheticPayload
    });

    if (webhookError) {
      logError("checkout.paypal_order.capture.finalization_failed", webhookError, {
        ...requestMeta,
        checkoutSessionId: id,
        paypalOrderId: checkout.paypal_order_id
      });
      return serverError("PayPal captured but order finalization failed", webhookError.message);
    }

    const row = Array.isArray(webhookResult) ? webhookResult[0] : null;

    return NextResponse.json(
      {
        checkoutSessionId: checkout.id,
        paypalOrderId: checkout.paypal_order_id,
        paypalStatus: captureResult.status,
        finalized: row?.processed ?? false,
        orderId: row?.order_id ?? null,
        message: row?.message ?? null
      },
      { status: 200 }
    );
  } catch (error) {
    logError("checkout.paypal_order.capture.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error capturing PayPal order",
      error instanceof Error ? error.message : error
    );
  }
}
