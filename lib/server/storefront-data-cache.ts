import type { ProductCategory } from "@/lib/admin/products";
import {
  getPublishedShopOverview,
  getPublicProductBySlug,
  listPublicProducts,
  type PublicProductSummary,
  type PublishedShopOverview,
  type SublimationMode
} from "@/lib/storefront/products";
import { listActiveStudioPrints } from "@/lib/storefront/studio-prints";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";

function readStorefrontRevalidateSeconds(): number {
  const raw = process.env.STOREFRONT_DATA_REVALIDATE_SEC?.trim();
  if (!raw) {
    return 1800;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 1800;
  }
  return Math.min(86400, Math.max(60, n));
}

/** Next Data Cache + route `revalidate`: shop lists, product by slug, studio prints, featured strip.
 *  Default 1800 — must stay aligned with numeric `export const revalidate` on `app/page.tsx`, `app/shop/page.tsx`, and `app/shop/[slug]/page.tsx` (Next.js requires a static literal there). */
export const STOREFRONT_DATA_REVALIDATE_SEC = readStorefrontRevalidateSeconds();

const EMPTY_SHOP_OVERVIEW: PublishedShopOverview = {
  total: 0,
  handmade: 0,
  customSublimation: 0,
  customUpload: 0,
  readyMade: 0
};

function emptyListResult(): { items: PublicProductSummary[]; nextCursor: string | null } {
  return { items: [], nextCursor: null };
}

function shopCacheKeyParts(
  categoryFilter: ProductCategory | null,
  sublimationModeFilter: SublimationMode | null
): [string, string] {
  return [categoryFilter ?? "none", sublimationModeFilter ?? "none"];
}

export function loadCachedShopPageData(
  categoryFilter: ProductCategory | null,
  sublimationModeFilter: SublimationMode | null
) {
  const [ck, mk] = shopCacheKeyParts(categoryFilter, sublimationModeFilter);
  return unstable_cache(
    async () => {
      try {
        const supabase = getSupabaseAdminClient();
        const listCategory =
          categoryFilter ?? (sublimationModeFilter ? ("custom_sublimation" as const) : undefined);
        const listSublimationMode =
          categoryFilter === "custom_sublimation" ||
          (categoryFilter === undefined && sublimationModeFilter !== null)
            ? sublimationModeFilter ?? undefined
            : undefined;

        return Promise.all([
          getPublishedShopOverview(supabase),
          listPublicProducts(supabase, {
            category: listCategory,
            sublimationMode: listSublimationMode,
            limit: 200
          })
        ]);
      } catch {
        return [EMPTY_SHOP_OVERVIEW, emptyListResult()] as const;
      }
    },
    ["storefront-shop-v2", ck, mk],
    { revalidate: STOREFRONT_DATA_REVALIDATE_SEC }
  )();
}

export function loadCachedPublicProductBySlug(normalizedSlug: string) {
  return unstable_cache(
    async () => {
      try {
        const supabase = getSupabaseAdminClient();
        return await getPublicProductBySlug(supabase, normalizedSlug);
      } catch {
        return null;
      }
    },
    ["storefront-product-v2", normalizedSlug],
    { revalidate: STOREFRONT_DATA_REVALIDATE_SEC }
  )();
}

export function loadCachedActiveStudioPrints() {
  return unstable_cache(
    async () => {
      try {
        const supabase = getSupabaseAdminClient();
        return await listActiveStudioPrints(supabase);
      } catch {
        return [];
      }
    },
    ["storefront-studio-prints-v4"],
    { revalidate: STOREFRONT_DATA_REVALIDATE_SEC }
  )();
}

/** Home “featured” strip — same TTL as shop list to batch signed image URLs. */
export function loadCachedHomeFeaturedSummaries() {
  return unstable_cache(
    async (): Promise<PublicProductSummary[]> => {
      try {
        const supabase = getSupabaseAdminClient();
        const { items } = await listPublicProducts(supabase, {
          limit: 4,
          skipSublimationDetails: true
        });
        return items;
      } catch {
        return [];
      }
    },
    ["home-featured-public-4-v4"],
    { revalidate: STOREFRONT_DATA_REVALIDATE_SEC }
  )();
}

export function loadCachedListPublicProductsForApi(args: {
  category?: ProductCategory | undefined;
  sublimation_mode?: SublimationMode | undefined;
  q?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}) {
  const key = JSON.stringify(args);
  return unstable_cache(
    async () => {
      try {
        const supabase = getSupabaseAdminClient();
        const category = args.category;
        const sublimationMode =
          category === "custom_sublimation" ||
          (category === undefined && args.sublimation_mode !== undefined)
            ? args.sublimation_mode
            : undefined;
        return await listPublicProducts(supabase, {
          category: category ?? (sublimationMode ? "custom_sublimation" : undefined),
          sublimationMode,
          q: args.q,
          limit: args.limit,
          cursor: args.cursor
        });
      } catch {
        return emptyListResult();
      }
    },
    ["api-public-products-v2", key],
    { revalidate: STOREFRONT_DATA_REVALIDATE_SEC }
  )();
}
