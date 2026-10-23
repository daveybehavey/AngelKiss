import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { capturePayPalOrder, extractCaptureDetails } from "@/lib/paypal/api";
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

      const orderNumber =
        order && typeof order.order_number === "number" ? String(order.order_number) : null;

      return NextResponse.json(
        {
          checkoutSessionId: checkout.id,
          paypalOrderId: checkout.paypal_order_id ?? "",
          paypalStatus: "COMPLETED",
          finalized: true,
          orderId: order?.id ?? null,
          orderNumber,
          message:
            "Your payment was already received. Here is your order reference—save it in case you need to contact us.",
          alreadyCompleted: true
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
    const capture = extractCaptureDetails(captureResult);

    // Only a completed capture may finalize the order. Anything else (order
    // still pending, capture pending/declined, no capture in the response)
    // leaves the checkout untouched; a real PAYMENT.CAPTURE.COMPLETED webhook
    // will finalize it if the capture later completes. This is a non-success
    // response (409): the checkout must not treat an unverified payment as a
    // completed order or clear the cart for it.
    if (!capture || captureResult.status !== "COMPLETED" || capture.status !== "COMPLETED") {
      logWarn("checkout.paypal_order.capture.not_completed", {
        ...requestMeta,
        checkoutSessionId: id,
        paypalOrderId: checkout.paypal_order_id,
        paypalStatus: captureResult.status,
        captureStatus: capture?.status ?? null
      });
      const message =
        "Your payment has not completed yet. If PayPal shows the payment as pending, your order will be confirmed automatically once it clears.";
      return NextResponse.json(
        {
          checkoutSessionId: checkout.id,
          paypalOrderId: checkout.paypal_order_id,
          paypalStatus: captureResult.status,
          finalized: false,
          orderId: null,
          orderNumber: null,
          message,
          error: message,
          alreadyCompleted: false
        },
        { status: 409 }
      );
    }

    const captureId = capture.captureId;

    // Mirror the resource shape of a real PAYMENT.CAPTURE.COMPLETED webhook so
    // the RPC verifies the actually-captured amount and currency against the
    // checkout session instead of finalizing on ids alone.
    const syntheticPayload = {
      id: captureId,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: captureId,
        status: capture.status,
        amount: {
          value: capture.amountValue,
          currency_code: capture.currencyCode
        },
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

    let orderNumber: string | null = null;
    const createdOrderId = row?.order_id ?? null;
    if (createdOrderId) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", createdOrderId)
        .maybeSingle();
      if (orderRow && typeof orderRow.order_number === "number") {
        orderNumber = String(orderRow.order_number);
      }
    }

    const finalized = row?.processed ?? false;

    // The capture completed at PayPal but the finalization RPC refused it
    // (for example the captured amount or currency did not match the
    // session; the RPC records the reason in processing_error). No order
    // exists, so this must not be reported as success: the checkout keeps
    // the cart and shows the error instead of a confirmation.
    if (!finalized) {
      logError(
        "checkout.paypal_order.capture.finalization_rejected",
        new Error(row?.message ?? "process_paypal_webhook_event did not process the capture"),
        {
          ...requestMeta,
          checkoutSessionId: id,
          paypalOrderId: checkout.paypal_order_id,
          captureId
        }
      );
      const message =
        "Payment captured; our system is still finalizing your order. Email us if anything looks wrong.";
      return NextResponse.json(
        {
          checkoutSessionId: checkout.id,
          paypalOrderId: checkout.paypal_order_id,
          paypalStatus: captureResult.status,
          finalized: false,
          orderId: createdOrderId,
          orderNumber,
          message: row?.message ?? message,
          error: message,
          alreadyCompleted: false
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        checkoutSessionId: checkout.id,
        paypalOrderId: checkout.paypal_order_id,
        paypalStatus: captureResult.status,
        finalized: true,
        orderId: createdOrderId,
        orderNumber,
        message: orderNumber ? null : "Your order is confirmed.",
        alreadyCompleted: false
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
