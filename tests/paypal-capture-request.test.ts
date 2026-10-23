import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { capturePayPalOrder, extractCaptureDetails } from "../lib/paypal/api";

/**
 * Pins the capture request shape against PayPal's representation rules.
 *
 * PayPal's capture endpoint answers with a minimal representation (id,
 * status, links — no purchase_units) unless the request asks for the full
 * representation with `Prefer: return=representation`. The capture route
 * verifies the payment from `purchase_units[].payments.captures[]`, so a
 * minimal response makes a successful capture look like no capture at all.
 * The fetch stub below emulates that PayPal behaviour: full body only when
 * the Prefer header is sent.
 */

const ENV_KEYS = ["PAYPAL_ENV", "PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET"] as const;
const savedEnv = new Map<string, string | undefined>();
let originalFetch: typeof fetch;
let captureRequestHeaders: Record<string, string> | null = null;

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
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_SANDBOX_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_SANDBOX_CLIENT_SECRET = "test-client-secret";

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/v1/oauth2/token")) {
      return jsonResponse({ access_token: "test-token", token_type: "Bearer", expires_in: 3600 });
    }

    if (url.includes("/v2/checkout/orders/") && url.endsWith("/capture")) {
      captureRequestHeaders = (init?.headers ?? {}) as Record<string, string>;
      if (captureRequestHeaders["Prefer"] === "return=representation") {
        return jsonResponse({
          id: "ORDER123",
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAPTURE123",
                    status: "COMPLETED",
                    amount: { value: "50.00", currency_code: "CAD" }
                  }
                ]
              }
            }
          ]
        });
      }
      // Minimal representation: no purchase_units, so no capture details.
      return jsonResponse({ id: "ORDER123", status: "COMPLETED", links: [] });
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

test("capturePayPalOrder requests the full representation so the capture is verifiable", async () => {
  const result = await capturePayPalOrder("ORDER123");

  assert.equal(
    captureRequestHeaders?.["Prefer"],
    "return=representation",
    "capture request must send Prefer: return=representation"
  );

  const details = extractCaptureDetails(result);
  assert.deepEqual(details, {
    captureId: "CAPTURE123",
    status: "COMPLETED",
    amountValue: "50.00",
    currencyCode: "CAD"
  });
});
