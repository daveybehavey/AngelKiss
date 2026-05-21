#!/usr/bin/env node
/**
 * One-shot: normalize GALLERY_CATALOG_RECOMMENDATIONS.md for DB-compatible flat group_slug,
 * lowercase search_tags, and duplicate/trademark notes.
 *
 * Usage: node scripts/normalize-gallery-catalog-md.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeGroupSlug, GROUP_CATALOG } from "./lib/gallery-catalog-groups.mjs";
import { normalizeSearchTags } from "./lib/parse-gallery-catalog.mjs";

const MD = resolve(process.cwd(), "GALLERY_CATALOG_RECOMMENDATIONS.md");

function slugReplacements() {
  /** @type {Map<string, string>} */
  const map = new Map();
  const text = readFileSync(MD, "utf8");
  for (const m of text.matchAll(/\*\*group_slug\*\* \| `([^`]+)`/g)) {
    const raw = m[1];
    const flat = normalizeGroupSlug(raw);
    if (raw !== flat) map.set(raw, flat);
  }
  return map;
}

function fixTaxonomySection(text) {
  const start = text.indexOf("## Proposed category taxonomy");
  if (start < 0) return text;
  const end = text.indexOf("---\n\n## Deduplicated tag vocabulary", start);
  if (end < 0) return text;

  const rows = Object.entries(GROUP_CATALOG)
    .sort((a, b) => b[1].sort_order - a[1].sort_order)
    .map(([slug, meta]) => `| ${meta.name} | \`${slug}\` | ${meta.description} |`)
    .join("\n");

  const block = `## Proposed category taxonomy

Top-level categories for \`studio_print_groups\` (flat slugs matching DB constraint \`^[a-z0-9-]+$\`). Each print uses one primary \`group_slug\`.

| Name | Slug | Description |
|------|------|-------------|
${rows}
`;

  return text.slice(0, start) + block + text.slice(end);
}

function main() {
  let text = readFileSync(MD, "utf8");
  const reps = slugReplacements();
  let slugFixCount = 0;
  for (const [from, to] of reps) {
    const needle = `| **group_slug** | \`${from}\` |`;
    const repl = `| **group_slug** | \`${to}\` |`;
    const parts = text.split(needle);
    if (parts.length > 1) {
      slugFixCount += parts.length - 1;
      text = parts.join(repl);
    }
  }

  text = text.replace(
    /\| \*\*search_tags\*\* \| ([^\n|]+) \|/g,
    (_, tags) => `| **search_tags** | ${normalizeSearchTags(tags) ?? ""} |`
  );

  // Entry 146: clarify inactive duplicate
  text = text.replace(
    /(\| \*\*notes\*\* \| \*\*Trademark:\*\* Disney\. Near-duplicate of 132—pick one primary listing\. \|)/,
    "| **notes** | **Trademark:** Disney. Near-duplicate of 132—**publish:** keep 132 active; set 146 `is_active=false`. |"
  );

  // Entry 132: cross-ref
  text = text.replace(
    /(\| \*\*notes\*\* \| \*\*Trademark:\*\* Disney\. Duplicate asset also cataloged as 146\. \|)/,
    "| **notes** | **Trademark:** Disney. Primary listing for duplicate capture 146 (146 stays inactive). |"
  );

  text = fixTaxonomySection(text);

  const nearDup = `**Near-duplicates:** **132** (primary) and **146** (inactive duplicate—same Disney chibi collage). **044** / **045** noted as near-duplicate quotes in entry 045.

**Publishing policy:** Entries with \`**Trademark:**\` in notes are cataloged but should remain \`is_active=false\` until licensing is confirmed. Apply script enforces this automatically.`;

  text = text.replace(
    /\*\*Near-duplicates:\*\*[\s\S]*?\*\*044\*\* \/ \*\*045\*\* noted as near-duplicate quotes in entry 045\./,
    nearDup
  );

  writeFileSync(MD, text, "utf8");
  console.log(
    `normalize-gallery-catalog-md: updated ${MD} (${slugFixCount} group_slug flatten(s), tags lowercased, taxonomy refreshed)`
  );
}

main();
