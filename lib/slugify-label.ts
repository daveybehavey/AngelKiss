/** URL-safe slug from a human label (product variant, theme, etc.). */
export function slugifyLabel(name: string, maxLength = 80): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
