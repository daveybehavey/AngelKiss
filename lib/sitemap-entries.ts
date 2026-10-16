import type { MetadataRoute } from "next";

export const STATIC_SITEMAP_PATHS = [
  "",
  "/shop",
  "/gallery",
  "/about",
  "/cart",
  "/checkout",
  "/shipping",
  "/returns",
  "/privacy"
] as const;

export type SitemapProductInput = {
  slug: string;
  /** Real product create time from the database — never generation time. */
  created_at: string;
};

/**
 * Static marketing/legal routes have no trustworthy per-page content dates in
 * this codebase, so lastModified is omitted (Google ignores inaccurate stamps).
 */
export function buildStaticSitemapEntries(origin: string): MetadataRoute.Sitemap {
  return STATIC_SITEMAP_PATHS.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.75
  }));
}

/**
 * Product PDP URLs use the product's real created_at from the catalog.
 */
export function buildProductSitemapEntries(
  origin: string,
  items: SitemapProductInput[]
): MetadataRoute.Sitemap {
  return items.map((item) => ({
    url: `${origin}/shop/${item.slug}`,
    lastModified: new Date(item.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.65
  }));
}
