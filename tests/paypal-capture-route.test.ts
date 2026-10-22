import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/api/checkout/sessions/[id]/paypal-order/capture/route";

/**
 * Exercises the PayPal capture route end to end with the two HTTP layers it
 * talks to stubbed at `fetch`: PayPal (token + capture) and Supabase REST
 * (checkout session lookup, finalization RPC, order lookup). No live
 * database or PayPal account is involved.
 *
 * The behaviour pinned here: only a verified COMPLETED capture that the
 * finalization RPC accepts may be reported as success (HTTP 200 with
 * `finalized: true`). A pending / declined / missing capture, or a capture
 * the RPC refuses to finalize, must come back as a non-success status so
 * the checkout never marks the order complete or clears the cart for an
 * unverified payment.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYPAL_ENV",
  "PAYPAL_SANDBOX_CLIENT_ID",
  "PAYPAL_SANDBOX_CLIENT_SECRET"
] as const;
const savedEnv = new Map<string, string | undefined>();
let originalFetch: typeof fetch;

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_ROW_ID = "22222222-2222-2222-2222-222222222222";

let captureResponseBody: unknown = null;
let rpcRows: unknown = null;
let rpcCallCount = 0;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function captureBodyWithStatus(captureStatus: string): unknown {
  return {
    id: "ORDER123",
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: "CAPTURE123",
              status: captureStatus,
              amount: { value: "50.00", currency_code: "CAD" }
            }
          ]
        }
      }
    ]
  };
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

    if (url.includes("/v2/checkout/orders/") && url.endsWith("/capture")) {
      return jsonResponse(captureResponseBody);
    }

    if (url.includes("/rest/v1/checkout_sessions")) {
      return jsonResponse({
        id: SESSION_ID,
        status: "paypal_order_created",
        paypal_order_id: "ORDER123"
      });
    }

    if (url.includes("/rest/v1/rpc/process_paypal_webhook_event")) {
      rpcCallCount += 1;
      return jsonResponse(rpcRows);
    }

    if (url.includes("/rest/v1/orders")) {
      return jsonResponse({ id: ORDER_ROW_ID, order_number: 1042 });
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

async function postCapture(): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request(
    `http://localhost/api/checkout/sessions/${SESSION_ID}/paypal-order/capture`,
    { method: "POST" }
  );
  const response = await POST(request, { params: Promise.resolve({ id: SESSION_ID }) });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

test("a pending capture is not reported as a successful payment", async () => {
  rpcCallCount = 0;
  captureResponseBody = captureBodyWithStatus("PENDING");
  rpcRows = null;

  const { status, body } = await postCapture();

  assert.notEqual(status, 200, "pending capture must not return HTTP 200");
  assert.equal(body.finalized, false);
  assert.equal(typeof body.error, "string");
  assert.equal(rpcCallCount, 0, "finalization RPC must not run for a pending capture");
});

test("a declined capture is not reported as a successful payment", async () => {
  rpcCallCount = 0;
  captureResponseBody = captureBodyWithStatus("DECLINED");
  rpcRows = null;

  const { status, body } = await postCapture();

  assert.notEqual(status, 200, "declined capture must not return HTTP 200");
  assert.equal(body.finalized, false);
  assert.equal(rpcCallCount, 0);
});

test("a capture response with no capture at all is not reported as a successful payment", async () => {
  rpcCallCount = 0;
  captureResponseBody = { id: "ORDER123", status: "COMPLETED", links: [] };
  rpcRows = null;

  const { status, body } = await postCapture();

  assert.notEqual(status, 200, "missing capture must not return HTTP 200");
  assert.equal(body.finalized, false);
  assert.equal(rpcCallCount, 0);
});

test("a verified completed capture that the RPC finalizes returns success", async () => {
  rpcCallCount = 0;
  captureResponseBody = captureBodyWithStatus("COMPLETED");
  rpcRows = [{ processed: true, duplicate: false, order_id: ORDER_ROW_ID, message: "Processed" }];

  const { status, body } = await postCapture();

  assert.equal(status, 200);
  assert.equal(body.finalized, true);
  assert.equal(body.orderId, ORDER_ROW_ID);
  assert.equal(body.orderNumber, "1042");
  assert.equal(rpcCallCount, 1);
});

test("a completed capture the RPC refuses to finalize is not reported as success", async () => {
  rpcCallCount = 0;
  captureResponseBody = captureBodyWithStatus("COMPLETED");
  rpcRows = [
    { processed: false, duplicate: false, order_id: null, message: "Captured amount mismatch" }
  ];

  const { status, body } = await postCapture();

  assert.notEqual(status, 200, "unfinalized capture must not return HTTP 200");
  assert.equal(body.finalized, false);
  assert.equal(rpcCallCount, 1);
});
