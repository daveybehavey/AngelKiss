import assert from "node:assert/strict";
import test from "node:test";
import { getRequestMeta } from "../lib/http/request-meta";

test("uses provided request id headers", () => {
  const request = new Request("https://example.com/api/checkout/sessions", {
    method: "POST",
    headers: {
      "x-request-id": "req-123",
      "user-agent": "UnitTest"
    }
  });

  const meta = getRequestMeta(request);
  assert.equal(meta.requestId, "req-123");
  assert.equal(meta.method, "POST");
  assert.equal(meta.path, "/api/checkout/sessions");
  assert.equal(meta.userAgent, "UnitTest");
});

test("creates a fallback request id when headers are missing", () => {
  const request = new Request("https://example.com/api/webhooks/paypal", {
    method: "POST"
  });

  const meta = getRequestMeta(request);
  assert.equal(meta.method, "POST");
  assert.equal(meta.path, "/api/webhooks/paypal");
  assert.ok(meta.requestId.length > 0);
});
