import assert from "node:assert/strict";
import test from "node:test";
import {
  appendVariantToCustomization,
  validateProductVariantSelection
} from "../lib/checkout/variant";
import type { PublicProductVariant } from "../lib/storefront/product-variants";

const variants: PublicProductVariant[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    product_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    label: "Pink",
    slug: "pink",
    price_cents: null,
    sort_order: 10,
    is_available: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  }
];

test("validateProductVariantSelection requires variant when product has options", () => {
  const missing = validateProductVariantSelection({}, variants);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.message, /color/i);
  }
});

test("validateProductVariantSelection accepts a valid variant", () => {
  const ok = validateProductVariantSelection(
    {
      variant: { id: variants[0].id, label: "Pink", slug: "pink" }
    },
    variants
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal((ok.customization.variant as { slug: string }).slug, "pink");
  }
});

test("appendVariantToCustomization merges variant into sublimation payload", () => {
  const merged = appendVariantToCustomization(
    { studio_print: { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", storage_path: "studio/x.webp" } },
    { variant: { id: variants[0].id, label: "Pink", slug: "pink" } }
  );
  assert.equal((merged.variant as { slug: string }).slug, "pink");
  assert.ok(merged.studio_print);
});
