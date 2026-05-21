/**
 * Flat group slugs for studio_print_groups (DB: ^[a-z0-9-]+$).
 * Hierarchical catalog slugs like animals/fantasy map to the first segment.
 */

/** @type {Record<string, { name: string; description: string; sort_order: number }>} */
export const GROUP_CATALOG = {
  animals: {
    name: "Animals",
    description: "Wildlife, pets, and whimsical animal art.",
    sort_order: 900
  },
  fantasy: {
    name: "Fantasy",
    description: "Dreamlike, mythic, and imaginative subjects.",
    sort_order: 850
  },
  nature: {
    name: "Nature & Floral",
    description: "Botanical, floral, and natural scenery.",
    sort_order: 800
  },
  landscapes: {
    name: "Landscapes",
    description: "Coastal, scenic, and vista compositions.",
    sort_order: 750
  },
  nautical: {
    name: "Nautical",
    description: "Ocean, marine life, and maritime themes.",
    sort_order: 700
  },
  military: {
    name: "Military & Patriotic",
    description: "Service and patriotic nautical imagery.",
    sort_order: 650
  },
  vehicles: {
    name: "Vehicles",
    description: "Classic cars, trucks, and vintage vehicles.",
    sort_order: 600
  },
  automotive: {
    name: "Automotive",
    description: "Trucks, Jeeps, garage culture, and driving quotes.",
    sort_order: 550
  },
  humor: {
    name: "Humor",
    description: "Funny sayings and parody graphics.",
    sort_order: 500
  },
  quotes: {
    name: "Quotes & Typography",
    description: "Typographic wall art and sayings.",
    sort_order: 450
  },
  "birth-months": {
    name: "Birth Months",
    description: "Month-name birthstone and flower graphics.",
    sort_order: 400
  },
  holidays: {
    name: "Holidays",
    description: "Seasonal and holiday-themed designs.",
    sort_order: 350
  },
  sports: {
    name: "Sports",
    description: "Team mascots and sports branding (licensing review).",
    sort_order: 300
  },
  "retro-americana": {
    name: "Retro Americana",
    description: "Vintage USA nostalgia and classic scenes.",
    sort_order: 250
  },
  "graphic-art": {
    name: "Graphic Art",
    description: "Abstract and design-forward non-character pieces.",
    sort_order: 200
  },
  "pop-culture": {
    name: "Pop Culture",
    description: "Licensed character and franchise art (inactive until cleared).",
    sort_order: 150
  },
  kids: {
    name: "Kids & Party",
    description: "Birthday and children's party graphics.",
    sort_order: 100
  }
};

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeGroupSlug(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "graphic-art";
  const flat = s.split("/")[0].replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (flat && GROUP_CATALOG[flat]) return flat;
  if (flat) return flat;
  return "graphic-art";
}

/**
 * @param {string} slug
 */
export function groupMetaForSlug(slug) {
  const normalized = normalizeGroupSlug(slug);
  return (
    GROUP_CATALOG[normalized] ?? {
      name: normalized
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      description: null,
      sort_order: 0
    }
  );
}
