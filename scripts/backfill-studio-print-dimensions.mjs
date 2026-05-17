#!/usr/bin/env node
/**
 * Backfill image_width / image_height on sublimation_studio_prints by reading each WebP from Storage
 * with Sharp (output dimensions match what shoppers see after encode).
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET
 *
 * Usage:
 *   npm run admin:backfill-studio-print-dims -- --dry-run
 *   npm run admin:backfill-studio-print-dims -- --limit 5
 *   npm run admin:backfill-studio-print-dims
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

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

function buildCdnObjectUrl(cdnOrigin, storagePath, bucket) {
  const path = String(storagePath ?? "").trim();
  const prefix = `${bucket}/`;
  const key = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${cdnOrigin}/${encoded}`;
}

async function downloadImageBytes(supabase, bucket, storagePath) {
  const cdnOrigin = normalizeCdnBase(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (cdnOrigin) {
    const url = buildCdnObjectUrl(cdnOrigin, storagePath, bucket);
    const res = await fetch(url);
    if (!res.ok) {
      return { error: `CDN GET ${res.status}` };
    }
    return { buffer: Buffer.from(await res.arrayBuffer()) };
  }
  const { data: bin, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
  if (dlErr || !bin) {
    return { error: dlErr?.message ?? "no data" };
  }
  return { buffer: Buffer.from(await bin.arrayBuffer()) };
}

function parseArgs(argv) {
  let dryRun = false;
  let limit = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--limit" && argv[i + 1]) limit = Math.max(0, parseInt(argv[++i], 10) || 0);
  }
  return { dryRun, limit };
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    console.error(
      "backfill-studio-print-dims: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucket = getProductImagesBucket();

  const { data: rows, error } = await supabase
    .from("sublimation_studio_prints")
    .select("id,storage_path,image_width,image_height")
    .order("sort_order", { ascending: false });

  if (error) {
    console.error("backfill-studio-print-dims: select failed", error.message);
    process.exit(1);
  }

  const pending = (rows ?? []).filter(
    (r) => r.image_width == null || r.image_height == null || Number(r.image_width) <= 0 || Number(r.image_height) <= 0
  );
  const slice = opts.limit > 0 ? pending.slice(0, opts.limit) : pending;

  console.log(
    `backfill-studio-print-dims: ${pending.length} row(s) missing dimensions; will process ${slice.length}${opts.dryRun ? " (dry-run)" : ""}`
  );

  let ok = 0;
  for (const row of slice) {
    const path = String(row.storage_path ?? "").trim();
    if (!path) {
      console.warn(`  skip id=${row.id}: empty storage_path`);
      continue;
    }

    const dl = await downloadImageBytes(supabase, bucket, path);
    if (dl.error || !dl.buffer) {
      console.warn(`  skip id=${row.id}: download failed ${dl.error ?? "no data"}`);
      continue;
    }

    const buf = dl.buffer;
    let meta;
    try {
      meta = await sharp(buf, { failOn: "none", animated: false, pages: 1 }).metadata();
    } catch (e) {
      console.warn(`  skip id=${row.id}: sharp ${e instanceof Error ? e.message : e}`);
      continue;
    }

    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w <= 0 || h <= 0) {
      console.warn(`  skip id=${row.id}: invalid dimensions ${w}×${h}`);
      continue;
    }

    console.log(`  id=${row.id} ${path} → ${w}×${h}`);

    if (!opts.dryRun) {
      const { error: upErr } = await supabase
        .from("sublimation_studio_prints")
        .update({ image_width: w, image_height: h })
        .eq("id", row.id);
      if (upErr) {
        console.error(`  update failed id=${row.id}: ${upErr.message}`);
        process.exit(1);
      }
    }
    ok++;
  }

  console.log(`backfill-studio-print-dims: done — ${opts.dryRun ? "would update" : "updated"} ${ok} row(s)`);
}

main().catch((e) => {
  console.error("backfill-studio-print-dims:", e instanceof Error ? e.message : e);
  process.exit(1);
});
