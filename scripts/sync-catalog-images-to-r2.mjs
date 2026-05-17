#!/usr/bin/env node
/**
 * Copy catalog image objects from Supabase Storage → Cloudflare R2 using the **same object keys**
 * as in Postgres (`storage_path` / template paths), so `NEXT_PUBLIC_IMAGE_CDN_BASE_URL` works
 * without DB changes.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET,
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Usage:
 *   node scripts/sync-catalog-images-to-r2.mjs --dry-run
 *   node scripts/sync-catalog-images-to-r2.mjs
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { isR2CatalogUploadConfigured, putCatalogObjectToR2 } from "./lib/r2-catalog-upload.mjs";

const DEFAULT_BUCKET = "product-images";

function mergeEnv(cwd) {
  for (const p of [envPath(cwd), resolve(cwd, ".env")]) {
    const file = loadEnvFile(p);
    for (const [k, v] of Object.entries(file)) {
      if (process.env[k] === undefined || process.env[k] === "") {
        process.env[k] = v;
      }
    }
  }
}

function getBucket() {
  return process.env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim() || DEFAULT_BUCKET;
}

function normalizeKey(storagePath, bucket) {
  const value = String(storagePath ?? "").trim();
  const prefix = `${bucket}/`;
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }
  return value;
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  return { dryRun };
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  if (!isR2CatalogUploadConfigured()) {
    console.error(
      "sync-catalog-images-to-r2: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error("sync-catalog-images-to-r2: need NEXT_PUBLIC_SUPABASE_URL and service key");
    process.exit(1);
  }

  const bucket = getBucket();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const paths = new Set();

  const { data: imgRows, error: imgErr } = await supabase.from("product_images").select("storage_path");
  if (imgErr) {
    console.error("product_images:", imgErr.message);
    process.exit(1);
  }
  for (const r of imgRows ?? []) {
    const k = normalizeKey(r.storage_path, bucket);
    if (k) paths.add(k);
  }

  const { data: spRows, error: spErr } = await supabase.from("sublimation_studio_prints").select("storage_path");
  if (spErr) {
    console.error("sublimation_studio_prints:", spErr.message);
    process.exit(1);
  }
  for (const r of spRows ?? []) {
    const k = normalizeKey(r.storage_path, bucket);
    if (k) paths.add(k);
  }

  const { data: tplRows, error: tplErr } = await supabase
    .from("custom_sublimation_products")
    .select("template_image_path");
  if (tplErr) {
    console.error("custom_sublimation_products:", tplErr.message);
    process.exit(1);
  }
  for (const r of tplRows ?? []) {
    const k = normalizeKey(r.template_image_path, bucket);
    if (k) paths.add(k);
  }

  const list = [...paths].sort();
  console.log(`sync-catalog-images-to-r2: ${list.length} distinct object key(s) in ${bucket}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const objectKey of list) {
    if (opts.dryRun) {
      console.log(`  [dry-run] would sync: ${objectKey}`);
      skipped++;
      continue;
    }
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(objectKey);
      if (dlErr || !blob) {
        console.error(`  FAIL download ${objectKey}: ${dlErr?.message || "no data"}`);
        failed++;
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const ct = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/webp";
      await putCatalogObjectToR2({
        Key: objectKey,
        Body: buf,
        ContentType: ct
      });
      ok++;
      if (ok % 25 === 0) {
        console.log(`  … uploaded ${ok}/${list.length}`);
      }
    } catch (e) {
      console.error(`  FAIL ${objectKey}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(
    `\nsync-catalog-images-to-r2: done — uploaded ${ok}, skipped/dry ${skipped}, failed ${failed}`
  );
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
