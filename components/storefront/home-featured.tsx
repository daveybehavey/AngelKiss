import Image from "next/image";
import Link from "next/link";
import type { ProductCategory } from "@/lib/admin/products";
import type { PublicProductSummary } from "@/lib/storefront/products";
import { formatShopperProductTitle } from "@/lib/storefront/product-display";
import {
  storefrontImageSrcOrNull,
  storefrontImageUnoptimized
} from "@/lib/storefront/storefront-image-src";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatCategory(category: ProductCategory): string {
  if (category === "custom_sublimation") {
    return "Sublimation";
  }
  return "Handmade";
}

type Props = {
  items: PublicProductSummary[];
};

export function HomeFeaturedProducts({ items }: Props) {
  return (
    <section className="home-featured" aria-labelledby="home-featured-heading">
      <div className="home-featured-head">
        <div>
          <p className="home-featured-eyebrow">Fresh on the shelf</p>
          <h2 id="home-featured-heading">Featured pieces</h2>
          <p className="home-featured-lead">
            {items.length === 0
              ? "New listings will land here as soon as they go live in the shop."
              : "A rotating glimpse of what is live in the shop right now."}
          </p>
        </div>
        <Link href="/shop" className="btn btn-outline home-featured-cta">
          View all products
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="home-featured-empty">
          Nothing featured yet—browse the full shop for every live piece.
        </p>
      ) : (
        <div className="home-featured-grid-wrap">
          <ul className="home-featured-grid">
            {items.map((item, index) => {
              const displayName = formatShopperProductTitle(item.name);
              const primarySrc = storefrontImageSrcOrNull(item.primary_image_url);
              return (
                <li
                  key={item.id}
                  className="home-featured-card"
                  style={{ transitionDelay: `${40 + index * 55}ms` }}
                >
                  <Link href={`/shop/${item.slug}`} className="home-featured-link" prefetch={false}>
                    <div className="home-featured-media">
                      {primarySrc ? (
                        <Image
                          src={primarySrc}
                          alt={item.primary_image_alt ?? displayName}
                          fill
                          sizes="(max-width: 700px) 46vw, (max-width: 1100px) 31vw, 260px"
                          quality={72}
                          className="home-featured-photo"
                          loading={index === 0 ? "eager" : "lazy"}
                          priority={index === 0}
                          fetchPriority={index === 0 ? "high" : "low"}
                          unoptimized={storefrontImageUnoptimized(primarySrc)}
                        />
                      ) : (
                        <div className="home-featured-placeholder">Photo soon</div>
                      )}
                    </div>
                    <div className="home-featured-body">
                      <p className="home-featured-meta">{formatCategory(item.category)}</p>
                      <h3>{displayName}</h3>
                      <p className="home-featured-price">
                        {formatMoney(item.base_price_cents, item.currency)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
