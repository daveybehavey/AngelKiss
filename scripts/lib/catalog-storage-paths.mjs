/**
 * Collect distinct catalog object keys referenced in Postgres.
 */

export function normalizeObjectKey(storagePath, bucket) {
  const value = String(storagePath ?? "").trim();
  const prefix = `${bucket}/`;
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }
  return value;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bucket
 * @returns {Promise<{ keys: Set<string>; refs: Map<string, Array<{ table: string; id?: string; column: string }>> }>}
 */
export async function collectCatalogStoragePaths(supabase, bucket) {
  const keys = new Set();
  /** @type {Map<string, Array<{ table: string; id?: string; column: string; dbPath: string }>>} */
  const refs = new Map();

  function addRef(dbPath, ref) {
    const k = normalizeObjectKey(dbPath, bucket);
    if (!k) {
      return;
    }
    keys.add(k);
    const list = refs.get(k) ?? [];
    list.push({ ...ref, dbPath: String(dbPath).trim() });
    refs.set(k, list);
  }

  const { data: imgRows, error: imgErr } = await supabase.from("product_images").select("id,storage_path");
  if (imgErr) {
    throw new Error(`product_images: ${imgErr.message}`);
  }
  for (const r of imgRows ?? []) {
    addRef(r.storage_path, { table: "product_images", id: r.id, column: "storage_path" });
  }

  const { data: spRows, error: spErr } = await supabase
    .from("sublimation_studio_prints")
    .select("id,storage_path");
  if (spErr) {
    throw new Error(`sublimation_studio_prints: ${spErr.message}`);
  }
  for (const r of spRows ?? []) {
    addRef(r.storage_path, { table: "sublimation_studio_prints", id: r.id, column: "storage_path" });
  }

  const { data: tplRows, error: tplErr } = await supabase
    .from("custom_sublimation_products")
    .select("product_id,template_image_path");
  if (tplErr) {
    throw new Error(`custom_sublimation_products: ${tplErr.message}`);
  }
  for (const r of tplRows ?? []) {
    addRef(r.template_image_path, {
      table: "custom_sublimation_products",
      id: r.product_id,
      column: "template_image_path"
    });
  }

  return { keys, refs };
}
