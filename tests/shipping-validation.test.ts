import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePostalCodeInput,
  validateShippingOriginInput
} from "../lib/admin/shipping-validation";

test("normalizes and validates Canadian origin fields", () => {
  const result = validateShippingOriginInput({
    country_code: "ca",
    province_code: "bc",
    city: "  Sooke  ",
    postal_code: "v9z0v1"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.normalized.country_code, "CA");
  assert.equal(result.normalized.province_code, "BC");
  assert.equal(result.normalized.city, "Sooke");
  assert.equal(result.normalized.postal_code, "V9Z 0V1");
});

test("returns field errors for invalid Canadian postal format", () => {
  const result = validateShippingOriginInput({
    country_code: "CA",
    province_code: "BC",
    city: "Sooke",
    postal_code: "12345"
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.errors.postal_code, "Use Canadian format A1A 1A1.");
});

test("supports US ZIP+4 format", () => {
  const result = validateShippingOriginInput({
    country_code: "US",
    province_code: "WA",
    city: "Seattle",
    postal_code: normalizePostalCodeInput("US", "98101-1234")
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.normalized.postal_code, "98101-1234");
});
