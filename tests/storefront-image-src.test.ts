import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getStorefrontGridImageUrl,
  isStorefrontCdnImageSrc,
  isStorefrontCfImageResizeEnabled,
  storefrontGridImageUnoptimized,
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

describe("getStorefrontGridImageUrl", () => {
  const cdnKey = "NEXT_PUBLIC_IMAGE_CDN_BASE_URL";
  const siteKey = "NEXT_PUBLIC_SITE_URL";
  const resizeKey = "NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE";

  it("wraps same-origin paths with cdn-cgi when resize is enabled", () => {
    const prevSite = process.env[siteKey];
    const prevResize = process.env[resizeKey];
    process.env[siteKey] = "https://anglkisscreations.ca";
    process.env[resizeKey] = "1";
    try {
      const out = getStorefrontGridImageUrl("/marketing/home-gallery/stand-01.webp", {
        width: 384
      });
      assert.equal(
        out,
        "https://anglkisscreations.ca/cdn-cgi/image/width=384,quality=75,format=auto/marketing/home-gallery/stand-01.webp"
      );
      assert.equal(storefrontGridImageUnoptimized(out ?? ""), true);
    } finally {
      restoreEnv(siteKey, prevSite);
      restoreEnv(resizeKey, prevResize);
    }
  });

  it("uses R2 _grid.webp siblings when grid variants are enabled", () => {
    const prevCdn = process.env[cdnKey];
    const prevResize = process.env[resizeKey];
    const prevGrid = process.env["NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS"];
    process.env[cdnKey] = "https://pub-abc.r2.dev";
    process.env[resizeKey] = "1";
    process.env["NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS"] = "1";
    try {
      const src = "https://pub-abc.r2.dev/products/mug.webp";
      assert.equal(
        getStorefrontGridImageUrl(src, { width: 384 }),
        "https://pub-abc.r2.dev/products/mug_grid.webp"
      );
    } finally {
      restoreEnv(cdnKey, prevCdn);
      restoreEnv(resizeKey, prevResize);
      restoreEnv("NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS", prevGrid);
    }
  });

  it("falls back to R2 master when grid variants are disabled", () => {
    const prevCdn = process.env[cdnKey];
    const prevResize = process.env[resizeKey];
    const prevGrid = process.env["NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS"];
    process.env[cdnKey] = "https://pub-abc.r2.dev";
    process.env[resizeKey] = "1";
    process.env["NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS"] = "0";
    try {
      const src = "https://pub-abc.r2.dev/products/mug.webp";
      assert.equal(getStorefrontGridImageUrl(src, { width: 384 }), src);
    } finally {
      restoreEnv(cdnKey, prevCdn);
      restoreEnv(resizeKey, prevResize);
      restoreEnv("NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS", prevGrid);
    }
  });

  it("returns source unchanged when resize is off", () => {
    const prevResize = process.env[resizeKey];
    process.env[resizeKey] = "0";
    try {
      const src = "https://pub-abc.r2.dev/x.webp";
      assert.equal(getStorefrontGridImageUrl(src), src);
    } finally {
      restoreEnv(resizeKey, prevResize);
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
