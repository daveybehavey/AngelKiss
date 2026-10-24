import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/api/checkout/sessions/[id]/paypal-order/create/route";

/**
 * Exercises the PayPal order-create route with PayPal and Supabase REST
 * stubbed at `fetch`. The Supabase stub emulates PostgREST filter
 * semantics against a single in-memory checkout_sessions row, so the
 * concurrency behaviour is real: a test hook mutates the row *while the
 * PayPal create call is in flight*, exactly like a webhook completion,
 * an expiry, or a competing create landing mid-request.
 *
 * The behaviour pinned here: the route's post-create write is
 * conditional. A terminal transition (completed / expired / failed) or
 * an already-recorded PayPal order that lands during the external call
 * wins — this create must never resurrect or overwrite it.
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

type SessionRow = {
  id: string;
  status: "open" | "paypal_order_created" | "completed" | "expired" | "failed";
  paypal_order_id: string | null;
  total_cents: number;
};

let sessionRow: SessionRow;
let onPayPalCreate: (() => void) | null;
let paypalCreateCount: number;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function resetSession(overrides: Partial<SessionRow> = {}): void {
  sessionRow = {
    id: SESSION_ID,
    status: "open",
    paypal_order_id: null,
    total_cents: 5500,
    ...overrides
  };
  onPayPalCreate = null;
  paypalCreateCount = 0;
}

function matchesFilters(params: URLSearchParams, row: SessionRow): boolean {
  const idFilter = params.get("id");
  if (idFilter !== null && idFilter !== `eq.${row.id}`) {
    return false;
  }
  const paypalFilter = params.get("paypal_order_id");
  if (paypalFilter === "is.null" && row.paypal_order_id !== null) {
    return false;
  }
  const statusFilter = params.get("status");
  if (statusFilter?.startsWith("in.(") && statusFilter.endsWith(")")) {
    const allowed = statusFilter.slice(4, -1).split(",");
    if (!allowed.includes(row.status)) {
      return false;
    }
  }
  return true;
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
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/v1/oauth2/token")) {
      return jsonResponse({ access_token: "test-token", token_type: "Bearer", expires_in: 3600 });
    }

    if (url.includes("/v2/checkout/orders") && method === "POST") {
      paypalCreateCount += 1;
      // The race window: the competing transition lands while this
      // external call is in flight, before the route writes back.
      onPayPalCreate?.();
      return jsonResponse({ id: `PAYPAL-CREATED-${paypalCreateCount}`, status: "CREATED" });
    }

    if (url.includes("/rest/v1/checkout_sessions")) {
      const params = new URL(url).searchParams;

      if (method === "GET") {
        return jsonResponse({ ...sessionRow });
      }

      if (method === "PATCH") {
        if (!matchesFilters(params, sessionRow)) {
          // PostgREST: a conditional update that matches nothing
          // returns an empty representation, not an error.
          return jsonResponse([]);
        }
        const patch = JSON.parse(String(init?.body ?? "{}")) as Partial<SessionRow>;
        Object.assign(sessionRow, patch);
        return jsonResponse([{ id: sessionRow.id }]);
      }
    }

    throw new Error(`Unexpected fetch in test: ${method} ${url}`);
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

async function postCreate(): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request(
    `http://localhost/api/checkout/sessions/${SESSION_ID}/paypal-order/create`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  const response = await POST(request, { params: Promise.resolve({ id: SESSION_ID }) });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

test("a plain create claims the session and returns the new PayPal order", async () => {
  resetSession();

  const { status, body } = await postCreate();

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.paypalOrderId, "PAYPAL-CREATED-1");
  assert.equal(sessionRow.status, "paypal_order_created");
  assert.equal(sessionRow.paypal_order_id, "PAYPAL-CREATED-1");
});

test("a completion landing during the PayPal create wins and is not overwritten", async () => {
  resetSession();
  onPayPalCreate = () => {
    sessionRow.status = "completed";
  };

  const { status, body } = await postCreate();

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /already completed/i);
  assert.equal(sessionRow.status, "completed", "terminal state must survive the create");
  assert.equal(sessionRow.paypal_order_id, null, "no competing PayPal order may be recorded");
});

test("an expiry landing during the PayPal create wins and is not overwritten", async () => {
  resetSession();
  onPayPalCreate = () => {
    sessionRow.status = "expired";
  };

  const { status, body } = await postCreate();

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /is expired/i);
  assert.equal(sessionRow.status, "expired");
  assert.equal(sessionRow.paypal_order_id, null);
});

test("a session that completes after a competing create attached its order still rejects", async () => {
  resetSession();
  onPayPalCreate = () => {
    sessionRow.status = "completed";
    sessionRow.paypal_order_id = "PAYPAL-WINNER";
  };

  const { status, body } = await postCreate();

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /already completed/i);
  assert.equal(sessionRow.status, "completed");
  assert.equal(sessionRow.paypal_order_id, "PAYPAL-WINNER", "the recorded state is left untouched");
});

test("a competing create that records its order first wins; this create reuses it", async () => {
  resetSession();
  onPayPalCreate = () => {
    sessionRow.status = "paypal_order_created";
    sessionRow.paypal_order_id = "PAYPAL-WINNER";
  };

  const { status, body } = await postCreate();

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.paypalOrderId, "PAYPAL-WINNER");
  assert.equal(body.reused, true);
  assert.equal(
    sessionRow.paypal_order_id,
    "PAYPAL-WINNER",
    "the winning order id must not be overwritten by the losing create"
  );
});
