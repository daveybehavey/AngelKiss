import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";

/** Split admin-entered comma-separated tags; lowercase for matching. */
export function parseSearchTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeGallerySearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function haystackForPrint(print: PublicStudioPrint): string {
  const parts = [
    print.title,
    print.subtitle ?? "",
    ...parseSearchTags(print.search_tags)
  ];
  return parts.join(" ").toLowerCase();
}

/** Client-side filter: matches words in title, subtitle, or search_tags. */
export function filterStudioPrintsBySearch(
  prints: PublicStudioPrint[],
  query: string | null | undefined
): PublicStudioPrint[] {
  const q = normalizeGallerySearchQuery(query);
  if (!q) {
    return prints;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return prints;
  }

  return prints.filter((print) => {
    const haystack = haystackForPrint(print);
    return tokens.every((token) => haystack.includes(token));
  });
}
