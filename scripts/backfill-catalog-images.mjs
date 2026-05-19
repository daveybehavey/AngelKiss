#!/usr/bin/env node
/**
 * Re-encode catalog images in R2 as WebP (max edge 1600, quality 78) and update Postgres paths
 * when the object key extension changes. Aligns with `lib/client/optimize-image-for-upload.ts`.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET,
 *   R2_* (required for upload), optional NEXT_PUBLIC_IMAGE_CDN_BASE_URL for download fallback.
 *
 * Usage:
 *   npm run admin:backfill-catalog-images -- --dry-run
 *   npm run admin:backfill-catalog-images -- --limit 10
 *   npm run admin:backfill-catalog-images -- --min-kb 400
 *   npm run admin:backfill-catalog-images -- --force
 *   npm run admin:backfill-catalog-images -- --include-templates
 *   npm run admin:backfill-catalog-images -- --grid --dry-run
 *   npm run admin:backfill-catalog-images -- --grid --grid-width 384
 *
 * Grid mode writes `*_grid.webp` siblings in R2 (no Postgres changes). After backfill, set
 * NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS=1 at build time and redeploy.
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { collectCatalogStoragePaths, normalizeObjectKey } from "./lib/catalog-storage-paths.mjs";
import {
  catalogGridObjectKey,
  DEFAULT_MAX_EDGE,
  isRasterCatalogKey,
  optimizeCatalogGridImageBuffer,
  optimizeCatalogImageBuffer,
  remapDbStoragePath,
  shouldSkipOptimization,
  targetWebpObjectKey
} from "./lib/catalog-image-optimize.mjs";
import {
  deleteCatalogObjectFromR2,
  getCatalogObjectFromR2,
  headCatalogObjectInR2,
  isR2CatalogUploadConfigured,
  putCatalogObjectToR2
} from "./lib/r2-catalog-upload.mjs";

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
  return process.env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim() || "product-images";
}

function normalizeCdnBase(raw) {
  const t = (raw || "").trim().replace(/\/+$/, "");
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

function buildCdnObjectUrl(cdnOrigin, objectKey) {
  const encoded = String(objectKey)
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${cdnOrigin}/${encoded}`;
}

/** Customization mockups (DB convention); usually not in R2 — not storefront catalog. */
function isTemplateMockupKey(objectKey) {
  return String(objectKey).startsWith("templates/");
}

function parseArgs(argv) {
  let dryRun = false;
  let limit = 0;
  let force = false;
  let minKb = 0;
  let includeTemplates = false;
  let gridOnly = false;
  let gridWidth = 384;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a === "--grid") gridOnly = true;
    else if (a === "--include-templates") includeTemplates = true;
    else if (a === "--limit" && argv[i + 1]) limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--min-kb" && argv[i + 1]) minKb = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--grid-width" && argv[i + 1]) {
      gridWidth = Math.max(64, Math.min(800, parseInt(argv[++i], 10) || 384));
    }
  }
  return { dryRun, limit, force, minBytes: minKb * 1024, includeTemplates, gridOnly, gridWidth };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bucket
 * @param {string} objectKey
 */
async function downloadCatalogBytes(supabase, bucket, objectKey) {
  if (isR2CatalogUploadConfigured()) {
    try {
      const r2 = await getCatalogObjectFromR2(objectKey);
      return { buffer: r2.buffer, source: "r2" };
    } catch {
      // fall through
    }
  }

  const cdnOrigin = normalizeCdnBase(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (cdnOrigin) {
    const url = buildCdnObjectUrl(cdnOrigin, objectKey);
    const res = await fetch(url);
    if (res.ok) {
      return { buffer: Buffer.from(await res.arrayBuffer()), source: "cdn" };
    }
  }

  const { data: bin, error } = await supabase.storage.from(bucket).download(objectKey);
  if (error || !bin) {
    return { error: error?.message ?? "no data" };
  }
  return { buffer: Buffer.from(await bin.arrayBuffer()), source: "supabase" };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<{ table: string; id?: string; column: string; dbPath: string }>} refs
 * @param {string} objectKey
 * @param {string} newObjectKey
 * @param {{ width: number; height: number }} dims
 */
async function applyDbUpdates(supabase, refs, objectKey, newObjectKey, dims) {
  const seen = new Set();
  for (const ref of refs) {
    const sig = `${ref.table}:${ref.id ?? ""}:${ref.column}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const newPath = remapDbStoragePath(ref.dbPath, objectKey, newObjectKey);
    const patch =
      ref.table === "sublimation_studio_prints"
        ? { storage_path: newPath, image_width: dims.width, image_height: dims.height }
        : { [ref.column]: newPath };

    const q = supabase.from(ref.table).update(patch);
    if (ref.table === "custom_sublimation_products") {
      const { error } = await q.eq("product_id", ref.id);
      if (error) throw new Error(`${ref.table} product_id=${ref.id}: ${error.message}`);
    } else {
      const { error } = await q.eq("id", ref.id);
      if (error) throw new Error(`${ref.table} id=${ref.id}: ${error.message}`);
    }
  }
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  if (!isR2CatalogUploadConfigured()) {
    console.error(
      "backfill-catalog-images: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error("backfill-catalog-images: need NEXT_PUBLIC_SUPABASE_URL and service key");
    process.exit(1);
  }

  const bucket = getBucket();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { keys, refs } = await collectCatalogStoragePaths(supabase, bucket);
  const allRaster = [...keys].filter(isRasterCatalogKey);
  const templateKeys = opts.includeTemplates ? [] : allRaster.filter(isTemplateMockupKey);
  let list = opts.includeTemplates ? allRaster : allRaster.filter((k) => !isTemplateMockupKey(k));
  list.sort();
  if (opts.limit > 0) {
    list = list.slice(0, opts.limit);
  }

  const modeLabel = opts.gridOnly ? `grid ${opts.gridWidth}px WebP siblings` : "master WebP optimize";
  console.log(
    `backfill-catalog-images: ${list.length} raster key(s) — ${modeLabel} (${keys.size} total in DB${templateKeys.length ? `, ${templateKeys.length} template mockup(s) skipped` : ""})${opts.dryRun ? " (dry-run)" : ""}`
  );

  let optimized = 0;
  let skipped = 0;
  let failed = 0;

  if (opts.gridOnly) {
    for (const objectKey of list) {
      const label = objectKey;
      try {
        const gridKey = catalogGridObjectKey(objectKey);
        if (!gridKey) {
          skipped++;
          continue;
        }
        if (!opts.force && (await headCatalogObjectInR2(gridKey))) {
          skipped++;
          continue;
        }
        const dl = await downloadCatalogBytes(supabase, bucket, objectKey);
        if (dl.error || !dl.buffer) {
          console.warn(`  FAIL download ${label}: ${dl.error ?? "no data"}`);
          failed++;
          continue;
        }
        const encoded = await optimizeCatalogGridImageBuffer(dl.buffer, {
          maxEdge: opts.gridWidth
        });
        const kbOut = Math.round(encoded.buffer.length / 1024);
        const action = opts.dryRun ? "would write grid" : "write grid";
        console.log(
          `  ${action} ${gridKey} ← ${label} (${dl.source}) ${encoded.width}×${encoded.height} ${kbOut}KB`
        );
        if (opts.dryRun) {
          optimized++;
          continue;
        }
        await putCatalogObjectToR2({
          Key: gridKey,
          Body: encoded.buffer,
          ContentType: "image/webp"
        });
        optimized++;
      } catch (e) {
        console.error(`  FAIL ${label}:`, e instanceof Error ? e.message : e);
        failed++;
      }
    }
    console.log(
      `\nbackfill-catalog-images: done — ${opts.dryRun ? "would write" : "wrote"} ${optimized} grid variant(s), skipped ${skipped}, failed ${failed}`
    );
    if (failed) process.exit(1);
    return;
  }

  for (const objectKey of list) {
    const label = objectKey;
    try {
      const dl = await downloadCatalogBytes(supabase, bucket, objectKey);
      if (dl.error || !dl.buffer) {
        console.warn(`  FAIL download ${label}: ${dl.error ?? "no data"}`);
        failed++;
        continue;
      }

      const input = dl.buffer;
      if (opts.minBytes > 0 && input.length < opts.minBytes) {
        skipped++;
        continue;
      }

      const srcMeta = await sharp(input, { failOn: "none", animated: false, pages: 1 }).metadata();
      const srcW = srcMeta.width ?? 0;
      const srcH = srcMeta.height ?? 0;
      if (srcW <= 0 || srcH <= 0) {
        console.warn(`  skip ${label}: invalid dimensions`);
        skipped++;
        continue;
      }

      const isWebp = /\.webp$/i.test(objectKey);
      if (
        shouldSkipOptimization(input, { width: srcW, height: srcH }, {
          isWebp,
          force: opts.force,
          minBytes: 250_000,
          maxEdge: DEFAULT_MAX_EDGE
        })
      ) {
        skipped++;
        continue;
      }

      const encoded = await optimizeCatalogImageBuffer(input);
      const newObjectKey = targetWebpObjectKey(objectKey);
      const keyUnchanged = newObjectKey === objectKey;
      const savedPct =
        input.length > 0 ? Math.round((1 - encoded.buffer.length / input.length) * 100) : 0;

      if (keyUnchanged && encoded.buffer.length >= input.length * 0.95) {
        skipped++;
        continue;
      }

      const kbIn = Math.round(input.length / 1024);
      const kbOut = Math.round(encoded.buffer.length / 1024);
      const action = opts.dryRun ? "would optimize" : "optimize";
      console.log(
        `  ${action} ${label} (${dl.source}) ${kbIn}KB→${kbOut}KB (${savedPct}%) ${srcW}×${srcH}→${encoded.width}×${encoded.height} key→${newObjectKey}`
      );

      if (opts.dryRun) {
        optimized++;
        continue;
      }

      await putCatalogObjectToR2({
        Key: newObjectKey,
        Body: encoded.buffer,
        ContentType: "image/webp"
      });

      const rowRefs = refs.get(objectKey) ?? [];
      if (rowRefs.length) {
        await applyDbUpdates(supabase, rowRefs, objectKey, newObjectKey, {
          width: encoded.width,
          height: encoded.height
        });
      }

      if (!keyUnchanged) {
        await deleteCatalogObjectFromR2(objectKey);
      }

      optimized++;
      if (optimized % 10 === 0) {
        console.log(`  … processed ${optimized}/${list.length}`);
      }
    } catch (e) {
      console.error(`  FAIL ${label}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(
    `\nbackfill-catalog-images: done — ${opts.dryRun ? "would optimize" : "optimized"} ${optimized}, skipped ${skipped}, failed ${failed}`
  );
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("backfill-catalog-images:", e instanceof Error ? e.message : e);
  process.exit(1);
});
