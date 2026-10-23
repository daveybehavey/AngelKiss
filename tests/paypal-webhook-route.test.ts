import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/api/webhooks/paypal/route";

/**
 * Exercises the PayPal webhook route with the two HTTP layers it talks to
 * stubbed at `fetch`: PayPal (token + signature verification) and Supabase
 * REST (the process_paypal_webhook_event RPC). No live database or PayPal
 * account is involved.
 *
 * The behaviour pinned here: when PAYPAL_WEBHOOK_ID is not configured the
 * route must fail closed — an event whose signature cannot be verified
 * must never reach the finalization RPC. When it is configured and the
 * signature verifies, the event is processed exactly as before.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYPAL_ENV",
  "PAYPAL_SANDBOX_CLIENT_ID",
  "PAYPAL_SANDBOX_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID"
] as const;
const savedEnv = new Map<string, string | undefined>();
let originalFetch: typeof fetch;

const ORDER_ROW_ID = "22222222-2222-2222-2222-222222222222";
let rpcCallCount = 0;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

before(() => {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_SANDBOX_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_SANDBOX_CLIENT_SECRET = "test-client-secret";

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/v1/oauth2/token")) {
      return jsonResponse({ access_token: "test-token", token_type: "Bearer", expires_in: 3600 });
    }

    if (url.includes("/v1/notifications/verify-webhook-signature")) {
      return jsonResponse({ verification_status: "SUCCESS" });
    }

    if (url.includes("/rest/v1/rpc/process_paypal_webhook_event")) {
      rpcCallCount += 1;
      return jsonResponse([
        { processed: true, duplicate: false, order_id: ORDER_ROW_ID, message: "Processed" }
      ]);
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

async function postWebhook(
  withTransmissionHeaders: boolean
): Promise<{ status: number; body: Record<string, unknown> }> {
  rpcCallCount = 0;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withTransmissionHeaders) {
    headers["paypal-transmission-id"] = "transmission-1";
    headers["paypal-transmission-time"] = "2026-01-01T00:00:00Z";
    headers["paypal-transmission-sig"] = "test-signature";
    headers["paypal-cert-url"] = "https://api.sandbox.paypal.com/certs/test.pem";
    headers["paypal-auth-algo"] = "SHA256withRSA";
  }
  const request = new Request("http://localhost/api/webhooks/paypal", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "WH-TEST-EVENT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAPTURE123" }
    })
  });
  const response = await POST(request);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

test("an unconfigured webhook ID fails closed and never reaches the RPC", async () => {
  delete process.env.PAYPAL_WEBHOOK_ID;

  const { status, body } = await postWebhook(true);

  assert.equal(status, 500, "unconfigured webhook must return a server error");
  assert.match(String(body.error), /not configured/i);
  assert.equal(rpcCallCount, 0, "process_paypal_webhook_event must not run");
});

test("a configured webhook with a verified signature is processed as before", async () => {
  process.env.PAYPAL_WEBHOOK_ID = "test-webhook-id";

  const { status, body } = await postWebhook(true);

  assert.equal(status, 200);
  assert.equal(body.processed, true);
  assert.equal(body.orderId, ORDER_ROW_ID);
  assert.equal(rpcCallCount, 1, "process_paypal_webhook_event must run exactly once");
});
