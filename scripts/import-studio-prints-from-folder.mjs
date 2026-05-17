#!/usr/bin/env node
/**
 * Bulk-import studio prints: walk a folder (recursive), optimize each image to WebP with Sharp,
 * upload to Supabase Storage **or** Cloudflare R2 (product-images bucket / same object keys, `studio-gallery/` prefix), insert sublimation_studio_prints.
 *
 * When `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` are set, uploads go to R2 instead of Supabase Storage.
 * Best practices applied:
 * - EXIF auto-orient (sharp.rotate() with no angle)
 * - Downscale only (withoutEnlargement) to cap long edge — smaller egress + faster gallery
 * - WebP output (quality + smartSubsample), metadata stripped on encode
 * - Decompression / pixel limits to avoid runaway memory on corrupt huge inputs
 * - Sequential uploads (predictable; easy on Supabase + OneDrive)
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET
 *
 * Usage:
 *   npm run admin:import-studio-prints -- --dry-run --dir "C:\Users\david\OneDrive\ANGLKISS"
 *   npm run admin:import-studio-prints -- --dir "C:\Users\david\OneDrive\ANGLKISS"
 *   npm run admin:import-studio-prints -- --dir ./pictures/prints --max-edge 1920 --quality 82 --limit 3
 */
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { isR2CatalogUploadConfigured, putCatalogObjectToR2, deleteCatalogObjectFromR2 } from "./lib/r2-catalog-upload.mjs";
import {
  assignGalleryCatalogTitle,
  GALLERY_PLACEHOLDER_TITLE,
  titleFromImageFilePath
} from "./lib/studio-print-title.mjs";

const STUDIO_PREFIX = "studio-gallery/";
const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_WEBP_QUALITY = 84;
const DEFAULT_DELAY_MS = 80;
const INPUT_PIXEL_LIMIT = 4096 * 4096; // per frame; rejects absurd inputs early

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic", ".heif"]);

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

function getServiceKey() {
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (sr) return sr;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secret) return secret;
  return "";
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function getProductImagesBucket() {
  return process.env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim() || "product-images";
}

/** Mirrors lib/admin/images.ts sanitizeFilename + getStoragePathForStudioGalleryPrint */
function sanitizeFilename(filename) {
  const trimmed = filename.trim();
  const noPath = trimmed.split("/").pop()?.split("\\").pop() ?? "upload.bin";
  const normalized = noPath
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!normalized) return "upload.bin";
  return normalized.slice(0, 120);
}

function storagePathForWebpUpload(originalFilename) {
  const stem = sanitizeFilename(originalFilename.replace(/\.[^.]+$/, "") || "print");
  const safe = `${stem}.webp`;
  const random = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${STUDIO_PREFIX}${Date.now()}-${random}-${safe}`;
}

function* walkImageFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkImageFiles(full);
    } else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (IMAGE_EXT.has(ext)) {
        yield full;
      }
    }
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    dir: "",
    maxEdge: DEFAULT_MAX_EDGE,
    quality: DEFAULT_WEBP_QUALITY,
    delayMs: DEFAULT_DELAY_MS,
    limit: 0,
    skip: 0
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--dir" && argv[i + 1]) {
      out.dir = argv[++i];
    } else if (a === "--max-edge" && argv[i + 1]) {
      out.maxEdge = Math.max(512, Math.min(8192, parseInt(argv[++i], 10) || DEFAULT_MAX_EDGE));
    } else if (a === "--quality" && argv[i + 1]) {
      out.quality = Math.max(60, Math.min(95, parseInt(argv[++i], 10) || DEFAULT_WEBP_QUALITY));
    } else if (a === "--delay-ms" && argv[i + 1]) {
      out.delayMs = Math.max(0, parseInt(argv[++i], 10) || DEFAULT_DELAY_MS);
    } else if (a === "--limit" && argv[i + 1]) {
      out.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    } else if (a === "--skip" && argv[i + 1]) {
      out.skip = Math.max(0, parseInt(argv[++i], 10) || 0);
    } else if (!a.startsWith("--") && !out.dir) {
      out.dir = a;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {Buffer} inputBuf
 * @param {{ maxEdge: number; quality: number }} opts
 */
async function optimizeStudioPrintImage(inputBuf, opts) {
  const pipeline = sharp(inputBuf, {
    limitInputPixels: INPUT_PIXEL_LIMIT,
    failOn: "none",
    animated: false,
    pages: 1
  })
    .rotate()
    .resize({
      width: opts.maxEdge,
      height: opts.maxEdge,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: opts.quality,
      effort: 6,
      smartSubsample: true
    });

  const out = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: out.data, info: out.info };
}

async function ensureBucket(supabase, bucket) {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    throw new Error(listErr.message);
  }
  const exists = (buckets ?? []).some((b) => b.id === bucket || b.name === bucket);
  if (exists) return;
  const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
  if (createErr) {
    throw new Error(createErr.message);
  }
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);

  const opts = parseArgs(process.argv.slice(2));
  const dirRaw = opts.dir || process.env.STUDIO_PRINT_IMPORT_DIR?.trim() || "";
  if (!dirRaw) {
    console.error(
      "import-studio-prints: pass --dir <folder> or set STUDIO_PRINT_IMPORT_DIR (recursive image scan)."
    );
    process.exit(1);
  }
  const dir = resolve(cwd, dirRaw);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`import-studio-prints: not a directory: ${dir}`);
    process.exit(1);
  }

  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    console.error(
      "import-studio-prints: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in .env.local"
    );
    process.exit(1);
  }

  const files = Array.from(walkImageFiles(dir)).sort((a, b) => a.localeCompare(b, "en"));
  const sliced =
    opts.skip || opts.limit
      ? files.slice(opts.skip, opts.limit ? opts.skip + opts.limit : undefined)
      : files;

  console.log(
    `import-studio-prints: dir=${dir}\n  files=${sliced.length} (of ${files.length} total images)  maxEdge=${opts.maxEdge}  webpQ=${opts.quality}  dryRun=${opts.dryRun}`
  );

  if (opts.dryRun) {
    for (const f of sliced.slice(0, 15)) {
      console.log(`  would import: ${relative(dir, f)} → title "${titleFromImageFilePath(f, basename, extname)}"`);
    }
    if (sliced.length > 15) {
      console.log(`  … and ${sliced.length - 15} more`);
    }
    process.exit(0);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucket = getProductImagesBucket();
  await ensureBucket(supabase, bucket);

  const { data: titleRows } = await supabase.from("sublimation_studio_prints").select("title");
  let catalogSeq = 0;
  for (const row of titleRows ?? []) {
    const m = String(row.title ?? "")
      .trim()
      .match(/^(?:AnglKiss Gallery|AngiKiss gallery) · (\d+)$/i);
    if (m) {
      catalogSeq = Math.max(catalogSeq, Number.parseInt(m[1], 10));
    }
  }

  let ok = 0;
  const failures = [];
  const n = sliced.length;

  for (let i = 0; i < n; i++) {
    const filePath = sliced[i];
    const rel = relative(dir, filePath);
    let inputBuf;
    try {
      inputBuf = readFileSync(filePath);
    } catch (e) {
      failures.push({ rel, err: e instanceof Error ? e.message : String(e) });
      continue;
    }

    let webpBuf;
    let metaBefore;
    let outW = 0;
    let outH = 0;
    try {
      metaBefore = await sharp(inputBuf, {
        limitInputPixels: INPUT_PIXEL_LIMIT,
        failOn: "none",
        animated: false,
        pages: 1
      }).metadata();
      const { buffer, info } = await optimizeStudioPrintImage(inputBuf, {
        maxEdge: opts.maxEdge,
        quality: opts.quality
      });
      webpBuf = buffer;
      outW = info.width ?? 0;
      outH = info.height ?? 0;
      const inW = metaBefore.width ?? 0;
      const inH = metaBefore.height ?? 0;
      console.log(
        `  [${i + 1}/${n}] ${rel}  ${inW}×${inH} → webp ${outW}×${outH}  ${(inputBuf.length / 1024).toFixed(0)}KB → ${(webpBuf.length / 1024).toFixed(0)}KB`
      );
    } catch (e) {
      failures.push({ rel, err: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const storagePath = storagePathForWebpUpload(basename(filePath));
    let uploadErr = null;
    if (isR2CatalogUploadConfigured()) {
      try {
        await putCatalogObjectToR2({
          Key: storagePath,
          Body: webpBuf,
          ContentType: "image/webp"
        });
      } catch (e) {
        uploadErr = e instanceof Error ? e.message : String(e);
      }
    } else {
      const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, webpBuf, {
        contentType: "image/webp",
        upsert: false
      });
      uploadErr = upErr?.message ?? null;
    }
    if (uploadErr) {
      failures.push({ rel, err: uploadErr });
      continue;
    }

    let title = titleFromImageFilePath(filePath, basename, extname);
    if (title === GALLERY_PLACEHOLDER_TITLE) {
      catalogSeq += 1;
      title = assignGalleryCatalogTitle(catalogSeq);
    }
    const alt = title.length > 300 ? title.slice(0, 297) + "…" : title;
    const sortOrder = (n - i) * 10;

    const dimPayload =
      outW > 0 && outH > 0 ? { image_width: outW, image_height: outH } : {};

    const { error: insErr } = await supabase.from("sublimation_studio_prints").insert({
      title,
      subtitle: null,
      storage_path: storagePath,
      alt_text: alt,
      sort_order: sortOrder,
      primary_cta_slug: null,
      is_active: true,
      ...dimPayload
    });

    if (insErr) {
      failures.push({ rel, err: insErr.message });
      try {
        if (isR2CatalogUploadConfigured()) {
          await deleteCatalogObjectFromR2(storagePath);
        } else {
          await supabase.storage.from(bucket).remove([storagePath]);
        }
      } catch {
        /* best-effort cleanup */
      }
      continue;
    }

    ok++;
    if (opts.delayMs > 0 && i < n - 1) {
      await sleep(opts.delayMs);
    }
  }

  console.log(`\nimport-studio-prints: done — inserted ${ok}, failed ${failures.length}`);
  if (failures.length) {
    for (const f of failures.slice(0, 20)) {
      console.error(`  FAIL ${f.rel}: ${f.err}`);
    }
    if (failures.length > 20) {
      console.error(`  … and ${failures.length - 20} more failures`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("import-studio-prints:", e instanceof Error ? e.message : e);
  process.exit(1);
});
