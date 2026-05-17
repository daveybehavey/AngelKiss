import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStorefrontCdnImageSrc,
  storefrontImageSrcOrNull,
  storefrontImageUnoptimized
} from "../lib/storefront/storefront-image-src";

describe("storefrontImageSrcOrNull", () => {
  it("returns null for empty and whitespace", () => {
    assert.equal(storefrontImageSrcOrNull(null), null);
    assert.equal(storefrontImageSrcOrNull(undefined), null);
    assert.equal(storefrontImageSrcOrNull(""), null);
    assert.equal(storefrontImageSrcOrNull("   "), null);
  });

  it("allows root-relative paths", () => {
    assert.equal(storefrontImageSrcOrNull("/marketing/x.jpg"), "/marketing/x.jpg");
  });

  it("normalizes protocol-relative absolute URLs", () => {
    assert.equal(
      storefrontImageSrcOrNull("//cdn.example.com/x.jpg"),
      "https://cdn.example.com/x.jpg"
    );
  });

  it("allows valid absolute URLs", () => {
    assert.equal(
      storefrontImageSrcOrNull("https://example.com/a/b.jpg"),
      "https://example.com/a/b.jpg"
    );
  });

  it("rejects non-URL garbage", () => {
    assert.equal(storefrontImageSrcOrNull("not a url"), null);
    assert.equal(storefrontImageSrcOrNull("://bad"), null);
  });
});

describe("isStorefrontCdnImageSrc", () => {
  const envKey = "NEXT_PUBLIC_IMAGE_CDN_BASE_URL";

  it("matches URLs on the configured CDN origin", () => {
    const prev = process.env[envKey];
    process.env[envKey] = "https://pub-abc.r2.dev";
    try {
      assert.equal(
        isStorefrontCdnImageSrc("https://pub-abc.r2.dev/products/x.webp"),
        true
      );
      assert.equal(isStorefrontCdnImageSrc("https://other.example/x.webp"), false);
      assert.equal(isStorefrontCdnImageSrc("/marketing/x.jpg"), false);
    } finally {
      if (prev === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = prev;
      }
    }
  });

  it("storefrontImageUnoptimized follows CDN detection", () => {
    const prev = process.env[envKey];
    process.env[envKey] = "pub-abc.r2.dev";
    try {
      assert.equal(
        storefrontImageUnoptimized("https://pub-abc.r2.dev/studio/x.webp"),
        true
      );
      assert.equal(storefrontImageUnoptimized("/marketing/hero.webp"), false);
    } finally {
      if (prev === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = prev;
      }
    }
  });
});
