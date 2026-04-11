import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function transmissionHeadersPresent(request: Request): boolean {
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");

  return Boolean(transmissionId && transmissionTime && transmissionSig && certUrl && authAlgo);
}

export async function POST(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    const payload: unknown = await request.json();
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

    // Minimal safety check for MVP:
    // if webhook id env is configured, require transmission headers to be present.
    // Full cryptographic verification is the next hardening step.
    if (process.env.PAYPAL_WEBHOOK_ID && !transmissionHeadersPresent(request)) {
      logWarn("webhook.paypal.missing_transmission_headers", {
        ...requestMeta,
        eventId,
        eventType
      });
      return badRequest("Missing required PayPal transmission headers");
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
