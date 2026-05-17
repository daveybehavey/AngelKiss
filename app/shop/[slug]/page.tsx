import { ProductPurchaseSection } from "@/components/storefront/product-purchase-section";
import { formatShopperProductTitle } from "@/lib/storefront/product-display";
import { getPublicProductBySlugCached } from "@/lib/storefront/get-public-product-cached";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/** ISR seconds — literal required by Next.js; keep in sync with `STOREFRONT_DATA_REVALIDATE_SEC` in `lib/server/storefront-data-cache.ts`. */
export const revalidate = 1800;

function getInventoryStatusText(
  inventoryMode: "finite" | "made_to_order",
  isSoldOut: boolean
): string {
  if (inventoryMode === "made_to_order") {
    return "Made to order";
  }
  if (isSoldOut) {
    return "Sold out";
  }
  return "In stock";
}

function getInventoryStatusTone(
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

/** Default white is normal for sublimation — omit from shopper-facing copy. */
function formatDisplayBlankColor(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed.length) {
    return null;
  }
  if (trimmed.toLowerCase() === "white") {
    return null;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return { title: "Product" };
  }

  try {
    const product = await getPublicProductBySlugCached(normalized);
    if (!product) {
      return {
        title: "Product not found",
        robots: { index: false, follow: true }
      };
    }

    const displayName = formatShopperProductTitle(product.name);
    const description =
      product.short_description?.trim() ||
      product.long_description?.trim().slice(0, 160) ||
      `Shop ${displayName} at AnglKiss Creations.`;

    return {
      title: displayName,
      description,
      openGraph: {
        title: displayName,
        description,
        type: "website"
      },
      twitter: {
        card: "summary_large_image",
        title: displayName,
        description
      }
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ studio_print?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const studioPrintFromQuery =
    typeof sp.studio_print === "string" && sp.studio_print.trim().length > 0
      ? sp.studio_print.trim()
      : undefined;
  const normalizedSlug = slug.trim().toLowerCase();
  const product = await getPublicProductBySlugCached(normalizedSlug);

  if (!product) {
    notFound();
  }

  const displayTitle = formatShopperProductTitle(product.name);

  const displayBlankColor =
    product.category === "custom_sublimation" && product.custom_sublimation_details
      ? formatDisplayBlankColor(product.custom_sublimation_details.default_blank_color)
      : null;

  return (
    <main className="page-main product-page">
      <p className="product-back-row">
        <Link href="/shop" className="product-back-link">
          Back to shop
        </Link>
      </p>

      <section className="panel product-layout">
        <ProductPurchaseSection
          productName={displayTitle}
          basePriceCents={product.base_price_cents}
          currency={product.currency}
          images={product.images}
          variants={product.variants}
          initialStudioPrintId={studioPrintFromQuery}
          product={{
            id: product.id,
            slug: product.slug,
            name: displayTitle,
            category: product.category,
            base_price_cents: product.base_price_cents,
            currency: product.currency,
            can_purchase: product.can_purchase,
            inventory_mode: product.inventory_mode,
            available_quantity: product.available_quantity,
            primary_image_url: product.primary_image_url,
            primary_image_alt: product.primary_image_alt,
            customization:
              product.category === "custom_sublimation" && product.custom_sublimation_details
                ? {
                    allow_image_upload: product.custom_sublimation_details.allow_image_upload,
                    max_upload_mb: product.custom_sublimation_details.max_upload_mb,
                    allow_gallery_selection:
                      product.custom_sublimation_details.allow_gallery_selection ||
                      product.custom_sublimation_details.allow_image_upload
                  }
                : null
          }}
        />

        <div className="product-summary">
          <h1 className="product-title">{displayTitle}</h1>
          <p
            className={`product-stock-pill ${getInventoryStatusTone(
              product.inventory_mode,
              product.is_sold_out
            )}`}
          >
            {getInventoryStatusText(product.inventory_mode, product.is_sold_out)}
          </p>

          {product.short_description ? (
            <p className="product-description">{product.short_description}</p>
          ) : null}
          {product.long_description ? (
            <p className="product-description product-description-secondary">
              {product.long_description}
            </p>
          ) : null}

          {product.category === "handmade_crochet_knit" && product.handmade_details ? (
            <div className="product-detail-card">
              <h2>Handmade Details</h2>
              <p>Material: {product.handmade_details.material}</p>
              <p>
                Personalization:{" "}
                {product.handmade_details.personalization_available ? "Yes" : "No"}
              </p>
              {product.handmade_details.care_instructions ? (
                <p>Care instructions: {product.handmade_details.care_instructions}</p>
              ) : null}
            </div>
          ) : null}

          {product.category === "custom_sublimation" && product.custom_sublimation_details ? (
            <div className="product-detail-card">
              <h2>Print Details</h2>
              <p>
                Style:{" "}
                {product.custom_sublimation_details.allow_image_upload
                  ? "Your photo or in-house gallery print"
                  : product.custom_sublimation_details.allow_gallery_selection
                    ? "Studio print gallery"
                    : "Ready-made design by AnglKiss Creations"}
              </p>
              {product.custom_sublimation_details.allow_image_upload ? (
                <p>Max upload size: {product.custom_sublimation_details.max_upload_mb} MB</p>
              ) : null}
              {product.custom_sublimation_details.allow_image_upload ? (
                <p>
                  Upload your own image, or choose one of our studio prints when you add to
                  cart—whichever fits your order.
                </p>
              ) : product.custom_sublimation_details.allow_gallery_selection ? (
                <p>You can pick one of our in-house prints when you add to cart.</p>
              ) : null}
              {displayBlankColor ? <p>Base color: {displayBlankColor}</p> : null}
              <p>
                Text overlay:{" "}
                {product.custom_sublimation_details.allow_text_overlay ? "Yes" : "No"}
              </p>
            </div>
          ) : null}

          <div className="product-detail-card">
            <h2>How Your Piece Comes to Life</h2>
            <p>1. Add this item to your cart.</p>
            <p>2. Add shipping details at checkout.</p>
            <p>3. Pay securely with PayPal and receive confirmation.</p>
            <p>Need help before ordering? Email anglkisscreations@gmail.com.</p>
          </div>

        </div>
      </section>
    </main>
  );
}
