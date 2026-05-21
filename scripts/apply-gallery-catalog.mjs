#!/usr/bin/env node
/**
 * Apply GALLERY_CATALOG_RECOMMENDATIONS.md metadata to production studio prints.
 * Matches rows by UUID from .gallery-manifest.json. Does not rename storage_path.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
 *
 * Usage:
 *   node scripts/apply-gallery-catalog.mjs --dry-run
 *   node scripts/apply-gallery-catalog.mjs --apply
 *   node scripts/apply-gallery-catalog.mjs --apply --sample 8
 */
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { parseGalleryCatalogMarkdown, loadManifestByNum } from "./lib/parse-gallery-catalog.mjs";
import { GROUP_CATALOG, groupMetaForSlug } from "./lib/gallery-catalog-groups.mjs";

const BATCH = 25;

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
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply"),
    sample: (() => {
      const i = argv.indexOf("--sample");
      if (i >= 0 && argv[i + 1]) return Math.max(1, parseInt(argv[i + 1], 10) || 5);
      return 0;
    })()
  };
}

/**
 * @param {Awaited<ReturnType<typeof parseGalleryCatalogMarkdown>>} entries
 */
function buildGroupMembers(entries) {
  /** @type {Map<string, Set<string>>} */
  const bySlug = new Map();
  for (const e of entries) {
    if (!e.is_active) continue;
    const slug = e.group_slug;
    if (!bySlug.has(slug)) bySlug.set(slug, new Set());
    bySlug.get(slug).add(e.id);
  }
  return bySlug;
}

async function main() {
  const cwd = process.cwd();
  mergeEnv(cwd);
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.dryRun && !opts.apply) {
    console.error("apply-gallery-catalog: pass --dry-run or --apply");
    process.exit(1);
  }

  const mdPath = resolve(cwd, "GALLERY_CATALOG_RECOMMENDATIONS.md");
  const entries = parseGalleryCatalogMarkdown(mdPath);
  const manifestByNum = loadManifestByNum(cwd);

  const mismatches = [];
  for (const e of entries) {
    const manifestId = manifestByNum.get(e.num);
    if (manifestId && manifestId !== e.id) {
      mismatches.push({ num: e.num, md: e.id, manifest: manifestId });
    }
  }
  if (mismatches.length) {
    console.error("apply-gallery-catalog: manifest/id mismatches:", mismatches.slice(0, 5));
    process.exit(1);
  }
  if (entries.length !== 159) {
    console.error(`apply-gallery-catalog: expected 159 entries, got ${entries.length}`);
    process.exit(1);
  }

  const inactive = entries.filter((e) => !e.is_active);
  const trademarkInactive = inactive.filter((e) => e.has_trademark);
  const duplicateInactive = inactive.filter((e) => e.num === "146");

  console.log(
    `apply-gallery-catalog: ${entries.length} entries, ${entries.filter((e) => e.is_active).length} active, ${inactive.length} inactive (${trademarkInactive.length} trademark, ${duplicateInactive.length} duplicate 146)`
  );

  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    if (opts.apply) {
      console.error(
        "apply-gallery-catalog: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
      );
      process.exit(1);
    }
    console.log("apply-gallery-catalog: no Supabase credentials — dry-run metadata only");
    printSampleDiff(entries, null, opts.sample || 6);
    writeExport(cwd, entries, buildGroupMembers(entries));
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const ids = entries.map((e) => e.id);
  const { data: existing, error: selErr } = await supabase
    .from("sublimation_studio_prints")
    .select("id,title,subtitle,alt_text,search_tags,is_active,storage_path")
    .in("id", ids);

  if (selErr) {
    console.error("apply-gallery-catalog: select prints failed", selErr.message);
    process.exit(1);
  }

  const byId = new Map((existing ?? []).map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`apply-gallery-catalog: ${missing.length} manifest id(s) not in DB`, missing.slice(0, 5));
    process.exit(1);
  }

  printSampleDiff(entries, byId, opts.sample || 6);

  if (opts.dryRun) {
    summarizeChanges(entries, byId);
    writeExport(cwd, entries, buildGroupMembers(entries));
    console.log("apply-gallery-catalog: dry-run complete (no writes)");
    return;
  }

  let updated = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    for (const e of chunk) {
      const patch = {
        title: e.display_title,
        subtitle: e.subtitle,
        alt_text: e.alt_text,
        search_tags: e.search_tags,
        is_active: e.is_active
      };
      const { error } = await supabase.from("sublimation_studio_prints").update(patch).eq("id", e.id);
      if (error) {
        console.error(`apply-gallery-catalog: update ${e.num} failed`, error.message);
        process.exit(1);
      }
      updated++;
    }
  }

  const memberMap = buildGroupMembers(entries);
  const slugsUsed = [...memberMap.keys()];
  let groupsUpserted = 0;
  let membersWritten = 0;

  const { data: existingGroups } = await supabase
    .from("studio_print_groups")
    .select("id,slug");

  const groupIdBySlug = new Map((existingGroups ?? []).map((g) => [g.slug, g.id]));

  for (const slug of slugsUsed) {
    const meta = groupMetaForSlug(slug);
    const catalog = GROUP_CATALOG[slug];
    let groupId = groupIdBySlug.get(slug);

    if (!groupId) {
      const { data: inserted, error: insErr } = await supabase
        .from("studio_print_groups")
        .insert({
          name: meta.name,
          slug,
          description: catalog?.description ?? meta.description,
          sort_order: catalog?.sort_order ?? meta.sort_order ?? 0,
          is_active: true
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        console.error(`apply-gallery-catalog: create group ${slug}`, insErr?.message);
        process.exit(1);
      }
      groupId = inserted.id;
      groupIdBySlug.set(slug, groupId);
      groupsUpserted++;
    } else {
      const { error: upErr } = await supabase
        .from("studio_print_groups")
        .update({
          name: meta.name,
          description: catalog?.description ?? meta.description,
          sort_order: catalog?.sort_order ?? meta.sort_order ?? 0,
          is_active: true
        })
        .eq("id", groupId);
      if (upErr) {
        console.error(`apply-gallery-catalog: update group ${slug}`, upErr.message);
        process.exit(1);
      }
      groupsUpserted++;
    }

    const printIds = [...memberMap.get(slug)];
    const { error: delErr } = await supabase
      .from("studio_print_group_members")
      .delete()
      .eq("group_id", groupId);
    if (delErr) {
      console.error(`apply-gallery-catalog: clear members ${slug}`, delErr.message);
      process.exit(1);
    }

    if (printIds.length > 0) {
      const rows = printIds.map((studio_print_id, index) => ({
        group_id: groupId,
        studio_print_id,
        sort_order: printIds.length - index
      }));
      const { error: memErr } = await supabase.from("studio_print_group_members").insert(rows);
      if (memErr) {
        console.error(`apply-gallery-catalog: insert members ${slug}`, memErr.message);
        process.exit(1);
      }
      membersWritten += rows.length;
    }
  }

  console.log(
    `apply-gallery-catalog: applied ${updated} print updates, ${groupsUpserted} groups touched, ${membersWritten} member rows`
  );
  writeExport(cwd, entries, memberMap);
}

/**
 * @param {ReturnType<typeof parseGalleryCatalogMarkdown>} entries
 * @param {Map<string, object> | null} byId
 * @param {number} n
 */
function printSampleDiff(entries, byId, n) {
  const sample = entries.filter((e) => byId?.has(e.id) ?? true).slice(0, n);
  console.log("\n--- sample changes ---");
  for (const e of sample) {
    const cur = byId?.get(e.id);
    console.log(`#${e.num} ${e.id.slice(0, 8)}…`);
    if (cur) {
      if (cur.title !== e.display_title) console.log(`  title: ${JSON.stringify(cur.title)} → ${JSON.stringify(e.display_title)}`);
      if ((cur.subtitle ?? null) !== e.subtitle)
        console.log(`  subtitle: ${JSON.stringify(cur.subtitle)} → ${JSON.stringify(e.subtitle)}`);
      if ((cur.search_tags ?? null) !== e.search_tags)
        console.log(`  search_tags: ${JSON.stringify(cur.search_tags)} → ${JSON.stringify(e.search_tags)}`);
      if (cur.is_active !== e.is_active) console.log(`  is_active: ${cur.is_active} → ${e.is_active}`);
    } else {
      console.log(`  title: → ${JSON.stringify(e.display_title)}`);
      console.log(`  group: ${e.group_slug} active=${e.is_active}`);
    }
  }
  console.log("---\n");
}

/**
 * @param {ReturnType<typeof parseGalleryCatalogMarkdown>} entries
 * @param {Map<string, { title: string; subtitle: string | null; search_tags: string | null; is_active: boolean }>} byId
 */
function summarizeChanges(entries, byId) {
  let title = 0;
  let tags = 0;
  let active = 0;
  for (const e of entries) {
    const cur = byId.get(e.id);
    if (!cur) continue;
    if (cur.title !== e.display_title) title++;
    if ((cur.search_tags ?? null) !== e.search_tags) tags++;
    if (cur.is_active !== e.is_active) active++;
  }
  console.log(
    `apply-gallery-catalog: would change titles=${title}, search_tags=${tags}, is_active=${active}`
  );
}

/**
 * @param {string} cwd
 * @param {ReturnType<typeof parseGalleryCatalogMarkdown>} entries
 * @param {Map<string, Set<string>>} memberMap
 */
function writeExport(cwd, entries, memberMap) {
  const out = {
    generated_at: new Date().toISOString(),
    entries,
    groups: Object.fromEntries(
      [...memberMap.entries()].map(([slug, ids]) => [slug, [...ids]])
    )
  };
  const path = resolve(cwd, ".gallery-catalog-export.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(`apply-gallery-catalog: wrote ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
