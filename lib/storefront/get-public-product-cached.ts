import { loadCachedPublicProductBySlug } from "@/lib/server/storefront-data-cache";
import { cache } from "react";

/**
 * Deduplicates Supabase work when `generateMetadata` and the page both need the same product,
 * and **reuses signed image URLs across requests** via Next `unstable_cache` (lower Supabase egress).
 * Pass a **trimmed, lowercased** slug from call sites so the cache key is stable.
 */
export const getPublicProductBySlugCached = cache((normalizedSlug: string) => {
  if (!normalizedSlug) {
    return Promise.resolve(null);
  }
  return loadCachedPublicProductBySlug(normalizedSlug);
});
