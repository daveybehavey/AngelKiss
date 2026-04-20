import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { verifyPayPalWebhookSignature } from "@/lib/paypal/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getTransmissionHeaders(request: Request): {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
} | null {
  const transmissionId = request.headers.get("paypal-transmission-id")?.trim();
  const transmissionTime = request.headers.get("paypal-transmission-time")?.trim();
  const transmissionSig = request.headers.get("paypal-transmission-sig")?.trim();
  const certUrl = request.headers.get("paypal-cert-url")?.trim();
  const authAlgo = request.headers.get("paypal-auth-algo")?.trim();

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return null;
  }

  return { transmissionId, transmissionTime, transmissionSig, certUrl, authAlgo };
}

export async function POST(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    const rawBody = await request.text();
    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      logWarn("webhook.paypal.invalid_json", { ...requestMeta });
      return badRequest("Invalid JSON body");
    }

    const payloadRecord = asRecord(payload);
    const eventId =
      payloadRecord && typeof payloadRecord.id === "string" ? payloadRecord.id : null;
    const eventType =
      payloadRecord && typeof payloadRecord.event_type === "string"
        ? payloadRecord.event_type
        : null;

    if (!eventId || !eventType || !payloadRecord) {
      logWarn("webhook.paypal.invalid_payload", {
        ...requestMeta
      });
      return badRequest("PayPal payload must include id and event_type");
    }

    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (webhookId) {
      const headers = getTransmissionHeaders(request);
      if (!headers) {
        logWarn("webhook.paypal.missing_transmission_headers", {
          ...requestMeta,
          eventId,
          eventType
        });
        return badRequest("Missing required PayPal transmission headers");
      }

      try {
        const verification = await verifyPayPalWebhookSignature({
          ...headers,
          webhookId,
          webhookEvent: payloadRecord
        });

        if (verification.verification_status !== "SUCCESS") {
          logWarn("webhook.paypal.signature_not_verified", {
            ...requestMeta,
            eventId,
            eventType,
            verification_status: verification.verification_status
          });
          return unauthorized("PayPal webhook signature verification failed");
        }
      } catch (verifyError) {
        logError("webhook.paypal.verify_request_failed", verifyError, {
          ...requestMeta,
          eventId,
          eventType
        });
        return serverError(
          "PayPal webhook verification request failed",
          verifyError instanceof Error ? verifyError.message : verifyError
        );
      }
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("process_paypal_webhook_event", {
      p_paypal_event_id: eventId,
      p_event_type: eventType,
      p_payload: payloadRecord
    });

    if (error) {
      logWarn("webhook.paypal.rpc_rejected", {
        ...requestMeta,
        eventId,
        eventType,
        message: error.message
      });
      return badRequest(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      logError("webhook.paypal.rpc_empty_result", new Error("No webhook result row"), {
        ...requestMeta,
        eventId,
        eventType
      });
      return serverError("Webhook processing returned no result");
    }

    return NextResponse.json(
      {
        processed: row.processed,
        duplicate: row.duplicate,
        orderId: row.order_id,
        message: row.message
      },
      { status: 200 }
    );
  } catch (error) {
    logError("webhook.paypal.unhandled", error, requestMeta);
    return serverError(
      "Unexpected webhook processing error",
      error instanceof Error ? error.message : error
    );
  }
}
