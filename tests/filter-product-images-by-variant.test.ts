import assert from "node:assert/strict";
import test from "node:test";
import { filterProductImagesByVariant } from "../lib/storefront/filter-product-images-by-variant";
import type { PublicProductImage } from "../lib/storefront/products";

function img(id: string, variant_id: string | null = null): PublicProductImage {
  return {
    id,
    storage_path: `path/${id}`,
    alt_text: null,
    sort_order: 0,
    is_primary: false,
    signed_url: null,
    variant_id
  };
}

test("filterProductImagesByVariant returns all when no variants", () => {
  const images = [img("a"), img("b", "v1")];
  assert.deepEqual(filterProductImagesByVariant(images, "v1", false), images);
});

test("filterProductImagesByVariant prefers generic and matching variant photos", () => {
  const images = [img("generic"), img("pink", "v-pink"), img("blue", "v-blue")];
  const filtered = filterProductImagesByVariant(images, "v-pink", true);
  assert.deepEqual(
    filtered.map((i) => i.id),
    ["generic", "pink"]
  );
});

test("filterProductImagesByVariant falls back when no match", () => {
  const images = [img("only-blue", "v-blue")];
  const filtered = filterProductImagesByVariant(images, "v-pink", true);
  assert.deepEqual(filtered, images);
});
