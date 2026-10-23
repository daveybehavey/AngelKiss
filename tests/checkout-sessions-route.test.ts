import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { POST } from "../app/api/checkout/sessions/route";

/**
 * Exercises the checkout session route with Supabase REST stubbed at
 * `fetch`. No live database is involved.
 *
 * The behaviour pinned here: a custom-sublimation item whose customer
 * selected a variant must be able to check out. Variant selection is
 * validated against the server-side variant list, and the variant stored
 * on the session is the server record — never raw client fields. The raw
 * variant key must not leak into the strict customization payload schemas
 * (they have no variant field and reject unknown keys).
 */

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const savedEnv = new Map<string, string | undefined>();
let originalFetch: typeof fetch;

const UPLOAD_PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const READY_MADE_PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const STUDIO_PRINT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SESSION_ID = "99999999-9999-9999-9999-999999999999";

const UPLOAD_VARIANT = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  product_id: UPLOAD_PRODUCT_ID,
  label: "Pink",
  slug: "pink",
  price_cents: null,
  sort_order: 10,
  is_available: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

const READY_MADE_VARIANT = {
  id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  product_id: READY_MADE_PRODUCT_ID,
  label: "Blue",
  slug: "blue",
  price_cents: null,
  sort_order: 10,
  is_available: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

let createSessionBodies: Array<Record<string, unknown>> = [];

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

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/rest/v1/products")) {
      return jsonResponse([
        {
          id: UPLOAD_PRODUCT_ID,
          category: "custom_sublimation",
          status: "published",
          is_available: true,
          deleted_at: null
        },
        {
          id: READY_MADE_PRODUCT_ID,
          category: "custom_sublimation",
          status: "published",
          is_available: true,
          deleted_at: null
        }
      ]);
    }

    if (url.includes("/rest/v1/product_variants")) {
      return jsonResponse([UPLOAD_VARIANT, READY_MADE_VARIANT]);
    }

    if (url.includes("/rest/v1/custom_sublimation_products")) {
      return jsonResponse([
        {
          product_id: UPLOAD_PRODUCT_ID,
          allow_image_upload: true,
          allow_gallery_selection: false,
          max_upload_mb: 20
        },
        {
          product_id: READY_MADE_PRODUCT_ID,
          allow_image_upload: false,
          allow_gallery_selection: false,
          max_upload_mb: 20
        }
      ]);
    }

    if (url.includes("/rest/v1/sublimation_studio_prints")) {
      return jsonResponse({ id: STUDIO_PRINT_ID });
    }

    if (url.includes("/rest/v1/rpc/expire_stale_checkout_sessions")) {
      return jsonResponse([]);
    }

    if (url.includes("/rest/v1/rpc/create_checkout_session")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      createSessionBodies.push(body);
      return jsonResponse([
        {
          checkout_session_id: SESSION_ID,
          status: "pending",
          expires_at: "2026-01-01T01:00:00Z",
          subtotal_cents: 5000,
          shipping_cents: 500,
          discount_cents: 0,
          promo_code: null,
          total_cents: 5500,
          shipping_zone: "CA",
          free_shipping_applied: false
        }
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

async function postCheckout(
  items: unknown[]
): Promise<{ status: number; body: Record<string, unknown> }> {
  createSessionBodies = [];
  const request = new Request("http://localhost/api/checkout/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_email: "customer@example.com",
      shipping_address: {
        full_name: "Test Customer",
        address_line1: "1 Main Street",
        country_code: "CA",
        province_code: "BC",
        city: "Victoria",
        postal_code: "V8W 1A1"
      },
      items
    })
  });
  const response = await POST(request);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

function storedCustomization(): Record<string, unknown> {
  assert.equal(createSessionBodies.length, 1, "create_checkout_session must run exactly once");
  const items = createSessionBodies[0].p_items as Array<Record<string, unknown>>;
  return items[0].customization as Record<string, unknown>;
}

function validUpload(productId: string): Record<string, unknown> {
  return {
    upload: {
      bucket: "customer-design-uploads",
      storage_path: `customizations/${productId}/photo.png`,
      original_filename: "photo.png",
      content_type: "image/png",
      size_bytes: 1024,
      uploaded_at: new Date().toISOString()
    },
    rights_acknowledged: true
  };
}

test("sublimation upload item with a variant creates a session", async () => {
  const { status, body } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink" },
        ...validUpload(UPLOAD_PRODUCT_ID)
      }
    }
  ]);

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.checkoutSessionId, SESSION_ID);
  const customization = storedCustomization();
  assert.ok(customization.upload, "upload payload must be stored");
  assert.deepEqual(customization.variant, { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink" });
});

test("sublimation studio print item with a variant creates a session", async () => {
  const { status, body } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink" },
        studio_print: {
          id: STUDIO_PRINT_ID,
          storage_path: "studio-gallery/print-one.png",
          title: "Spring bouquet"
        }
      }
    }
  ]);

  assert.equal(status, 201, JSON.stringify(body));
  const customization = storedCustomization();
  assert.ok(customization.studio_print, "studio print payload must be stored");
  assert.deepEqual(customization.variant, { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink" });
});

test("pre-designed sublimation item with a variant creates a session", async () => {
  const { status, body } = await postCheckout([
    {
      product_id: READY_MADE_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: READY_MADE_VARIANT.id, label: "Blue", slug: "blue" },
        customer_notes: "gift wrap please"
      }
    }
  ]);

  assert.equal(status, 201, JSON.stringify(body));
  const customization = storedCustomization();
  assert.equal(customization.customer_notes, "gift wrap please");
  assert.deepEqual(customization.variant, {
    id: READY_MADE_VARIANT.id,
    label: "Blue",
    slug: "blue"
  });
});

test("an unknown variant id is rejected before any session is created", async () => {
  const { status, body } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", label: "Pink", slug: "pink" },
        ...validUpload(UPLOAD_PRODUCT_ID)
      }
    }
  ]);

  assert.equal(status, 400);
  assert.match(String(body.error), /not available/i);
  assert.equal(createSessionBodies.length, 0, "create_checkout_session must not run");
});

test("a variant slug that does not match the server record is rejected", async () => {
  const { status } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: UPLOAD_VARIANT.id, label: "Pink", slug: "not-pink" },
        ...validUpload(UPLOAD_PRODUCT_ID)
      }
    }
  ]);

  assert.equal(status, 400);
  assert.equal(createSessionBodies.length, 0, "create_checkout_session must not run");
});

test("a variant payload with extra client fields is rejected", async () => {
  const { status } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink", price_cents: 1 },
        ...validUpload(UPLOAD_PRODUCT_ID)
      }
    }
  ]);

  assert.equal(status, 400);
  assert.equal(createSessionBodies.length, 0, "create_checkout_session must not run");
});

test("the stored variant comes from the server record, not raw client fields", async () => {
  const { status, body } = await postCheckout([
    {
      product_id: UPLOAD_PRODUCT_ID,
      quantity: 1,
      customization: {
        variant: { id: UPLOAD_VARIANT.id, label: "Forged label", slug: "pink" },
        ...validUpload(UPLOAD_PRODUCT_ID)
      }
    }
  ]);

  assert.equal(status, 201, JSON.stringify(body));
  const customization = storedCustomization();
  assert.deepEqual(customization.variant, { id: UPLOAD_VARIANT.id, label: "Pink", slug: "pink" });
});
