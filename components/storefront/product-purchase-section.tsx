"use client";

import { AddToCartPanel } from "@/components/storefront/add-to-cart-panel";
import { ProductGallery } from "@/components/storefront/product-gallery";
import type { AddToCartPanelProps } from "@/components/storefront/add-to-cart-panel";
import { formatStorefrontMoney } from "@/lib/storefront/product-display";
import { filterProductImagesByVariant } from "@/lib/storefront/filter-product-images-by-variant";
import type { PublicProductImage } from "@/lib/storefront/products";
import {
  resolveVariantUnitPriceCents,
  type PublicProductVariant
} from "@/lib/storefront/product-variants";
import { useEffect, useMemo, useState } from "react";

type ProductPurchaseSectionProps = {
  productName: string;
  basePriceCents: number;
  currency: string;
  images: PublicProductImage[];
  variants: PublicProductVariant[];
  product: AddToCartPanelProps["product"];
  initialStudioPrintId?: string;
};

export function ProductPurchaseSection({
  productName,
  basePriceCents,
  currency,
  images,
  variants,
  product,
  initialStudioPrintId
}: ProductPurchaseSectionProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants[0]?.id ?? null
  );

  useEffect(() => {
    setSelectedVariantId(variants[0]?.id ?? null);
  }, [product.id, variants]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId]
  );

  const displayPriceCents = useMemo(
    () => resolveVariantUnitPriceCents(basePriceCents, selectedVariant),
    [basePriceCents, selectedVariant]
  );

  const galleryImages = useMemo(
    () => filterProductImagesByVariant(images, selectedVariantId, variants.length > 0),
    [images, selectedVariantId, variants.length]
  );

  return (
    <>
      <ProductGallery productName={productName} images={galleryImages} />

      <div className="product-summary-purchase">
        <p className="product-price" aria-live="polite">
          {formatStorefrontMoney(displayPriceCents, currency)}
          {displayPriceCents !== basePriceCents && selectedVariant ? (
            <span className="product-price-base-muted">
              {" "}
              (base {formatStorefrontMoney(basePriceCents, currency)})
            </span>
          ) : null}
        </p>

        <AddToCartPanel
          product={product}
          variants={variants}
          initialStudioPrintId={initialStudioPrintId}
          selectedVariantId={selectedVariantId}
          onVariantSelect={(variant) => setSelectedVariantId(variant.id)}
        />
      </div>
    </>
  );
}
