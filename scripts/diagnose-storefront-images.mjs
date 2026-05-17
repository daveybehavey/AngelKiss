#!/usr/bin/env node
/**
 * Dev helper: why storefront images might not show (no secrets printed).
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

const env = { ...process.env, ...loadEnvFile(envPath()) };

function maskUrl(url) {
  if (!url) return "(empty)";
  try {
    const u = new URL(url.startsWith("/") ? `http://local${url}` : url);
    if (url.startsWith("/")) return url;
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return `(invalid: ${url.slice(0, 40)}…)`;
  }
}

function normalizeCdn(raw) {
  const t = (raw || "").trim().replace(/\/+$/, "");
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.status;
  } catch (e) {
    return `ERR: ${e instanceof Error ? e.message : e}`;
  }
}

async function main() {
  const cdnRaw = env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL;
  const cdnNorm = normalizeCdn(cdnRaw);
  console.log("diagnose-storefront-images");
  console.log(`  NEXT_PUBLIC_IMAGE_CDN_BASE_URL: ${cdnRaw ? "set" : "NOT SET"} → normalized host: ${cdnNorm ?? "INVALID"}`);
  console.log(`  mode: ${cdnNorm ? "R2/CDN public URLs" : "Supabase signed URLs"}`);

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.log("  Supabase: missing URL or service key — cannot sample product images");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await supabase
    .from("products")
    .select("id,slug,name")
    .is("deleted_at", null)
    .eq("status", "published")
    .limit(3);
  if (error) {
    console.log(`  products query error: ${error.message}`);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("  no published products in DB");
    process.exit(0);
  }

  const ids = rows.map((r) => r.id);
  const { data: images } = await supabase
    .from("product_images")
    .select("product_id,storage_path")
    .in("product_id", ids)
    .eq("is_primary", true);

  const pathByProduct = new Map((images ?? []).map((i) => [i.product_id, i.storage_path]));
  const bucket = env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim() || "product-images";

  for (const p of rows) {
    const path = pathByProduct.get(p.id);
    if (!path) {
      console.log(`  ${p.slug}: no primary image row`);
      continue;
    }
    let imageUrl;
    if (cdnNorm) {
      const keyPath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
      const encoded = keyPath
        .split("/")
        .filter(Boolean)
        .map((s) => encodeURIComponent(s))
        .join("/");
      imageUrl = `${cdnNorm}/${encoded}`;
    } else {
      const norm = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(norm, 3600);
      if (signErr) {
        console.log(`  ${p.slug}: signed URL error: ${signErr.message}`);
        continue;
      }
      imageUrl = signed?.signedUrl;
    }
    const status = imageUrl ? await headStatus(imageUrl) : "no url";
    console.log(`  ${p.slug}: ${maskUrl(imageUrl)} → HTTP ${status}`);
  }

  console.log("\nIf CDN mode and HTTP 403/404: enable R2 public access + confirm sync ran.");
  console.log("If signed mode and HTTP 403: check bucket policies / service key.");
  console.log("Restart npm run dev after changing NEXT_PUBLIC_* in .env.local.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
