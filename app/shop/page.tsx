import type { ProductCategory } from "@/lib/admin/products";
import { listPublicProducts, type SublimationMode } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatCategory(category: ProductCategory): string {
  if (category === "custom_sublimation") {
    return "Custom Sublimation";
  }
  return "Handmade Crochet/Knit";
}

function formatSublimationMode(mode: SublimationMode): string {
  if (mode === "customer_upload") {
    return "Custom photo upload";
  }
  return "Ready-made design";
}

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

function buildShopHref(options: {
  category?: ProductCategory | null;
  sublimationMode?: SublimationMode | null;
}): string {
  const search = new URLSearchParams();
  if (options.category) {
    search.set("category", options.category);
  }
  if (options.sublimationMode) {
    search.set("sublimation_mode", options.sublimationMode);
  }

  const query = search.toString();
  return query ? `/shop?${query}` : "/shop";
}

function formatStockText(
  inventoryMode: "finite" | "made_to_order",
  isSoldOut: boolean,
  availableQuantity: number | null
): string {
  if (inventoryMode === "made_to_order") {
    return "Made to order";
  }
  if (isSoldOut) {
    return "Sold out";
  }
  return `${availableQuantity ?? 0} in stock`;
}

function getStockToneClass(
  inventoryMode: "finite" | "made_to_order",
  isSoldOut: boolean
): "is-made-to-order" | "is-sold-out" | "is-in-stock" {
  if (inventoryMode === "made_to_order") {
    return "is-made-to-order";
  }
  if (isSoldOut) {
    return "is-sold-out";
  }
  return "is-in-stock";
}

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sublimation_mode?: string }>;
}) {
  const params = await searchParams;
  const category = normalizeCategoryFilter(params.category);
  const sublimationMode = normalizeSublimationModeFilter(
    params.sublimation_mode
  );

  if (sublimationMode === "customer_upload") {
    return { title: "Shop Upload-Your-Photo Sublimation" };
  }
  if (sublimationMode === "ready_made_design") {
    return { title: "Shop Ready-Made Sublimation Designs" };
  }

  if (!category) {
    return { title: "Shop" };
  }
  return {
    title:
      category === "custom_sublimation"
        ? "Shop Sublimation Prints"
        : "Shop Crochet & Knit"
  };
}

export default async function ShopPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sublimation_mode?: string }>;
}) {
  const params = await searchParams;
  const categoryFilter = normalizeCategoryFilter(params.category);
  const sublimationModeFilter = normalizeSublimationModeFilter(
    params.sublimation_mode
  );

  const supabase = getSupabaseAdminClient();
  const { items } = await listPublicProducts(supabase, { limit: 200 });
  const handmadeCount = items.filter(
    (item) => item.category === "handmade_crochet_knit"
  ).length;
  const customSublimationItems = items.filter(
    (item) => item.category === "custom_sublimation"
  );
  const customSublimationCount = customSublimationItems.length;
  const customUploadCount = customSublimationItems.filter(
    (item) => item.sublimation_mode === "customer_upload"
  ).length;
  const readyMadeCount = customSublimationItems.filter(
    (item) => item.sublimation_mode === "ready_made_design"
  ).length;

  const filteredItems = items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    if (sublimationModeFilter) {
      return (
        item.category === "custom_sublimation" &&
        item.sublimation_mode === sublimationModeFilter
      );
    }
    return true;
  });

  return (
    <main className="page-main">
      <section className="panel shop-hero">
        <h1>Shop AnglKiss Creations</h1>
        <p className="shop-hero-lead">
          Handmade crochet/knit pieces, ready-made print designs, and custom photo products.
        </p>
      </section>

      <section className="shop-overview-grid" aria-label="Collection overview">
        <article className="shop-overview-card">
          <p className="shop-overview-kicker">Handmade</p>
          <p className="shop-overview-value">{handmadeCount}</p>
          <p className="shop-overview-copy">Crochet & knit pieces currently listed.</p>
        </article>
        <article className="shop-overview-card">
          <p className="shop-overview-kicker">Custom Upload</p>
          <p className="shop-overview-value">{customUploadCount}</p>
          <p className="shop-overview-copy">Photo-upload products ready for personalization.</p>
        </article>
        <article className="shop-overview-card">
          <p className="shop-overview-kicker">Ready-Made Prints</p>
          <p className="shop-overview-value">{readyMadeCount}</p>
          <p className="shop-overview-copy">In-house designs made to order.</p>
        </article>
      </section>

      <section className="shop-toolbar" aria-label="Category filters">
        <a
          href={buildShopHref({})}
          className={`chip ${
            categoryFilter === null && sublimationModeFilter === null
              ? "active"
              : ""
          }`}
        >
          All ({items.length})
        </a>
        <a
          href={buildShopHref({ category: "handmade_crochet_knit" })}
          className={`chip ${
            categoryFilter === "handmade_crochet_knit" ? "active" : ""
          }`}
        >
          Handmade ({handmadeCount})
        </a>
        <a
          href={buildShopHref({ category: "custom_sublimation" })}
          className={`chip ${
            categoryFilter === "custom_sublimation" ? "active" : ""
          }`}
        >
          Sublimation ({customSublimationCount})
        </a>
      </section>

      {categoryFilter === "custom_sublimation" || sublimationModeFilter !== null ? (
        <section
          className="shop-toolbar shop-toolbar-secondary"
          aria-label="Sublimation type filters"
        >
          <a
            href={buildShopHref({ category: "custom_sublimation" })}
            className={`chip ${
              categoryFilter === "custom_sublimation" &&
              sublimationModeFilter === null
                ? "active"
                : ""
            }`}
          >
            All Sublimation ({customSublimationCount})
          </a>
          <a
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "customer_upload"
            })}
            className={`chip ${
              sublimationModeFilter === "customer_upload" ? "active" : ""
            }`}
          >
            Custom Photo Upload ({customUploadCount})
          </a>
          <a
            href={buildShopHref({
              category: "custom_sublimation",
              sublimationMode: "ready_made_design"
            })}
            className={`chip ${
              sublimationModeFilter === "ready_made_design" ? "active" : ""
            }`}
          >
            Ready-Made Prints ({readyMadeCount})
          </a>
        </section>
      ) : null}

      <ul className="product-grid">
        {filteredItems.map((item) => (
          <li key={item.id} className="product-card">
            <a href={`/shop/${item.slug}`} className="product-card-link">
              {item.primary_image_url ? (
                <img src={item.primary_image_url} alt={item.primary_image_alt ?? item.name} />
              ) : (
                <div className="product-image-placeholder">Photo coming soon</div>
              )}
              <div className="product-card-body">
                <h3>{item.name}</h3>
                <p className="product-meta">{formatCategory(item.category)}</p>
                {item.category === "custom_sublimation" && item.sublimation_mode ? (
                  <p
                    className={`product-mode-pill ${
                      item.sublimation_mode === "customer_upload"
                        ? "is-upload"
                        : "is-ready-made"
                    }`}
                  >
                    {formatSublimationMode(item.sublimation_mode)}
                  </p>
                ) : null}
                <p className="product-price">{formatMoney(item.base_price_cents, item.currency)}</p>
                <p
                  className={`product-stock-pill ${getStockToneClass(
                    item.inventory_mode,
                    item.is_sold_out
                  )}`}
                >
                  {formatStockText(
                    item.inventory_mode,
                    item.is_sold_out,
                    item.available_quantity
                  )}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {filteredItems.length === 0 ? (
        <p className="shop-empty">No live products right now.</p>
      ) : null}
    </main>
  );
}
