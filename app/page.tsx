import { HomeFeaturedSkeleton } from "@/components/storefront/home-featured-skeleton";
import { HomeMarketGallery } from "@/components/storefront/home-market-gallery";
import { ViewportDeferredMount } from "@/components/storefront/viewport-deferred-mount";
import HomeStudioPrintGallerySection from "@/components/storefront/home-studio-print-gallery-section";
import { HomeHeroArt } from "@/components/storefront/home-hero-art";
import { HomeStudioPrintGallerySkeleton } from "@/components/storefront/home-studio-print-gallery-skeleton";
import Link from "next/link";
import { Suspense } from "react";
import HomeFeaturedSection from "./home-featured-section";
/** ISR seconds — literal required by Next.js; keep in sync with `STOREFRONT_DATA_REVALIDATE_SEC` in `lib/server/storefront-data-cache.ts` (default 1800, env `STOREFRONT_DATA_REVALIDATE_SEC`). */
export const revalidate = 1800;

export default function HomePage() {
  return (
    <main className="page-main home-main">
      <section className="panel home-hero">
        <div className="home-hero-shell">
          <HomeHeroArt />
          <div className="home-hero-copy reveal reveal-delay-2">
            <h1>
              Handmade treasures and personalized{" "}
              <br className="home-hero-title-break" />
              keepsakes, made with love.
            </h1>
            <p className="hero-lead">
              Browse limited crochet pieces, pick an in-house studio print, choose ready-made
              designs, or upload your own photo for mugs, tumblers, bags, and more.
            </p>
            <div className="button-row home-hero-actions">
              <Link href="/shop" className="btn btn-primary">
                Shop the Collection
              </Link>
              <Link
                href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
                className="btn btn-outline"
              >
                Start a Custom Print
              </Link>
              <Link href="/gallery" className="btn btn-outline">
                Studio print gallery
              </Link>
            </div>
            <ul className="home-hero-highlights" aria-label="Store highlights">
              <li>Secure PayPal checkout</li>
              <li>Easy photo upload &amp; studio print gallery</li>
              <li>Sold-out handmade pieces stay visible for restocks</li>
            </ul>
          </div>
        </div>
      </section>

      <Suspense fallback={<HomeFeaturedSkeleton />}>
        <HomeFeaturedSection />
      </Suspense>

      <ViewportDeferredMount fallback={<HomeStudioPrintGallerySkeleton />}>
        <Suspense fallback={<HomeStudioPrintGallerySkeleton />}>
          <HomeStudioPrintGallerySection />
        </Suspense>
      </ViewportDeferredMount>

      <ViewportDeferredMount rootMargin="400px 0px">
        <HomeMarketGallery />
      </ViewportDeferredMount>

      <section className="panel home-signature" aria-label="A note from the maker">
        <div className="home-signature-grid">
          <div className="home-signature-note">
            <p className="home-signature-kicker">A note from the maker</p>
            <h2 className="home-signature-title">Little details matter here.</h2>
            <p className="home-signature-copy">
              Every listing is designed to feel personal—whether you’re choosing a one-of-a-kind
              crochet piece or uploading a favorite photo for a custom print. If anything looks
              unclear for printing, we’ll reach out before we make it.
            </p>
            <div className="button-row">
              <Link
                href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
                className="btn btn-primary"
              >
                Make a custom photo gift
              </Link>
              <Link href="/shop?category=handmade_crochet_knit" className="btn btn-outline">
                Shop handmade crochet
              </Link>
            </div>
          </div>
          <ol className="home-signature-steps" aria-label="Custom photo prints in 3 steps">
            <li>
              <strong>1) Upload</strong>
              <p>Choose one photo and add any notes (names, colors, vibe).</p>
            </li>
            <li>
              <strong>2) Checkout</strong>
              <p>Pay securely with PayPal—mobile-friendly and quick.</p>
            </li>
            <li>
              <strong>3) We make it</strong>
              <p>We prep, print, and ship from Vancouver Island.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="home-value-strip" aria-label="Store assurances">
        <article className="home-value-item home-value-item-accent">
          <span className="home-value-glyph" aria-hidden="true" />
          <p className="home-value-title">Easy to Order</p>
          <p className="home-value-copy">Clear listings, simple options, and a smooth checkout.</p>
        </article>
        <article className="home-value-item home-value-item-warm">
          <span className="home-value-glyph home-value-glyph-alt" aria-hidden="true" />
          <p className="home-value-title">Handmade + Made-to-Order</p>
          <p className="home-value-copy">
            One-of-a-kind crochet pieces and custom print products in one shop.
          </p>
        </article>
        <article className="home-value-item home-value-item-brand">
          <span className="home-value-glyph home-value-glyph-brand" aria-hidden="true" />
          <p className="home-value-title">Ships Across Canada</p>
          <p className="home-value-copy">Shipping rates are shown at checkout by destination.</p>
        </article>
      </section>

      <section className="home-gift-finder" aria-label="Gift finder">
        <div className="home-gift-finder-inner">
          <div>
            <p className="home-gift-finder-kicker">Gift finder</p>
            <h2>Shop by “who is it for?”</h2>
            <p className="home-gift-finder-copy">
              A quick way to browse the cutest ideas—especially for custom photo keepsakes.
            </p>
          </div>
          <div className="home-gift-finder-chips">
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For couples 💞
            </Link>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For parents 👨‍👩‍👧‍👦
            </Link>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For pet lovers 🐾
            </Link>
            <Link href="/shop?category=handmade_crochet_knit" className="chip">
              Cozy handmade 🧶
            </Link>
          </div>
        </div>
      </section>

      <div className="home-collections-block">
        <div className="home-section-intro">
          <p className="home-section-eyebrow">Collections</p>
          <h2 className="home-section-title">Find your next favorite</h2>
        </div>

        <section className="grid-2 home-collections" aria-label="Shop collections">
          <article className="card home-card">
            <p className="card-kicker">Collection</p>
            <h2>Custom Photo Prints</h2>
            <p>
              Upload a photo, add notes, and place your order in minutes. Perfect for personalized
              mugs, tumblers, and bags.
            </p>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload">
              Shop custom-print items
            </Link>
          </article>

          <article className="card home-card">
            <p className="card-kicker">Collection</p>
            <h2>Ready-Made Print Designs</h2>
            <p>
              Choose one of our in-house designs and we will make it to order just for you.
            </p>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=ready_made_design">
              Shop ready-made prints
            </Link>
          </article>

          <article className="card home-card">
            <p className="card-kicker">Collection</p>
            <h2>Handmade Crochet & Knit</h2>
            <p>
              Limited-stock handmade pieces crafted with care. Sold-out items stay visible so you
              can still browse the full style.
            </p>
            <Link href="/shop?category=handmade_crochet_knit">Shop handmade</Link>
          </article>
        </section>
      </div>

      <section className="home-process panel" aria-label="How your order comes to life">
        <div className="home-process-head">
          <p className="card-kicker">How It Works</p>
          <h2>How Your Order Comes to Life</h2>
        </div>
        <ol className="home-process-list">
          <li className="home-process-step">
            <strong>1. Choose your favorite</strong>
            <p>Pick handmade crochet, a ready-made print design, or a custom photo listing.</p>
          </li>
          <li className="home-process-step">
            <strong>2. Add your details</strong>
            <p>For custom items, upload one image and include any notes on the product page.</p>
          </li>
          <li className="home-process-step">
            <strong>3. Checkout securely</strong>
            <p>Pay with PayPal and receive clear updates as your order moves forward.</p>
          </li>
          <li className="home-process-step">
            <strong>4. We make and ship it</strong>
            <p>Your order is prepared with care and shipped with tracking when available.</p>
          </li>
        </ol>
      </section>

      <section className="grid-2 home-policies" aria-label="Shipping and policy highlights">
        <article className="card home-card">
          <p className="card-kicker">Shipping</p>
          <h2>Simple, transparent shipping</h2>
          <p>
            Shipping is calculated at checkout by destination and order size, with free shipping
            available when your order qualifies.
          </p>
        </article>

        <article className="card home-card">
          <p className="card-kicker">Returns</p>
          <h2>Clear return policy</h2>
          <p>
            Return details are shown during checkout so there are no surprises before payment.
          </p>
        </article>
      </section>
    </main>
  );
}
