import { getSiteOrigin } from "@/lib/site-url";
import { loadCachedListPublicProductsForApi } from "@/lib/server/storefront-data-cache";
import {
  buildProductSitemapEntries,
  buildStaticSitemapEntries
} from "@/lib/sitemap-entries";
import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const entries: MetadataRoute.Sitemap = buildStaticSitemapEntries(origin);

  try {
    const { items } = await loadCachedListPublicProductsForApi({ limit: 500 });
    entries.push(...buildProductSitemapEntries(origin, items));
  } catch {
    /* Missing env or DB during build — static URLs still published. */
  }

  return entries;
}
