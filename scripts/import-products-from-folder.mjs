#!/usr/bin/env node
/**
 * Create draft products from a folder of images, grouped by filename (e.g. foo-one.jpg, foo-two.jpg).
 *
 * Usage:
 *   npm run admin:import-folder -- --dry-run
 *   npm run admin:import-folder -- --dir pictures/unsorted
 *   npm run admin:import-folder -- --price-cad 29.99   (same price for every group; overrides auto)
 *
 * Env: ADMIN_SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SITE_URL (or ADMIN_IMPORT_BASE_URL)
 * See data/imports/README.txt
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const KIND_ORDER = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

/**
 * @param {string} stem filename without extension (lowercase recommended)
 * @returns {{ base: string, kind: string | null }}
 */
function parseImageStem(stem) {
  const s = stem.trim();
  const lower = s.toLowerCase();

  const hyphenWord = lower.match(/^(.+)-(one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if (hyphenWord) {
    return { base: hyphenWord[1], kind: hyphenWord[2].toLowerCase() };
  }

  const underWord = lower.match(/^(.+)_(one|two|three|four)$/);
  if (underWord) {
    return { base: underWord[1], kind: underWord[2].toLowerCase() };
  }

  const gluedWord = lower.match(/^(.+\d)(one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if (gluedWord) {
    return { base: gluedWord[1], kind: gluedWord[2].toLowerCase() };
  }

  return { base: lower, kind: null };
}

function sortKeyForEntry(kind) {
  if (!kind) {
    return 0;
  }
  return KIND_ORDER[kind] ?? 100;
}

function displayNameFromBase(base) {
  const spaced = base
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function guessContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

/**
 * From image group base (e.g. mug02, product10, tumbler03): crochet vs sublimation.
 * Convention: names starting with "product" → handmade crochet; mug / tumbler → prints.
 */
function inferCategoryFromBase(base) {
  const n = String(base).toLowerCase();
  if (n.includes("mug") || n.includes("tumbler")) {
    return "custom_sublimation";
  }
  if (n.startsWith("product")) {
    return "handmade_crochet_knit";
  }
  return "custom_sublimation";
}

function resolveCategoryForBase(opts, base) {
  const forced = String(opts.category).trim().toLowerCase();
  if (forced === "auto") {
    return inferCategoryFromBase(base);
  }
  if (forced === "handmade_crochet_knit" || forced === "handmade" || forced === "crochet") {
    return "handmade_crochet_knit";
  }
  if (forced === "custom_sublimation" || forced === "sublimation" || forced === "print") {
    return "custom_sublimation";
  }
  return inferCategoryFromBase(base);
}

function defaultPriceCentsForBase(base, category) {
  const n = String(base).toLowerCase();
  if (category === "handmade_crochet_knit") {
    return Math.round(24.99 * 100);
  }
  if (n.includes("tumbler")) {
    return 2999;
  }
  if (n.includes("mug")) {
    return 1999;
  }
  return Math.round(24.99 * 100);
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    publish: false,
    dir: "pictures/unsorted",
    /** `auto` = mug $19.99, tumbler $29.99, other prints & crochet $24.99 unless overridden. */
    priceCad: "auto",
    /** `auto` = infer from filename (product* → crochet, mug/tumbler → sublimation). */
    category: "auto",
    listing: "ready_made",
    delayMs: 120
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--publish") {
      out.publish = true;
    } else if (a === "--dir" && argv[i + 1]) {
      out.dir = argv[++i];
    } else if (a === "--price-cad" && argv[i + 1]) {
      out.priceCad = argv[++i];
    } else if (a === "--category" && argv[i + 1]) {
      out.category = argv[++i];
    } else if (a === "--listing" && argv[i + 1]) {
      out.listing = argv[++i];
    } else if (a === "--delay-ms" && argv[i + 1]) {
      out.delayMs = Number(argv[++i]) || 0;
    }
  }
  return out;
}

function dollarsToCents(value) {
  const parsed = Number(String(value).replace(/^\s*\$\s*/, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function buildCreatePayload({ name, slug, category, listing, basePriceCents }) {
  const payload = {
    name,
    slug,
    category,
    base_price_cents: basePriceCents,
    currency: "CAD",
    inventory_mode: "made_to_order",
    is_available: true,
    status: "draft",
    low_stock_threshold: 2
  };

  if (category === "custom_sublimation") {
    const allowCustomerUpload =
      listing === "customer_upload" || listing === "upload" || listing === "custom_photo";
    payload.custom_sublimation_details = {
      template_image_path: `templates/${slug}.png`,
      default_blank_color: "white",
      safe_area_x: 0,
      safe_area_y: 0,
      safe_area_width: 2000,
      safe_area_height: 2000,
      max_upload_mb: 20,
      allow_image_upload: allowCustomerUpload,
      allow_text_overlay: allowCustomerUpload,
      max_text_layers: allowCustomerUpload ? 3 : 0,
      allowed_fonts: ["Arial", "Montserrat", "Playfair Display"]
    };
  } else if (category === "handmade_crochet_knit") {
    payload.inventory_mode = "finite";
    payload.stock_quantity = 1;
    payload.handmade_details = {
      material: "Cotton yarn",
      lead_time_days: 7,
      personalization_available: false
    };
  }

  return payload;
}

async function uploadOneImage({ baseUrl, token, productId, filePath, isPrimary }) {
  const filename = basename(filePath);
  const contentType = guessContentType(filePath);

  const urlRes = await fetch(`${baseUrl}/api/admin/products/${productId}/images/upload-url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ filename, content_type: contentType })
  });
  const urlText = await urlRes.text();
  let urlJson = null;
  try {
    urlJson = JSON.parse(urlText);
  } catch {
    /* ignore */
  }
  if (!urlRes.ok) {
    throw new Error(urlJson?.error || urlText || `upload-url ${urlRes.status}`);
  }

  const uploadUrl = urlJson.uploadUrl;
  const storagePath = urlJson.storagePath;
  if (!uploadUrl || !storagePath) {
    throw new Error("upload-url response missing uploadUrl or storagePath");
  }

  const buf = readFileSync(filePath);
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buf
  });
  if (!putRes.ok) {
    throw new Error(`PUT object failed ${putRes.status} for ${filename}`);
  }

  const metaRes = await fetch(`${baseUrl}/api/admin/products/${productId}/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ storage_path: storagePath, is_primary: isPrimary })
  });
  const metaText = await metaRes.text();
  let metaJson = null;
  try {
    metaJson = JSON.parse(metaText);
  } catch {
    /* ignore */
  }
  if (!metaRes.ok) {
    throw new Error(metaJson?.error || metaText || `register image ${metaRes.status}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dirAbs = resolve(process.cwd(), opts.dir);
  if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
    console.error(`Not a directory: ${dirAbs}`);
    process.exit(1);
  }

  const envFile = loadEnvFile(envPath());
  const env = { ...envFile, ...process.env };
  const baseRaw = (env.ADMIN_IMPORT_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  const token = (env.ADMIN_SUPABASE_ACCESS_TOKEN || "").trim();

  if (!opts.dryRun) {
    if (!baseRaw) {
      console.error("Set NEXT_PUBLIC_SITE_URL or ADMIN_IMPORT_BASE_URL");
      process.exit(1);
    }
    if (!token) {
      console.error("Set ADMIN_SUPABASE_ACCESS_TOKEN");
      process.exit(1);
    }
  }

  if (opts.priceCad !== "auto") {
    const fixed = dollarsToCents(opts.priceCad);
    if (fixed == null) {
      console.error("Invalid --price-cad (use a number like 24.99, or auto)");
      process.exit(1);
    }
  }

  const names = readdirSync(dirAbs).filter((n) => /\.(jpe?g|png|webp)$/i.test(n));
  /** @type {Map<string, { relPath: string, sort: number, stem: string }[]>} */
  const groups = new Map();

  for (const name of names) {
    const stem = basename(name, extname(name));
    const { base, kind } = parseImageStem(stem);
    const sort = sortKeyForEntry(kind);
    const relPath = resolve(dirAbs, name);
    if (!groups.has(base)) {
      groups.set(base, []);
    }
    groups.get(base).push({ relPath, sort, stem });
  }

  for (const [, arr] of groups) {
    arr.sort((a, b) => {
      if (a.sort !== b.sort) {
        return a.sort - b.sort;
      }
      return a.stem.localeCompare(b.stem);
    });
  }

  const keys = Array.from(groups.keys()).sort();
  console.log(`Folder: ${dirAbs}`);
  console.log(`Products (grouped): ${keys.length} | Image files: ${names.length}`);
  console.log(
    `Defaults: category=${opts.category}${opts.category === "auto" ? " (product*→crochet, mug/tumbler→sublimation)" : ""}, listing=${opts.listing}, price_cad=${opts.priceCad}, draft${opts.publish ? ", then publish" : ""}\n`
  );

  let ok = 0;
  let fail = 0;

  for (const base of keys) {
    const files = groups.get(base);
    const slug = slugify(base);
    if (!slug) {
      console.error(`SKIP (empty slug) base=${base}`);
      fail++;
      continue;
    }
    const name = displayNameFromBase(base);
    const category = resolveCategoryForBase(opts, base);
    const basePriceCents =
      opts.priceCad === "auto"
        ? defaultPriceCentsForBase(base, category)
        : dollarsToCents(opts.priceCad);
    if (basePriceCents == null) {
      console.error(`SKIP ${slug}: could not resolve price`);
      fail++;
      continue;
    }
    const payload = buildCreatePayload({
      name,
      slug,
      category,
      listing: opts.listing,
      basePriceCents
    });

    if (opts.dryRun) {
      console.log(
        `[dry-run] ${slug} (${category}) $${(basePriceCents / 100).toFixed(2)} ← ${files.map((f) => basename(f.relPath)).join(", ")}`
      );
      ok++;
      continue;
    }

    try {
      const res = await fetch(`${baseRaw}/api/admin/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        console.error(`FAIL create ${slug}: ${res.status} ${json?.error || text}`);
        fail++;
        continue;
      }
      const productId = json?.product?.id;
      if (!productId) {
        console.error(`FAIL create ${slug}: no product id in response`);
        fail++;
        continue;
      }

      let imgOk = 0;
      for (let i = 0; i < files.length; i++) {
        await uploadOneImage({
          baseUrl: baseRaw,
          token,
          productId,
          filePath: files[i].relPath,
          isPrimary: i === 0
        });
        imgOk++;
        if (opts.delayMs > 0) {
          await sleep(opts.delayMs);
        }
      }

      if (opts.publish) {
        const pub = await fetch(`${baseRaw}/api/admin/products/${productId}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!pub.ok) {
          const t = await pub.text();
          console.error(`WARN ${slug}: created + images but publish failed → ${pub.status} ${t}`);
        }
      }

      console.log(`OK   ${slug} (${imgOk} images) — ${name}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${slug}: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} products ok, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
