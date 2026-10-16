import assert from "node:assert/strict";
import test from "node:test";
import {
  STATIC_SITEMAP_PATHS,
  buildProductSitemapEntries,
  buildStaticSitemapEntries
} from "../lib/sitemap-entries";

const ORIGIN = "https://anglkisscreations.ca";

test("static sitemap entries omit lastModified (no invented generation stamp)", () => {
  const before = Date.now();
  const entries = buildStaticSitemapEntries(ORIGIN);
  const after = Date.now();

  assert.equal(entries.length, STATIC_SITEMAP_PATHS.length);
  for (const [index, path] of STATIC_SITEMAP_PATHS.entries()) {
    const entry = entries[index];
    assert.equal(entry.url, `${ORIGIN}${path}`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(entry, "lastModified"),
      false,
      `static entry ${entry.url} must not set lastModified`
    );
    assert.equal(entry.lastModified, undefined);
  }

  // Guard: nothing in this group can equal "now" at generation time.
  for (const entry of entries) {
    if (entry.lastModified instanceof Date) {
      const t = entry.lastModified.getTime();
      assert.ok(t < before || t > after, "must not use generation-time lastModified");
    }
  }
});

test("product sitemap entries use created_at, never generation time", () => {
  const generationNow = new Date("2026-10-16T16:47:00.000Z");
  const items = [
    { slug: "mug-sunrise", created_at: "2025-03-01T12:00:00.000Z" },
    { slug: "crochet-scarf", created_at: "2024-11-15T08:30:00.000Z" }
  ];

  const entries = buildProductSitemapEntries(ORIGIN, items);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].url, `${ORIGIN}/shop/mug-sunrise`);
  assert.equal(entries[1].url, `${ORIGIN}/shop/crochet-scarf`);

  assert.ok(entries[0].lastModified instanceof Date);
  assert.ok(entries[1].lastModified instanceof Date);
  assert.equal(
    (entries[0].lastModified as Date).toISOString(),
    "2025-03-01T12:00:00.000Z"
  );
  assert.equal(
    (entries[1].lastModified as Date).toISOString(),
    "2024-11-15T08:30:00.000Z"
  );

  for (const entry of entries) {
    assert.notEqual(
      (entry.lastModified as Date).getTime(),
      generationNow.getTime(),
      `${entry.url} must not use sitemap generation timestamp`
    );
  }
});

test("combined entry groups never stamp lastModified with generation now", () => {
  const generationNow = new Date();
  const staticEntries = buildStaticSitemapEntries(ORIGIN);
  const productEntries = buildProductSitemapEntries(ORIGIN, [
    { slug: "sample-product", created_at: "2023-06-01T00:00:00.000Z" }
  ]);
  const all = [...staticEntries, ...productEntries];

  for (const entry of all) {
    if (!(entry.lastModified instanceof Date)) continue;
    assert.notEqual(
      entry.lastModified.getTime(),
      generationNow.getTime(),
      `${entry.url} must not use generation-time lastModified`
    );
  }
});
