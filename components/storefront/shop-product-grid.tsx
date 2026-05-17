"use client";

import Image from "next/image";
import Link from "next/link";
import {
  formatShopperProductTitle,
  formatStorefrontCategory,
  formatStorefrontMoney,
  formatStorefrontSublimationMode,
  formatStorefrontStockText,
  storefrontStockToneClass
} from "@/lib/storefront/product-display";
import {
  storefrontImageSrcOrNull,
  storefrontImageUnoptimized
} from "@/lib/storefront/storefront-image-src";
import type { PublicProductSummary } from "@/lib/storefront/products";

type Props = {
  items: PublicProductSummary[];
};

export function ShopProductGrid({ items }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="product-grid product-grid-entrance">
      {items.map((item, index) => {
        const displayName = formatShopperProductTitle(item.name);
        const primarySrc = storefrontImageSrcOrNull(item.primary_image_url);
        return (
          <li key={item.id} className="product-card product-card-shine">
            <Link href={`/shop/${item.slug}`} className="product-card-link" prefetch={false}>
              <div className="product-card-media">
                {primarySrc ? (
                  <Image
                    src={primarySrc}
                    alt={item.primary_image_alt ?? displayName}
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 980px) 50vw, 320px"
                    className="product-card-photo"
                    loading={index < 6 ? "eager" : "lazy"}
                    unoptimized={storefrontImageUnoptimized(primarySrc)}
                  />
                ) : (
                  <div className="product-image-placeholder">Photo coming soon</div>
                )}
              </div>
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
  );
}
