#!/usr/bin/env node
/**
 * Bulk-create products via POST /api/admin/products (same rules as the admin UI).
 *
 * Usage:
 *   npm run admin:import-products -- path/to/products.csv
 *   npm run admin:import-products -- path/to/products.csv --dry-run
 *
 * Env (from .env.local or process env):
 *   ADMIN_SUPABASE_ACCESS_TOKEN — JWT from an admin session (browser DevTools → Application,
 *     or Network tab on any /api/admin/* request → Authorization: Bearer …). Expires; refresh when 401.
 *   NEXT_PUBLIC_SITE_URL — production or dev origin, e.g. https://anglkisscreations.ca or http://127.0.0.1:3010
 *   ADMIN_IMPORT_BASE_URL — optional override for NEXT_PUBLIC_SITE_URL
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

/** Minimal CSV row parser (quoted fields, doubled quotes). One physical line = one row. */
function parseCsvRow(line) {
  const result = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(field.trim());
      field = "";
    } else {
      field += c;
    }
  }
  result.push(field.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRow(lines[r]);
    if (cells.every((c) => c === "")) {
      continue;
    }
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = cells[i] ?? "";
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function parseBool(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "" || v === "default") {
    return null;
  }
  if (["1", "true", "yes", "y"].includes(v)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(v)) {
    return false;
  }
  return null;
}

function dollarsToCents(value) {
  const parsed = Number(String(value).replace(/^\s*\$\s*/, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function normalizeCategory(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "custom_sublimation" || v === "sublimation" || v === "print" || v === "prints") {
    return "custom_sublimation";
  }
  if (v === "handmade_crochet_knit" || v === "handmade" || v === "crochet" || v === "knit") {
    return "handmade_crochet_knit";
  }
  return null;
}

function buildPayload(row, rowIndex) {
  const name = String(row.name ?? "").trim();
  if (!name) {
    throw new Error(`Row ${rowIndex + 2}: missing name`);
  }

  const category = normalizeCategory(row.category);
  if (!category) {
    throw new Error(
      `Row ${rowIndex + 2}: invalid category "${row.category}". Use custom_sublimation or handmade_crochet_knit.`
    );
  }

  let slug = String(row.slug ?? "").trim().toLowerCase();
  if (!slug) {
    slug = slugify(name);
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Row ${rowIndex + 2}: invalid slug "${slug}" (use lowercase letters, numbers, hyphens only).`);
  }

  const basePriceCents = dollarsToCents(row.price_cad ?? row.price);
  if (basePriceCents == null) {
    throw new Error(`Row ${rowIndex + 2}: invalid price_cad`);
  }

  let trackStock = parseBool(row.track_stock);
  if (trackStock === null) {
    trackStock = category === "handmade_crochet_knit";
  }

  const inventoryMode = trackStock ? "finite" : "made_to_order";
  const payload = {
    name,
    slug,
    category,
    base_price_cents: basePriceCents,
    currency: "CAD",
    inventory_mode: inventoryMode,
    is_available: parseBool(row.is_available) !== false,
    status: String(row.status ?? "draft").trim().toLowerCase() === "published" ? "published" : "draft",
    low_stock_threshold: Number(row.low_stock_threshold) >= 0 ? Number(row.low_stock_threshold) : 2
  };

  if (row.short_description?.trim()) {
    payload.short_description = row.short_description.trim();
  }
  if (row.long_description?.trim()) {
    payload.long_description = row.long_description.trim();
  }

  if (inventoryMode === "finite") {
    const stock = Number(row.stock ?? row.stock_quantity);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error(`Row ${rowIndex + 2}: finite inventory requires integer stock / stock_quantity >= 0`);
    }
    payload.stock_quantity = stock;
  }

  if (category === "custom_sublimation") {
    let listing = String(row.listing ?? "ready_made").trim().toLowerCase();
    if (listing === "ready_made_print" || listing === "ready_made" || listing === "ready-made") {
      listing = "ready_made";
    }
    const allowCustomerUpload =
      listing === "customer_upload" || listing === "upload" || listing === "custom_photo";

    payload.custom_sublimation_details = {
      template_image_path: `templates/${slug}.png`,
      default_blank_color: String(row.default_blank_color ?? "white").trim() || "white",
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
  } else {
    payload.handmade_details = {
      material: String(row.material ?? "Cotton yarn").trim() || "Cotton yarn",
      lead_time_days: Number(row.lead_time_days) >= 0 ? Number(row.lead_time_days) : 7,
      personalization_available: parseBool(row.personalization) === true
    };
    if (row.care_instructions?.trim()) {
      payload.handmade_details.care_instructions = row.care_instructions.trim();
    }
  }

  const doPublish = parseBool(row.publish) === true;
  return { payload, doPublish };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fileArg = argv.find((a) => !a.startsWith("--"));
  if (!fileArg) {
    console.error("Usage: npm run admin:import-products -- <file.csv> [--dry-run]");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const envFile = loadEnvFile(envPath());
  const env = { ...envFile, ...process.env };

  const baseRaw = (env.ADMIN_IMPORT_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  const token = (env.ADMIN_SUPABASE_ACCESS_TOKEN || "").trim();

  if (!baseRaw && !dryRun) {
    console.error("Set NEXT_PUBLIC_SITE_URL or ADMIN_IMPORT_BASE_URL in .env.local");
    process.exit(1);
  }
  if (!token && !dryRun) {
    console.error(
      "Set ADMIN_SUPABASE_ACCESS_TOKEN in .env.local (Bearer JWT while logged in as admin; refresh when expired)."
    );
    process.exit(1);
  }

  const text = readFileSync(filePath, "utf8");
  const { rows } = parseCsv(text);
  if (rows.length === 0) {
    console.error("No data rows in CSV (need header + at least one row).");
    process.exit(1);
  }

  console.log(`Rows to import: ${rows.length}${dryRun ? " (dry-run)" : ""}`);
  if (!dryRun) {
    console.log(`Target: ${baseRaw}`);
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    let built;
    try {
      built = buildPayload(rows[i], i);
    } catch (e) {
      console.error(String(e instanceof Error ? e.message : e));
      fail++;
      continue;
    }

    const { payload, doPublish } = built;
    const label = `${payload.slug} (${payload.name})`;

    if (dryRun) {
      console.log(`[dry-run] OK  ${label}`);
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
      const bodyText = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        /* non-JSON body */
      }

      if (!res.ok) {
        const msg = parsed?.error || parsed?.message || bodyText;
        console.error(`FAIL ${label} → ${res.status} ${msg}`);
        fail++;
        continue;
      }

      const productId = parsed?.product?.id ?? null;
      if (doPublish && !productId) {
        console.error(`WARN ${label} created but could not read product id; skipped publish.`);
      }

      if (doPublish && productId) {
        const pub = await fetch(`${baseRaw}/api/admin/products/${productId}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!pub.ok) {
          const t = await pub.text();
          console.error(`WARN ${label} created but publish failed → ${pub.status} ${t}`);
        }
      }

      console.log(`OK   ${label}${doPublish && productId ? " (published)" : ""}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${label} → ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  console.log(`Done. ${ok} ok, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
