import assert from "node:assert/strict";
import test from "node:test";
import {
  filterStudioPrintsBySearch,
  parseSearchTags
} from "../lib/storefront/filter-studio-prints";
import type { PublicStudioPrint } from "../lib/storefront/studio-prints";

const sample: PublicStudioPrint = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "Coastal Florals",
  subtitle: "Soft blue wrap",
  storage_path: "studio-gallery/coastal.webp",
  alt_text: null,
  sort_order: 0,
  is_active: true,
  primary_cta_slug: null,
  search_tags: "mug, gift, mom",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_url: null
};

test("parseSearchTags splits comma-separated values", () => {
  assert.deepEqual(parseSearchTags("floral, Mug , coastal"), ["floral", "mug", "coastal"]);
});

test("filterStudioPrintsBySearch matches title and tags", () => {
  assert.equal(filterStudioPrintsBySearch([sample], "coastal").length, 1);
  assert.equal(filterStudioPrintsBySearch([sample], "mom").length, 1);
  assert.equal(filterStudioPrintsBySearch([sample], "winter").length, 0);
});

test("filterStudioPrintsBySearch requires all tokens", () => {
  assert.equal(filterStudioPrintsBySearch([sample], "coastal mug").length, 1);
  assert.equal(filterStudioPrintsBySearch([sample], "coastal winter").length, 0);
});
