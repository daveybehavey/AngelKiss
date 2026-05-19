import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogGridCdnUrlFromMasterUrl,
  catalogGridObjectKey,
  catalogObjectKeyFromCdnUrl,
  isStorefrontR2GridVariantsEnabled
} from "../lib/storefront/catalog-grid-image";

describe("catalogGridObjectKey", () => {
  it("derives _grid.webp from webp masters", () => {
    assert.equal(catalogGridObjectKey("products/mug-01.webp"), "products/mug-01_grid.webp");
    assert.equal(catalogGridObjectKey("studio/gallery/rose.webp"), "studio/gallery/rose_grid.webp");
  });

  it("skips templates and existing grid keys", () => {
    assert.equal(catalogGridObjectKey("templates/foo.webp"), null);
    assert.equal(catalogGridObjectKey("products/foo_grid.webp"), null);
  });
});

describe("catalogGridCdnUrlFromMasterUrl", () => {
  const cdnKey = "NEXT_PUBLIC_IMAGE_CDN_BASE_URL";

  it("builds grid CDN URL from master CDN URL", () => {
    const prev = process.env[cdnKey];
    process.env[cdnKey] = "https://pub-abc.r2.dev";
    try {
      const master = "https://pub-abc.r2.dev/products/mug.webp";
      assert.equal(
        catalogGridCdnUrlFromMasterUrl(master),
        "https://pub-abc.r2.dev/products/mug_grid.webp"
      );
      assert.equal(catalogObjectKeyFromCdnUrl(master), "products/mug.webp");
    } finally {
      restoreEnv(cdnKey, prev);
    }
  });

  it("returns null for non-CDN URLs", () => {
    const prev = process.env[cdnKey];
    process.env[cdnKey] = "https://pub-abc.r2.dev";
    try {
      assert.equal(catalogGridCdnUrlFromMasterUrl("https://other.example/x.webp"), null);
    } finally {
      restoreEnv(cdnKey, prev);
    }
  });
});

describe("isStorefrontR2GridVariantsEnabled", () => {
  const key = "NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS";

  it("is off unless explicitly enabled", () => {
    const prev = process.env[key];
    delete process.env[key];
    try {
      assert.equal(isStorefrontR2GridVariantsEnabled(), false);
      process.env[key] = "1";
      assert.equal(isStorefrontR2GridVariantsEnabled(), true);
      process.env[key] = "0";
      assert.equal(isStorefrontR2GridVariantsEnabled(), false);
    } finally {
      restoreEnv(key, prev);
    }
  });
});

function restoreEnv(key: string, prev: string | undefined) {
  if (prev === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = prev;
  }
}
