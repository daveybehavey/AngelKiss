import assert from "node:assert/strict";
import { after, before, test } from "node:test";

/**
 * C9 regression: both admin upload-url routes advertised
 * `expiresAt = now + 2h` for R2 uploads, but the presigned R2 URL is
 * only signed for 3600s — clients following the advertised expiry hit a
 * dead URL for the second hour. The advertised expiry must match the
 * signed TTL. Presigning is local, so no network stub is needed beyond
 * admin auth and the product read.
 */

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function stubFetch(input: unknown) {
  const url = new URL(typeof input === "string" ? input : (input as Request).url);
  if (url.pathname.endsWith("/auth/v1/user")) {
    return Promise.resolve(jsonResponse({ id: ADMIN_ID, email: "admin@example.test" }));
  }
  if (url.pathname.endsWith("/rest/v1/user_profiles")) {
    return Promise.resolve(jsonResponse({ role: "admin" }));
  }
  if (url.pathname.endsWith("/rest/v1/products")) {
    return Promise.resolve(
      jsonResponse({
        id: PRODUCT_ID,
        slug: "test-product",
        name: "Test Product",
        category: "custom_sublimation",
        base_price_cents: 2500,
        currency: "CAD",
        inventory_mode: "made_to_order",
        stock_quantity: null,
        reserved_quantity: 0,
        low_stock_threshold: 2,
        is_available: true,
        status: "published",
        deleted_at: null
      })
    );
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${url.toString()}`));
}

let postProductUploadUrl: typeof import("../app/api/admin/products/[id]/images/upload-url/route").POST;
let postStudioUploadUrl: typeof import("../app/api/admin/studio-prints/upload-url/route").POST;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "test-bucket";
  globalThis.fetch = stubFetch as typeof fetch;
  ({ POST: postProductUploadUrl } = await import(
    "../app/api/admin/products/[id]/images/upload-url/route"
  ));
  ({ POST: postStudioUploadUrl } = await import(
    "../app/api/admin/studio-prints/upload-url/route"
  ));
});

after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET_NAME;
});

function adminRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/admin/upload-url", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function assertAdvertisedExpiryMatchesSignedTtl(response: Response) {
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    provider?: string;
    uploadUrl?: string;
    expiresAt?: string;
  };
  assert.equal(body.provider, "r2");
  assert.match(body.uploadUrl ?? "", /X-Amz-Expires=3600/);
  const advertisedSeconds = (Date.parse(body.expiresAt ?? "") - Date.now()) / 1000;
  assert.ok(
    advertisedSeconds > 3540 && advertisedSeconds <= 3605,
    `advertised expiry should be ~3600s, got ${advertisedSeconds}s`
  );
}

test("product image upload-url advertises the true R2 expiry", async () => {
  const response = await postProductUploadUrl(
    adminRequest({ filename: "photo.png", content_type: "image/png" }),
    { params: Promise.resolve({ id: PRODUCT_ID }) }
  );
  await assertAdvertisedExpiryMatchesSignedTtl(response);
});

test("studio print upload-url advertises the true R2 expiry", async () => {
  const response = await postStudioUploadUrl(
    adminRequest({ filename: "print.png", content_type: "image/png" })
  );
  await assertAdvertisedExpiryMatchesSignedTtl(response);
});
