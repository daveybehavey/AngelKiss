import { HomeFeaturedProducts } from "@/components/storefront/home-featured";
import { loadCachedHomeFeaturedSummaries } from "@/lib/server/storefront-data-cache";
import { listPublicProducts, type PublicProductSummary } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function HomeFeaturedSection() {
  let items: PublicProductSummary[];
  if (process.env.NODE_ENV === "development") {
    try {
      const supabase = getSupabaseAdminClient();
      const result = await listPublicProducts(supabase, { limit: 4, skipSublimationDetails: true });
      items = result.items;
    } catch {
      items = [];
    }
  } else {
    items = await loadCachedHomeFeaturedSummaries();
  }
  return <HomeFeaturedProducts items={items} />;
}
