#!/usr/bin/env node
/**
 * Remove iOS-style duplicate studio prints: same display name except a trailing " 1", " 2", etc.
 * (e.g. "Studio print 011011329" vs "Studio print 011011329 1"). Prefers keeping the row whose title
 * exactly matches the cluster base (no " 1" suffix); otherwise keeps oldest `created_at`. Deletes
 * the other row(s) and their storage objects.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY,
 *   optional SUPABASE_PRODUCT_IMAGES_BUCKET
 *
 * Usage:
 *   npm run admin:dedupe-studio-prints-trailing -- --dry-run
 *   npm run admin:dedupe-studio-prints-trailing
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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

/**
 * iOS duplicate filenames become titles like "Studio print 011011329 1" alongside "Studio print 011011329".
 * Only a *short* trailing " 1" … " 99" (space + 1–2 digits at end) counts as a copy suffix — not the main numeric id.
 */
function clusterKeyFromTitle(title) {
  const t = String(title ?? "").trim();
  const m = t.match(/^(.+)\s+([1-9]\d?)$/);
  if (m) {
    const n = Number.parseInt(m[2], 10);
    if (n >= 1 && n <= 99) {
      return m[1].trim().toLowerCase();
    }
  }
  return t.toLowerCase();
}

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

/** Prefer canonical title (matches cluster key); else oldest in group. */
function pickKeeper(groupKey, list) {
  const exact = list.filter((r) => r.title.trim().toLowerCase() === groupKey);
  if (exact.length > 0) {
    return [...exact].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  }
  return [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    console.error(
      "dedupe-studio-prints-trailing: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucket = getProductImagesBucket();

  const { data: rows, error } = await supabase
    .from("sublimation_studio_prints")
    .select("id,title,storage_path,created_at")
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    console.error("dedupe-studio-prints-trailing: select failed", error?.message);
    process.exit(1);
  }

  /** @type {Map<string, typeof rows>} */
  const groups = new Map();
  for (const r of rows) {
    const k = clusterKeyFromTitle(r.title);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const toRemove = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const keeper = pickKeeper(k, list);
    for (const r of list) {
      if (r.id !== keeper.id) {
        toRemove.push({ ...r, groupKey: k });
      }
    }
  }

  if (!toRemove.length) {
    console.log("dedupe-studio-prints-trailing: no trailing-number duplicate groups found.");
    process.exit(0);
  }

  console.log(
    `dedupe-studio-prints-trailing: ${toRemove.length} row(s) in ${new Set(toRemove.map((x) => x.groupKey)).size} group(s) (keep canonical title when present, else oldest)`
  );
  for (const m of toRemove.slice(0, 40)) {
    console.log(`  remove id=${m.id} title=${JSON.stringify(m.title)}`);
  }
  if (toRemove.length > 40) {
    console.log(`  … and ${toRemove.length - 40} more`);
  }

  if (opts.dryRun) {
    console.log("dedupe-studio-prints-trailing: dry-run — no deletes.");
    process.exit(0);
  }

  for (const m of toRemove) {
    const { error: rmErr } = await supabase.storage.from(bucket).remove([m.storage_path]);
    if (rmErr) {
      console.warn(`  storage remove warn id=${m.id}: ${rmErr.message}`);
    }
  }

  const ids = toRemove.map((m) => m.id);
  const { error: delErr } = await supabase.from("sublimation_studio_prints").delete().in("id", ids);
  if (delErr) {
    console.error("dedupe-studio-prints-trailing: delete failed", delErr.message);
    process.exit(1);
  }

  console.log(`dedupe-studio-prints-trailing: deleted ${ids.length} duplicate row(s).`);
}

main().catch((e) => {
  console.error("dedupe-studio-prints-trailing:", e instanceof Error ? e.message : e);
  process.exit(1);
});
