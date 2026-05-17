/** Normalize admin input into stored comma-separated search_tags (max 20 tags, 40 chars each). */
export function formatSearchTagsForStorage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const tags = raw
    .split(",")
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 20)
    .map((t) => t.slice(0, 40));
  if (tags.length === 0) {
    return null;
  }
  return tags.join(", ");
}
