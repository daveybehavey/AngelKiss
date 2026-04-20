import type { ProductCategory } from "@/lib/admin/products";
import { ShopProductGrid } from "@/components/storefront/shop-product-grid";
import {
  getPublishedShopOverview,
  listPublicProducts,
  type SublimationMode
} from "@/lib/storefront/products";
import { buildShopHref } from "@/lib/storefront/shop-urls";
import {
  SHOP_DEFAULT_DESCRIPTION,
  SHOP_HANDMADE_DESCRIPTION,
  SHOP_READY_MADE_DESCRIPTION,
  SHOP_SUBLIMATION_DESCRIPTION,
  SHOP_UPLOAD_DESCRIPTION
} from "@/lib/seo/shop-descriptions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

function normalizeCategoryFilter(value: string | undefined): ProductCategory | null {
  if (value === "custom_sublimation") {
    return "custom_sublimation";
  }
  if (value === "handmade_crochet_knit") {
    return "handmade_crochet_knit";
  }
  return null;
}

function normalizeSublimationModeFilter(value: string | undefined): SublimationMode | null {
  if (value === "customer_upload" || value === "upload") {
    return "customer_upload";
  }
  if (value === "ready_made_design" || value === "ready_made") {
    return "ready_made_design";
  }
  return null;
}

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sublimation_mode?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = normalizeCategoryFilter(params.category);
  const sublimationMode = normalizeSublimationModeFilter(params.sublimation_mode);

  let title = "Shop";
  let description = SHOP_DEFAULT_DESCRIPTION;

  if (sublimationMode === "customer_upload") {
    title = "Shop Upload-Your-Photo Sublimation";
    description = SHOP_UPLOAD_DESCRIPTION;
  } else if (sublimationMode === "ready_made_design") {
    title = "Shop Ready-Made Sublimation Designs";
    description = SHOP_READY_MADE_DESCRIPTION;
  } else if (category === "custom_sublimation") {
    title = "Shop Sublimation Prints";
    description = SHOP_SUBLIMATION_DESCRIPTION;
  } else if (category === "handmade_crochet_knit") {
    title = "Shop Crochet & Knit";
    description = SHOP_HANDMADE_DESCRIPTION;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

export default async function ShopPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sublimation_mode?: string }>;
}) {
  const params = await searchParams;
  const categoryFilter = normalizeCategoryFilter(params.category);
  const sublimationModeFilter = normalizeSublimationModeFilter(params.sublimation_mode);

  const supabase = getSupabaseAdminClient();

  const listCategory =
    categoryFilter ?? (sublimationModeFilter ? ("custom_sublimation" as const) : undefined);
  const listSublimationMode =
    categoryFilter === "custom_sublimation" ||
    (categoryFilter === undefined && sublimationModeFilter !== null)
      ? sublimationModeFilter ?? undefined
      : undefined;

  const [overview, { items: filteredItems }] = await Promise.all([
    getPublishedShopOverview(supabase),
    listPublicProducts(supabase, {
      category: listCategory,
      sublimationMode: listSublimationMode,
      limit: 200
    })
  ]);

  const {
    total: itemsTotal,
    handmade: handmadeCount,
    customSublimation: customSublimationCount,
    customUpload: customUploadCount,
    readyMade: readyMadeCount
  } = overview;

  return (
    <main className="page-main shop-page">
      <section className="panel shop-hero shop-hero-enhanced">
        <div className="shop-hero-glow" aria-hidden="true" />
        <p className="shop-hero-eyebrow">The collection</p>
        <h1>Shop AnglKiss Creations</h1>
        <p className="shop-hero-lead">
          Handmade crochet and knit, ready-made print designs, and custom photo products—all in
          one place.
        </p>
      </section>

      <section className="shop-overview-grid shop-overview-stagger" aria-label="Collection overview">
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Handmade</p>
          <p className="shop-overview-value">{handmadeCount}</p>
          <p className="shop-overview-copy">Crochet & knit pieces currently listed.</p>
        </article>
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Custom Upload</p>
          <p className="shop-overview-value">{customUploadCount}</p>
          <p className="shop-overview-copy">Photo-upload products ready for personalization.</p>
        </article>
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Ready-Made Prints</p>
          <p className="shop-overview-value">{readyMadeCount}</p>
          <p className="shop-overview-copy">In-house designs made to order.</p>
        </article>
      </section>

      <section className="shop-toolbar" aria-label="Category filters">
        <Link
          href={buildShopHref({})}
          className={`chip ${
            categoryFilter === null && sublimationModeFilter === null ? "active" : ""
          }`}
          prefetch={false}
        >
          All ({itemsTotal})
        </Link>
        <Link
          href={buildShopHref({ category: "handmade_crochet_knit" })}
          className={`chip ${categoryFilter === "handmade_crochet_knit" ? "active" : ""}`}
          prefetch={false}
        >
          Handmade ({handmadeCount})
        </Link>
        <Link
          href={buildShopHref({ category: "custom_sublimation" })}
          className={`chip ${categoryFilter === "custom_sublimation" ? "active" : ""}`}
          prefetch={false}
        >
          Sublimation ({customSublimationCount})
        </Link>
      </section>

      {categoryFilter === "custom_sublimation" || sublimationModeFilter !== null ? (
        <section
          className="shop-toolbar shop-toolbar-secondary"
          aria-label="Sublimation type filters"
        >
          <Link
            href={buildShopHref({ category: "custom_sublimation" })}
            className={`chip ${
              categoryFilter === "custom_sublimation" && sublimationModeFilter === null
                ? "active"
                : ""
            }`}
            prefetch={false}
          >
            All Sublimation ({customSublimationCount})
          </Link>
          <Link
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "customer_upload"
            })}
            className={`chip ${sublimationModeFilter === "customer_upload" ? "active" : ""}`}
            prefetch={false}
          >
            Custom Photo Upload ({customUploadCount})
          </Link>
          <Link
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "ready_made_design"
            })}
            className={`chip ${sublimationModeFilter === "ready_made_design" ? "active" : ""}`}
            prefetch={false}
          >
            Ready-Made Prints ({readyMadeCount})
          </Link>
        </section>
      ) : null}

      <ShopProductGrid items={filteredItems} />

      {filteredItems.length === 0 ? (
        <p className="shop-empty">No live products right now.</p>
      ) : null}
    </main>
  );
}
