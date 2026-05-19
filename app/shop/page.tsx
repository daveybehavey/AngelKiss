import type { ProductCategory } from "@/lib/admin/products";
import { ShopProductGrid } from "@/components/storefront/shop-product-grid";
import { ShopStudioPrintBanner } from "@/components/storefront/shop-studio-print-banner";
import { loadCachedShopPageData } from "@/lib/server/storefront-data-cache";
import type { SublimationMode } from "@/lib/storefront/products";
import { buildShopHref } from "@/lib/storefront/shop-urls";
import { resolveShopPageSeo } from "@/lib/seo/shop-descriptions";
import { buildShopCollectionJsonLd } from "@/lib/seo/shop-collection-json-ld";
import type { Metadata } from "next";
import Link from "next/link";

function shopSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return "https://anglkisscreations.ca";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "https://anglkisscreations.ca";
  }
}

/** ISR seconds — literal required by Next.js; keep in sync with `STOREFRONT_DATA_REVALIDATE_SEC` in `lib/server/storefront-data-cache.ts`. */
export const revalidate = 1800;

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
  searchParams: Promise<{ category?: string; sublimation_mode?: string; studio_print?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = normalizeCategoryFilter(params.category);
  const sublimationMode = normalizeSublimationModeFilter(params.sublimation_mode);
  const { title, description } = resolveShopPageSeo(category, sublimationMode);

  const canonicalPath = buildShopHref({
    category,
    sublimationMode: sublimationMode
  });

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalPath
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
  searchParams: Promise<{ category?: string; sublimation_mode?: string; studio_print?: string }>;
}) {
  const params = await searchParams;
  const categoryFilter = normalizeCategoryFilter(params.category);
  const sublimationModeFilter = normalizeSublimationModeFilter(params.sublimation_mode);
  const studioPrintFromQuery =
    typeof params.studio_print === "string" && params.studio_print.trim().length > 0
      ? params.studio_print.trim()
      : undefined;

  const [overview, { items: filteredItems }] = await loadCachedShopPageData(
    categoryFilter,
    sublimationModeFilter
  );

  const {
    total: itemsTotal,
    handmade: handmadeCount,
    customSublimation: customSublimationCount,
    customUpload: customUploadCount,
    readyMade: readyMadeCount
  } = overview;

  const canonicalPath = buildShopHref({
    category: categoryFilter,
    sublimationMode: sublimationModeFilter
  });

  const { title: collectionTitle, description: collectionDescription } = resolveShopPageSeo(
    categoryFilter,
    sublimationModeFilter
  );

  const collectionJsonLd = buildShopCollectionJsonLd({
    pageTitle: collectionTitle,
    description: collectionDescription,
    canonicalPath,
    siteOrigin: shopSiteOrigin()
  });

  return (
    <main className="page-main shop-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <section className="panel shop-hero shop-hero-enhanced">
        <div className="shop-hero-glow" aria-hidden="true" />
        <p className="shop-hero-eyebrow">The collection</p>
        <h1>Shop AnglKiss Creations</h1>
        <p className="shop-hero-lead">
          Crochet &amp; knit live in one aisle; custom prints (your photo or our designs) live in
          another—pick a category below.
        </p>
      </section>

      <ShopStudioPrintBanner studioPrintId={studioPrintFromQuery} />

      <section className="shop-overview-grid shop-overview-stagger" aria-label="Collection overview">
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Handmade</p>
          <p className="shop-overview-value">{handmadeCount}</p>
          <p className="shop-overview-copy">Crochet & knit pieces currently listed.</p>
        </article>
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Your photo</p>
          <p className="shop-overview-value">{customUploadCount}</p>
          <p className="shop-overview-copy">Photo-upload products ready for personalization.</p>
        </article>
        <article className="shop-overview-card shop-overview-card-tilt">
          <p className="shop-overview-kicker">Ready-made prints</p>
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
          Custom prints ({customSublimationCount})
        </Link>
      </section>

      {categoryFilter === "custom_sublimation" || sublimationModeFilter !== null ? (
        <section
          className="shop-toolbar shop-toolbar-secondary"
          aria-label="Custom print type filters"
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
            All custom prints ({customSublimationCount})
          </Link>
          <Link
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "customer_upload"
            })}
            className={`chip ${sublimationModeFilter === "customer_upload" ? "active" : ""}`}
            prefetch={false}
          >
            Your photo ({customUploadCount})
          </Link>
          <Link
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "ready_made_design"
            })}
            className={`chip ${sublimationModeFilter === "ready_made_design" ? "active" : ""}`}
            prefetch={false}
          >
            Ready-made prints ({readyMadeCount})
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="shop-products-heading">
        <h2 id="shop-products-heading" className="sr-only">
          Products
        </h2>
        <ShopProductGrid items={filteredItems} />
      </section>

      {filteredItems.length === 0 ? (
        <section className="panel shop-empty-panel" aria-live="polite">
          <p className="shop-empty-title">No products match right now</p>
          <p className="shop-empty-copy">
            Try another category or check back soon—new pieces are added regularly.
          </p>
          <Link href="/shop" className="btn btn-outline btn-sm">
            View all products
          </Link>
        </section>
      ) : null}
    </main>
  );
}
