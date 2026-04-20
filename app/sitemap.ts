import { getSiteOrigin } from "@/lib/site-url";
import { listPublicProducts } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const now = new Date();

  const staticPaths = [
    "",
    "/shop",
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
    const supabase = getSupabaseAdminClient();
    const { items } = await listPublicProducts(supabase, { limit: 500 });
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
