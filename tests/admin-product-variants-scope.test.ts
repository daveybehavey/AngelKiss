import assert from "node:assert/strict";
import test from "node:test";
import { deleteProductVariant, updateProductVariant } from "../lib/admin/product-variants";
import { createFakeSupabase } from "./helpers/fake-supabase";

/**
 * C6 regression: variant mutations were keyed by variant id alone, so a
 * request under product A's URL could update or delete a variant that
 * belongs to product B.
 */

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";
const VARIANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function seedClient() {
  return createFakeSupabase({
    product_variants: {
      rows: [
        {
          id: VARIANT_B,
          product_id: PRODUCT_B,
          label: "Large",
          slug: "large",
          price_cents: 500,
          sort_order: 1,
          is_available: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      ]
    }
  });
}

test("update through the wrong parent product is rejected and changes nothing", async () => {
  const { client, tables } = seedClient();
  await assert.rejects(
    updateProductVariant(client, PRODUCT_A, VARIANT_B, { label: "Hijacked" }),
    /Variant not found for this product/
  );
  assert.equal(tables.product_variants.rows[0].label, "Large");
});

test("delete through the wrong parent product is rejected and the row survives", async () => {
  const { client, tables } = seedClient();
  await assert.rejects(deleteProductVariant(client, PRODUCT_A, VARIANT_B), /Variant not found/);
  assert.equal(tables.product_variants.rows.length, 1);
});

test("update and delete work under the owning product", async () => {
  const { client, tables } = seedClient();
  const updated = await updateProductVariant(client, PRODUCT_B, VARIANT_B, { label: "XL" });
  assert.equal(updated.label, "XL");

  await deleteProductVariant(client, PRODUCT_B, VARIANT_B);
  assert.equal(tables.product_variants.rows.length, 0);
});
