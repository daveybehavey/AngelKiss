import assert from "node:assert/strict";
import { after, before, test } from "node:test";

/**
 * C4 regression: both product-image write routes cleared the product's
 * primary image flag BEFORE validating that a supplied variant belongs
 * to the product — so a request that was then rejected with a 400 had
 * already stripped the primary image. These tests stub the Supabase
 * REST boundary, record every product_images mutation, and assert a
 * rejected request performs none.
 */

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const OWN_VARIANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IMAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const originalFetch = globalThis.fetch;

type RecordedMutation = { method: string; body: Record<string, unknown> };
const imageMutations: RecordedMutation[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function filterValue(url: URL, key: string): string | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  return dot >= 0 ? raw.slice(dot + 1) : raw;
}

const productRow = {
  id: PRODUCT_ID,
  slug: "test-product",
  name: "Test Product",
  category: "custom_sublimation",
  short_description: null,
  long_description: null,
  base_price_cents: 2500,
  currency: "CAD",
  inventory_mode: "made_to_order",
  stock_quantity: null,
  reserved_quantity: 0,
  low_stock_threshold: 2,
  is_available: true,
  status: "published",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null
};

const imageRow = {
  id: IMAGE_ID,
  product_id: PRODUCT_ID,
  variant_id: null,
  storage_path: `products/${PRODUCT_ID}/existing.png`,
  alt_text: null,
  sort_order: 0,
  is_primary: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

function variantsRowFor(url: URL) {
  const id = filterValue(url, "id");
  const productId = filterValue(url, "product_id");
  if (id === OWN_VARIANT_ID && productId === PRODUCT_ID) {
    return { id: OWN_VARIANT_ID, product_id: PRODUCT_ID };
  }
  if (id === FOREIGN_VARIANT_ID && productId === OTHER_PRODUCT_ID) {
    return { id: FOREIGN_VARIANT_ID, product_id: OTHER_PRODUCT_ID };
  }
  return null;
}

type FetchInitLike = {
  method?: string;
  headers?: HeadersInit;
  body?: string;
};

function stubFetch(input: unknown, init?: FetchInitLike) {
  const url = new URL(typeof input === "string" ? input : (input as Request).url);
  const method = (
    init?.method ??
    (typeof input === "object" ? (input as Request).method : undefined) ??
    "GET"
  ).toUpperCase();

  if (url.pathname.endsWith("/auth/v1/user")) {
    return Promise.resolve(jsonResponse({ id: ADMIN_ID, email: "admin@example.test" }));
  }

  // Reads in these routes use .maybeSingle(), which this postgrest-js
  // version resolves client-side from an array response.
  if (url.pathname.endsWith("/rest/v1/user_profiles")) {
    return Promise.resolve(jsonResponse([{ role: "admin" }]));
  }

  if (url.pathname.endsWith("/rest/v1/products")) {
    return Promise.resolve(jsonResponse([productRow]));
  }

  if (url.pathname.endsWith("/rest/v1/product_variants")) {
    const row = variantsRowFor(url);
    return Promise.resolve(jsonResponse(row ? [row] : []));
  }

  if (url.pathname.endsWith("/rest/v1/product_images")) {
    if (method === "GET") {
      const id = filterValue(url, "id");
      const productId = filterValue(url, "product_id");
      if (id === IMAGE_ID && productId === PRODUCT_ID) {
        return Promise.resolve(jsonResponse([imageRow]));
      }
      return Promise.resolve(jsonResponse([]));
    }

    // Mutations: record, then answer. supabase-js calls fetch with a
    // string URL plus an init carrying method/headers/body.
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    imageMutations.push({ method, body });
    if (method === "POST") {
      return Promise.resolve(
        jsonResponse(
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
            ...body
          },
          201
        )
      );
    }
    const prefer = new Headers(init?.headers).get("prefer") ?? "";
    if (prefer.includes("return=representation")) {
      return Promise.resolve(jsonResponse({ ...imageRow, ...body }));
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }

  return Promise.reject(new Error(`unexpected fetch in test: ${method} ${url.toString()}`));
}

function adminRequest(body: Record<string, unknown>, method: string) {
  return new Request("https://example.test/api/admin/products/images", {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

let postImage: typeof import("../app/api/admin/products/[id]/images/route").POST;
let patchImage: typeof import("../app/api/admin/products/[id]/images/[imageId]/route").PATCH;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  globalThis.fetch = stubFetch as typeof fetch;
  ({ POST: postImage } = await import("../app/api/admin/products/[id]/images/route"));
  ({ PATCH: patchImage } = await import(
    "../app/api/admin/products/[id]/images/[imageId]/route"
  ));
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("POST with a foreign variant is rejected without clearing the primary image", async () => {
  imageMutations.length = 0;
  const response = await postImage(
    adminRequest(
      {
        storage_path: `products/${PRODUCT_ID}/new.png`,
        is_primary: true,
        variant_id: FOREIGN_VARIANT_ID
      },
      "POST"
    ),
    { params: Promise.resolve({ id: PRODUCT_ID }) }
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: string };
  assert.match(body.error ?? "", /variant_id does not belong to this product/);
  assert.equal(imageMutations.length, 0, "a rejected request must not mutate product_images");
});

test("POST with the product's own variant succeeds and clears the old primary", async () => {
  imageMutations.length = 0;
  const response = await postImage(
    adminRequest(
      {
        storage_path: `products/${PRODUCT_ID}/new.png`,
        is_primary: true,
        variant_id: OWN_VARIANT_ID
      },
      "POST"
    ),
    { params: Promise.resolve({ id: PRODUCT_ID }) }
  );

  assert.equal(response.status, 201);
  assert.ok(
    imageMutations.some((call) => call.method === "PATCH" && call.body.is_primary === false),
    "the previous primary should be cleared on success"
  );
  assert.ok(imageMutations.some((call) => call.method === "POST"));
});

test("PATCH with a foreign variant is rejected without clearing the primary image", async () => {
  imageMutations.length = 0;
  const response = await patchImage(
    adminRequest({ is_primary: true, variant_id: FOREIGN_VARIANT_ID }, "PATCH"),
    { params: Promise.resolve({ id: PRODUCT_ID, imageId: IMAGE_ID }) }
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: string };
  assert.match(body.error ?? "", /variant_id does not belong to this product/);
  assert.equal(imageMutations.length, 0, "a rejected request must not mutate product_images");
});

test("PATCH with the product's own variant succeeds", async () => {
  imageMutations.length = 0;
  const response = await patchImage(
    adminRequest({ is_primary: true, variant_id: OWN_VARIANT_ID }, "PATCH"),
    { params: Promise.resolve({ id: PRODUCT_ID, imageId: IMAGE_ID }) }
  );

  assert.equal(response.status, 200);
  assert.ok(
    imageMutations.some((call) => call.method === "PATCH" && call.body.is_primary === false),
    "the previous primary should be cleared on success"
  );
});
