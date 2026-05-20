"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ImageLightbox } from "@/components/storefront/image-lightbox";
import {
  formatShopperProductTitle,
  formatStorefrontCategory,
  formatStorefrontMoney,
  formatStorefrontSublimationMode,
  formatStorefrontStockText,
  storefrontStockToneClass
} from "@/lib/storefront/product-display";
import {
  getStorefrontGridImageUrl,
  storefrontGridImageUnoptimized
} from "@/lib/storefront/storefront-image-src";
import type { PublicProductSummary } from "@/lib/storefront/products";

type Props = {
  items: PublicProductSummary[];
};

type LightboxState = {
  src: string;
  alt: string;
  unoptimized: boolean;
};

export function ShopProductGrid({ items }: Props) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="product-grid shop-product-grid product-grid-entrance">
        {items.map((item, index) => {
          const displayName = formatShopperProductTitle(item.name);
          const primarySrc = getStorefrontGridImageUrl(item.primary_image_url);
          const imageAlt = item.primary_image_alt ?? displayName;

          return (
            <li key={item.id} className="product-card product-card-shine">
              {primarySrc ? (
                <button
                  type="button"
                  className="product-card-image-trigger"
                  onClick={() =>
                    setLightbox({
                      src: primarySrc,
                      alt: imageAlt,
                      unoptimized: storefrontGridImageUnoptimized(primarySrc)
                    })
                  }
                  aria-label={`View larger image of ${displayName}`}
                >
                  <div
                    className="product-card-media"
                    data-product-category={item.category}
                  >
                    <Image
                      src={primarySrc}
                      alt={imageAlt}
                      fill
                      sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 256px"
                      quality={72}
                      className="product-card-photo"
                      loading={index < 2 ? "eager" : "lazy"}
                      priority={index === 0}
                      fetchPriority={index < 2 ? (index === 0 ? "high" : "low") : "low"}
                      unoptimized={storefrontGridImageUnoptimized(primarySrc)}
                    />
                  </div>
                </button>
              ) : (
                <div className="product-card-media">
                  <div className="product-image-placeholder">Photo coming soon</div>
                </div>
              )}
              <Link
                href={`/shop/${item.slug}`}
                className="product-card-body-link"
                prefetch={false}
              >
                <div className="product-card-body">
                  <h3>{displayName}</h3>
                  <p className="product-meta">{formatStorefrontCategory(item.category)}</p>
                  {item.category === "custom_sublimation" && item.sublimation_mode ? (
                    <p
                      className={`product-mode-pill ${
                        item.sublimation_mode === "customer_upload"
                          ? "is-upload"
                          : "is-ready-made"
                      }`}
                    >
                      {formatStorefrontSublimationMode(item.sublimation_mode)}
                    </p>
                  ) : null}
                  <p className="product-price">
                    {formatStorefrontMoney(item.base_price_cents, item.currency)}
                  </p>
                  <p
                    className={`product-stock-pill ${storefrontStockToneClass(
                      item.inventory_mode,
                      item.is_sold_out
                    )}`}
                  >
                    {formatStorefrontStockText(
                      item.inventory_mode,
                      item.is_sold_out,
                      item.available_quantity
                    )}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <ImageLightbox
        open={lightbox !== null}
        onClose={closeLightbox}
        src={lightbox?.src ?? ""}
        alt={lightbox?.alt ?? ""}
        unoptimized={lightbox?.unoptimized}
      />
    </>
  );
}
