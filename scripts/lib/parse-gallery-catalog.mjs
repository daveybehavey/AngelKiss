import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeGroupSlug } from "./gallery-catalog-groups.mjs";

const FIELD_RE = /^\|\s\*\*(\w+)\*\*\s\|\s(.+)\s\|$/;

/**
 * @param {string} raw
 */
export function normalizeSearchTags(raw) {
  if (!raw?.trim()) return null;
  const tags = raw
    .split(",")
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean)
    .slice(0, 20)
    .map((t) => t.slice(0, 40));
  return tags.length ? tags.join(", ") : null;
}

/**
 * @param {string} notes
 */
export function isTrademarkNotes(notes) {
  return /\*\*Trademark:\*\*/i.test(notes ?? "");
}

/**
 * @param {{ num: string; notes: string }} entry
 */
export function resolveIsActive(entry) {
  if (entry.num === "146") return false;
  if (isTrademarkNotes(entry.notes)) return false;
  return true;
}

/**
 * Parse GALLERY_CATALOG_RECOMMENDATIONS.md entry blocks (### NNN).
 * @param {string} mdPath
 */
export function parseGalleryCatalogMarkdown(mdPath) {
  const text = readFileSync(mdPath, "utf8");
  const lines = text.split(/\r?\n/);
  /** @type {import('./parse-gallery-catalog.mjs').CatalogEntry[]} */
  const entries = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^### (\d{3})$/);
    if (heading) {
      if (current?.id) entries.push(current);
      current = { num: heading[1] };
      continue;
    }
    if (!current) continue;
    const m = line.match(FIELD_RE);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith("`") && value.endsWith("`")) {
      value = value.slice(1, -1);
    }
    current[key] = value;
  }
  if (current?.id) entries.push(current);

  return entries.map((e) => {
    const group_slug = normalizeGroupSlug(e.group_slug);
    const search_tags = normalizeSearchTags(e.search_tags);
    const is_active = resolveIsActive({ num: e.num, notes: e.notes ?? "" });
    return {
      num: e.num,
      id: e.id,
      display_title: (e.display_title ?? "").trim(),
      subtitle: (e.subtitle ?? "").trim() || null,
      alt_text: (e.display_title ?? "").trim().slice(0, 300) || null,
      search_tags,
      group_slug,
      notes: e.notes ?? "",
      is_active,
      has_trademark: isTrademarkNotes(e.notes ?? "")
    };
  });
}

/**
 * @param {string} cwd
 */
export function loadManifestByNum(cwd) {
  const raw = readFileSync(resolve(cwd, ".gallery-manifest.json"), "utf8");
  /** @type {{ num: string; id: string }[]} */
  const list = JSON.parse(raw);
  const byNum = new Map(list.map((r) => [r.num, r.id]));
  return byNum;
}

/**
 * @typedef {Object} CatalogEntry
 * @property {string} num
 * @property {string} id
 * @property {string} display_title
 * @property {string | null} subtitle
 * @property {string | null} alt_text
 * @property {string | null} search_tags
 * @property {string} group_slug
 * @property {string} notes
 * @property {boolean} is_active
 * @property {boolean} has_trademark
 */
