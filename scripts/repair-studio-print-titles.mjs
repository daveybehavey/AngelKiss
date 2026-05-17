#!/usr/bin/env node
/**
 * One-shot: prettify sublimation_studio_prints titles (strip iOS export noise), assign short
 * catalog names (AnglKiss Gallery · NNN) for numeric-only designs, then remove exact duplicate
 * titles (same string case-insensitive) keeping oldest created_at.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET
 *
 * Usage:
 *   npm run admin:repair-studio-print-titles -- --dry-run
 *   npm run admin:repair-studio-print-titles
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import {
  assignGalleryCatalogTitle,
  needsCatalogTitle,
  prettifyStudioPrintTitle
} from "./lib/studio-print-title.mjs";

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

function altFromTitle(title) {
  const t = String(title || "").trim();
  return t.length > 300 ? t.slice(0, 297) + "…" : t;
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  return { dryRun };
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    console.error(
      "repair-studio-print-titles: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucket = getProductImagesBucket();

  const { data: rows, error: selErr } = await supabase
    .from("sublimation_studio_prints")
    .select("id,title,storage_path,created_at")
    .order("created_at", { ascending: true });

  if (selErr || !rows) {
    console.error("repair-studio-print-titles: select failed", selErr?.message);
    process.exit(1);
  }

  /** @type {Map<string, typeof rows>} */
  const byTitleKey = new Map();
  for (const r of rows) {
    const k = r.title.trim().toLowerCase();
    if (!byTitleKey.has(k)) byTitleKey.set(k, []);
    byTitleKey.get(k).push(r);
  }

  const duplicateGroups = [...byTitleKey.entries()].filter(([, list]) => list.length > 1);
  const idsToDelete = [];
  const deleteMeta = [];
  for (const [, list] of duplicateGroups) {
    const sorted = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const [, ...dups] = sorted;
    for (const d of dups) {
      idsToDelete.push(d.id);
      deleteMeta.push({ id: d.id, title: d.title, storage_path: d.storage_path });
    }
  }

  if (duplicateGroups.length) {
    console.log(
      `repair-studio-print-titles: found ${duplicateGroups.length} duplicate title group(s), ${idsToDelete.length} row(s) to remove (keep oldest per title)`
    );
    for (const m of deleteMeta.slice(0, 25)) {
      console.log(`  remove duplicate id=${m.id} title=${JSON.stringify(m.title)} path=${m.storage_path}`);
    }
    if (deleteMeta.length > 25) {
      console.log(`  … and ${deleteMeta.length - 25} more`);
    }
  } else {
    console.log("repair-studio-print-titles: no exact duplicate titles");
  }

  if (!opts.dryRun && idsToDelete.length) {
    for (const m of deleteMeta) {
      const { error: rmErr } = await supabase.storage.from(bucket).remove([m.storage_path]);
      if (rmErr) {
        console.warn(`  storage remove warn id=${m.id}: ${rmErr.message}`);
      }
    }
    const { error: delErr } = await supabase.from("sublimation_studio_prints").delete().in("id", idsToDelete);
    if (delErr) {
      console.error("repair-studio-print-titles: delete duplicates failed", delErr.message);
      process.exit(1);
    }
    console.log(`repair-studio-print-titles: deleted ${idsToDelete.length} duplicate row(s)`);
  } else if (opts.dryRun && idsToDelete.length) {
    console.log(`repair-studio-print-titles: dry-run — would delete ${idsToDelete.length} duplicate row(s) + storage`);
  }

  const { data: afterRows, error: afterErr } = await supabase
    .from("sublimation_studio_prints")
    .select("id,title,alt_text,sort_order,created_at")
    .order("created_at", { ascending: true });

  if (afterErr || !afterRows) {
    console.error("repair-studio-print-titles: re-select failed", afterErr?.message);
    process.exit(1);
  }

  const proposed = afterRows.map((r) => ({
    ...r,
    newTitle: prettifyStudioPrintTitle(r.title)
  }));

  let maxCatalogIndex = 0;
  for (const r of proposed) {
    const m = String(r.title).trim().match(/^(?:AnglKiss Gallery|AngiKiss gallery) · (\d+)$/i);
    if (m) {
      maxCatalogIndex = Math.max(maxCatalogIndex, Number.parseInt(m[1], 10));
    }
  }

  const recatalog = proposed.filter((r) => needsCatalogTitle(r.newTitle));
  recatalog.sort((a, b) => {
    const so = (b.sort_order ?? 0) - (a.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  /** @type {Map<string, string>} */
  const idToCatalogTitle = new Map();
  for (let i = 0; i < recatalog.length; i++) {
    idToCatalogTitle.set(recatalog[i].id, assignGalleryCatalogTitle(maxCatalogIndex + i + 1));
  }

  let updateCount = 0;
  const updates = [];
  for (const r of proposed) {
    const newTitle = idToCatalogTitle.get(r.id) ?? r.newTitle;
    const newAlt = altFromTitle(newTitle);
    if (newTitle !== r.title || newAlt !== (r.alt_text ?? "")) {
      updates.push({ id: r.id, title: newTitle, alt_text: newAlt, old: r.title });
    }
  }

  if (recatalog.length) {
    console.log(
      `repair-studio-print-titles: assign catalog codes to ${recatalog.length} print(s), starting at ${maxCatalogIndex + 1}`
    );
  }

  if (updates.length) {
    console.log(`repair-studio-print-titles: ${updates.length} title/alt update(s)`);
    for (const u of updates.slice(0, 20)) {
      console.log(`  ${JSON.stringify(u.old)} → ${JSON.stringify(u.title)}`);
    }
    if (updates.length > 20) {
      console.log(`  … and ${updates.length - 20} more`);
    }
  } else {
    console.log("repair-studio-print-titles: no title changes needed");
  }

  if (opts.dryRun) {
    console.log("repair-studio-print-titles: dry-run — no DB/storage writes for updates");
    process.exit(0);
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("sublimation_studio_prints")
      .update({ title: u.title, alt_text: u.alt_text })
      .eq("id", u.id);
    if (upErr) {
      console.error(`repair-studio-print-titles: update failed id=${u.id}: ${upErr.message}`);
      process.exit(1);
    }
    updateCount++;
  }

  console.log(`repair-studio-print-titles: done — updated ${updateCount} row(s)`);
}

main().catch((e) => {
  console.error("repair-studio-print-titles:", e instanceof Error ? e.message : e);
  process.exit(1);
});
