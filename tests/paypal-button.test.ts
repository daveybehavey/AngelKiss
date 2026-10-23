import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Source-level pin for the PayPal button's success gate.
 *
 * The component only runs in a browser with the PayPal JS SDK, so it cannot
 * be exercised by this test harness directly. What must not regress is the
 * decision inside `onApprove`: checkout completion (which clears the cart)
 * may only fire for a verified finalized capture or an already-completed
 * session — never for a merely HTTP-200 response.
 */

const source = readFileSync(
  new URL("../components/storefront/paypal-button.tsx", import.meta.url),
  "utf8"
);

test("PayPalButton only calls onSuccess for a finalized or already-completed capture", () => {
  const gateIndex = source.indexOf("if (!normalized.finalized && !normalized.alreadyCompleted)");
  const successIndex = source.indexOf("onSuccess(normalized)");

  assert.notEqual(gateIndex, -1, "onApprove must gate success on the finalized flag");
  assert.notEqual(successIndex, -1, "onApprove must still report verified successes");
  assert.ok(gateIndex < successIndex, "the finalized gate must run before onSuccess");

  const gateBlock = source.slice(gateIndex, successIndex);
  assert.match(gateBlock, /setError\(/, "a non-final capture must surface an error");
  assert.match(gateBlock, /return;/, "a non-final capture must stop before onSuccess");
});
