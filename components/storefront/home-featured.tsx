"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ImageLightbox } from "@/components/storefront/image-lightbox";
import type { PublicProductSummary } from "@/lib/storefront/products";
import {
  formatShopperProductTitle,
  formatStorefrontCategory
} from "@/lib/storefront/product-display";
import {
  getStorefrontGridImageUrl,
  storefrontGridImageUnoptimized
} from "@/lib/storefront/storefront-image-src";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

type Props = {
  items: PublicProductSummary[];
};

type LightboxState = {
  src: string;
  alt: string;
  unoptimized: boolean;
};

export function HomeFeaturedProducts({ items }: Props) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

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
              const primarySrc = getStorefrontGridImageUrl(item.primary_image_url);
              const imageAlt = item.primary_image_alt ?? displayName;

              return (
                <li
                  key={item.id}
                  className="home-featured-card"
                  style={{ transitionDelay: `${40 + index * 55}ms` }}
                >
                  {primarySrc ? (
                    <button
                      type="button"
                      className="home-featured-image-trigger"
                      onClick={() =>
                        setLightbox({
                          src: primarySrc,
                          alt: imageAlt,
                          unoptimized: storefrontGridImageUnoptimized(primarySrc)
                        })
                      }
                      aria-label={`View larger image of ${displayName}`}
                    >
                      <div className="home-featured-media">
                        <Image
                          src={primarySrc}
                          alt={imageAlt}
                          fill
                          sizes="(max-width: 700px) 46vw, (max-width: 1100px) 31vw, 240px"
                          quality={72}
                          className="home-featured-photo"
                          style={{ objectFit: "cover", objectPosition: "center" }}
                          loading={index < 2 ? "eager" : "lazy"}
                          priority={index === 0}
                          fetchPriority={index === 0 ? "high" : "low"}
                          unoptimized={storefrontGridImageUnoptimized(primarySrc)}
                        />
                      </div>
                    </button>
                  ) : (
                    <div className="home-featured-media">
                      <div className="home-featured-placeholder">Photo soon</div>
                    </div>
                  )}
                  <Link
                    href={`/shop/${item.slug}`}
                    className="home-featured-body-link"
                    prefetch={false}
                  >
                    <div className="home-featured-body">
                      <p className="home-featured-meta">
                        {formatStorefrontCategory(item.category)}
                      </p>
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
      <ImageLightbox
        open={lightbox !== null}
        onClose={closeLightbox}
        src={lightbox?.src ?? ""}
        alt={lightbox?.alt ?? ""}
        unoptimized={lightbox?.unoptimized}
      />
    </section>
  );
}
