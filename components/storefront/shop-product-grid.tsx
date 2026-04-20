"use client";

import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/components/storefront/scroll-reveal";
import {
  formatStorefrontCategory,
  formatStorefrontMoney,
  formatStorefrontSublimationMode,
  formatStorefrontStockText,
  storefrontStockToneClass
} from "@/lib/storefront/product-display";
import type { PublicProductSummary } from "@/lib/storefront/products";

type Props = {
  items: PublicProductSummary[];
};

export function ShopProductGrid({ items }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ScrollReveal className="shop-grid-reveal" variant="fade-up">
      <ul className="product-grid product-grid-entrance">
        {items.map((item, index) => (
          <li key={item.id} className="product-card product-card-shine">
            <Link href={`/shop/${item.slug}`} className="product-card-link" prefetch={false}>
              <div className="product-card-media">
                {item.primary_image_url ? (
                  <Image
                    src={item.primary_image_url}
                    alt={item.primary_image_alt ?? item.name}
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 980px) 50vw, 320px"
                    className="product-card-photo"
                    loading={index < 6 ? "eager" : "lazy"}
                  />
                ) : (
                  <div className="product-image-placeholder">Photo coming soon</div>
                )}
              </div>
              <div className="product-card-body">
                <h3>{item.name}</h3>
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
        ))}
      </ul>
    </ScrollReveal>
  );
}
