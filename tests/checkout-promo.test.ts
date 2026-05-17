import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePromoCodeInput } from "../lib/checkout/promo";

test("normalizePromoCodeInput trims and uppercases", () => {
  assert.equal(normalizePromoCodeInput("  angeltest  "), "ANGELTEST");
});
