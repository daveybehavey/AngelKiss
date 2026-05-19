import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocalCatalogImageForProduct } from "../lib/storefront/catalog-image-fallback";

describe("admin product image summary alignment", () => {
  it("does not use frog fallback for fish-only names", () => {
    const local = getLocalCatalogImageForProduct({
      slug: "beta-fishies",
      name: "Beta Fishies",
      category: "handmade_crochet_knit"
    });
    assert.equal(local, null);
  });

  it("matches storefront local fallback for frog name", () => {
    const local = getLocalCatalogImageForProduct({
      slug: "crochet-frog",
      name: "Crochet Frog",
      category: "handmade_crochet_knit"
    });
    assert.equal(local?.url, "/marketing/products/product-01.jpg");
  });

  it("matches storefront local fallback for custom photo mug slug", () => {
    const local = getLocalCatalogImageForProduct({
      slug: "custom-photo-mug",
      name: "Mug",
      category: "custom_sublimation"
    });
    assert.equal(local?.url, "/marketing/home-gallery/stand-05.webp");
  });
});
