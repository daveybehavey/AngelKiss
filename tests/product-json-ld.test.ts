import assert from "node:assert/strict";
import test from "node:test";
import { buildProductJsonLd } from "../lib/seo/product-json-ld";

test("product JSON-LD uses provided catalog fields and Product schema shape", () => {
  const jsonLd = buildProductJsonLd({
    name: "Custom Photo Mug (11 oz)",
    description: "Classic white sublimation mug with your uploaded photo printed on it.",
    urlPath: "/shop/custom-photo-mug",
    siteOrigin: "https://anglkisscreations.ca",
    imageUrl: "https://cdn.example/mug.webp",
    currency: "CAD",
    priceCents: 2499,
    availability: "https://schema.org/InStock"
  });

  assert.equal(jsonLd["@type"], "Product");
  assert.equal(jsonLd.name, "Custom Photo Mug (11 oz)");
  assert.equal(
    jsonLd.description,
    "Classic white sublimation mug with your uploaded photo printed on it."
  );
  assert.equal(jsonLd.url, "https://anglkisscreations.ca/shop/custom-photo-mug");
  assert.deepEqual(jsonLd.image, ["https://cdn.example/mug.webp"]);

  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers["@type"], "Offer");
  assert.equal(offers.priceCurrency, "CAD");
  assert.equal(offers.price, "24.99");
  assert.equal(offers.availability, "https://schema.org/InStock");
});

test("product JSON-LD omits image when catalog has none", () => {
  const jsonLd = buildProductJsonLd({
    name: "Froggie",
    description: "Handmade crochet frog",
    urlPath: "/shop/froggie",
    siteOrigin: "https://anglkisscreations.ca",
    imageUrl: null,
    currency: "CAD",
    priceCents: 3500,
    availability: "https://schema.org/OutOfStock"
  });

  assert.equal(Object.prototype.hasOwnProperty.call(jsonLd, "image"), false);
});
