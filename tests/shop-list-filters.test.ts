import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopListFilters } from "../lib/server/storefront-data-cache";

/**
 * C3 regression: a mode-only shop selection passed `null` for the
 * category, and the list query's mode branch tested
 * `categoryFilter === undefined` — never true — so the mode was silently
 * dropped and the shop returned the whole category unfiltered.
 */

test("mode-only selection applies the mode within the sublimation category", () => {
  assert.deepEqual(resolveShopListFilters(null, "customer_upload"), {
    category: "custom_sublimation",
    sublimationMode: "customer_upload"
  });
});

test("no selection means no filters", () => {
  assert.deepEqual(resolveShopListFilters(null, null), {
    category: undefined,
    sublimationMode: undefined
  });
});

test("a non-sublimation category ignores the mode", () => {
  assert.deepEqual(resolveShopListFilters("handmade_crochet_knit", "customer_upload"), {
    category: "handmade_crochet_knit",
    sublimationMode: undefined
  });
});

test("an explicit sublimation category passes the mode through", () => {
  assert.deepEqual(resolveShopListFilters("custom_sublimation", "ready_made_design"), {
    category: "custom_sublimation",
    sublimationMode: "ready_made_design"
  });
  assert.deepEqual(resolveShopListFilters("custom_sublimation", null), {
    category: "custom_sublimation",
    sublimationMode: undefined
  });
});
