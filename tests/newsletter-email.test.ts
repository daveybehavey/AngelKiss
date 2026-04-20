import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNewsletterEmail } from "../lib/newsletter/normalize-email";

test("trims and lowercases valid email", () => {
  assert.equal(normalizeNewsletterEmail("  Hello@Example.COM  "), "hello@example.com");
});

test("returns null for invalid or empty", () => {
  assert.equal(normalizeNewsletterEmail(""), null);
  assert.equal(normalizeNewsletterEmail("not-an-email"), null);
  assert.equal(normalizeNewsletterEmail("@nodomain.com"), null);
});

test("returns null when too long", () => {
  const local = "a".repeat(250);
  assert.equal(normalizeNewsletterEmail(`${local}@x.co`), null);
});
