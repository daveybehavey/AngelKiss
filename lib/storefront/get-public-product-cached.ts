import { cache } from "react";
import { getPublicProductBySlug } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Deduplicates Supabase work when `generateMetadata` and the page both need the same product.
 * Pass a **trimmed, lowercased** slug from call sites so the cache key is stable.
 */
export const getPublicProductBySlugCached = cache(async (normalizedSlug: string) => {
  if (!normalizedSlug) {
    return null;
  }
  const supabase = getSupabaseAdminClient();
  return getPublicProductBySlug(supabase, normalizedSlug);
});
