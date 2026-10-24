import assert from "node:assert/strict";
import test from "node:test";
import { listAdminProducts } from "../lib/admin/products";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

/**
 * C5 regression: `listAdminProducts` fetches a bounded window and applies
 * the inventory filter in memory. When a whole window filtered out, the
 * old code returned an empty page with a null cursor even though older
 * matching products existed beyond the window.
 */

function productRow(index: number, soldOut: boolean): FakeRow {
  const day = String(13 - index).padStart(2, "0");
  return {
    id: `p${index}`,
    slug: `product-${index}`,
    name: `Product ${index}`,
    category: "handmade_crochet_knit",
    base_price_cents: 2500,
    currency: "CAD",
    inventory_mode: "finite",
    stock_quantity: soldOut ? 1 : 10,
    reserved_quantity: soldOut ? 1 : 0,
    low_stock_threshold: 2,
    is_available: true,
    status: "published",
    created_at: `2026-01-${day}T00:00:00.000Z`,
    updated_at: `2026-01-${day}T00:00:00.000Z`,
    deleted_at: null
  };
}

function seedClient() {
  // Newest first (created_at desc): p1..p9 in stock, p10..p12 sold out.
  const rows = Array.from({ length: 12 }, (_, i) => productRow(i + 1, i + 1 >= 10));
  return createFakeSupabase({
    products: { rows },
    custom_sublimation_products: { rows: [] },
    product_images: { rows: [] },
    product_variants: { rows: [] }
  });
}

test("out_of_stock matches beyond a fully-filtered window are reachable", async () => {
  const { client } = seedClient();
  // limit 2 -> fetchSize 8 -> the first window (9 rows) is entirely in
  // stock, so a single-window implementation finds nothing here.
  const page1 = await listAdminProducts(client, {
    limit: 2,
    inventoryFilter: "out_of_stock"
  });

  assert.deepEqual(
    page1.items.map((item) => item.id),
    ["p10", "p11"]
  );
  assert.ok(page1.items.every((item) => item.is_sold_out));
  assert.equal(page1.nextCursor, "2026-01-02T00:00:00.000Z");
});

test("pagination continues past the window into older matches", async () => {
  const { client } = seedClient();
  const page1 = await listAdminProducts(client, {
    limit: 2,
    inventoryFilter: "out_of_stock"
  });
  assert.ok(page1.nextCursor);

  const page2 = await listAdminProducts(client, {
    limit: 2,
    inventoryFilter: "out_of_stock",
    cursor: page1.nextCursor
  });

  assert.deepEqual(
    page2.items.map((item) => item.id),
    ["p12"]
  );
  assert.equal(page2.nextCursor, null);
});

test("unfiltered listing still paginates like before", async () => {
  const { client } = seedClient();
  const page1 = await listAdminProducts(client, { limit: 3, inventoryFilter: "all" });

  assert.deepEqual(
    page1.items.map((item) => item.id),
    ["p1", "p2", "p3"]
  );
  assert.equal(page1.nextCursor, "2026-01-10T00:00:00.000Z");

  const page2 = await listAdminProducts(client, {
    limit: 3,
    inventoryFilter: "all",
    cursor: page1.nextCursor ?? undefined
  });
  assert.deepEqual(
    page2.items.map((item) => item.id),
    ["p4", "p5", "p6"]
  );
});
