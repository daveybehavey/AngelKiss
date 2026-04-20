"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProductCategory } from "@/lib/admin/products";
import type { PublicProductSummary } from "@/lib/storefront/products";
import { ScrollReveal } from "@/components/storefront/scroll-reveal";

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
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="home-featured" aria-labelledby="home-featured-heading">
      <div className="home-featured-head">
        <div>
          <p className="home-featured-eyebrow">Fresh on the shelf</p>
          <h2 id="home-featured-heading">Featured pieces</h2>
          <p className="home-featured-lead">
            A rotating glimpse of what is live in the shop right now.
          </p>
        </div>
        <Link href="/shop" className="btn btn-outline home-featured-cta">
          View all products
        </Link>
      </div>
      <ScrollReveal as="div" className="home-featured-grid-wrap" variant="fade-up">
        <ul className="home-featured-grid">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="home-featured-card"
              style={{ transitionDelay: `${40 + index * 55}ms` }}
            >
              <Link href={`/shop/${item.slug}`} className="home-featured-link" prefetch={false}>
                <div className="home-featured-media">
                  {item.primary_image_url ? (
                    <Image
                      src={item.primary_image_url}
                      alt={item.primary_image_alt ?? item.name}
                      fill
                      sizes="(max-width: 700px) 50vw, 200px"
                      className="home-featured-photo"
                      loading="lazy"
                    />
                  ) : (
                    <div className="home-featured-placeholder">Photo soon</div>
                  )}
                </div>
                <div className="home-featured-body">
                  <p className="home-featured-meta">{formatCategory(item.category)}</p>
                  <h3>{item.name}</h3>
                  <p className="home-featured-price">
                    {formatMoney(item.base_price_cents, item.currency)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </ScrollReveal>
    </section>
  );
}
