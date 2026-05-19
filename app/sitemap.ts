import { getSiteOrigin } from "@/lib/site-url";
import { loadCachedListPublicProductsForApi } from "@/lib/server/storefront-data-cache";
import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const now = new Date();

  const staticPaths = [
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

  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.75
  }));

  try {
    const { items } = await loadCachedListPublicProductsForApi({ limit: 500 });
    for (const item of items) {
      entries.push({
        url: `${origin}/shop/${item.slug}`,
        lastModified: new Date(item.created_at),
        changeFrequency: "weekly",
        priority: 0.65
      });
    }
  } catch {
    /* Missing env or DB during build — static URLs still published. */
  }

  return entries;
}
