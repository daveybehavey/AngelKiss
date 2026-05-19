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

      <section className="home-market-bridge" aria-label="Shop after the market">
        <div className="home-market-bridge-inner">
          <div className="home-market-bridge-copy">
            <p className="home-section-eyebrow">At the market</p>
            <h2 className="home-market-bridge-title">Shop what you saw at the booth</h2>
            <p className="home-market-bridge-subline">
              Same mugs, prints, and crochet—order online anytime between events.
            </p>
            <nav className="home-market-bridge-links" aria-label="Shop by category">
              <Link
                href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
                className="home-market-bridge-link"
              >
                Custom photo gifts
              </Link>
              <Link href="/gallery" className="home-market-bridge-link">
                Our print designs
              </Link>
              <Link
                href="/shop?category=handmade_crochet_knit"
                className="home-market-bridge-link"
              >
                Handmade crochet
              </Link>
            </nav>
          </div>
          <figure className="home-market-bridge-thumb" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/home-gallery/stand-05.webp"
              alt=""
              width={320}
              height={240}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="panel home-signature" aria-label="Meet the maker">
        <div className="home-signature-grid">
          <div className="home-signature-note">
            <p className="home-signature-kicker">A note from the maker</p>
            <h2 className="home-signature-title">Hi, I&apos;m Cydney</h2>
            <p className="home-signature-copy">
              I make cozy crochet and custom photo gifts on Vancouver Island—online between
              markets, with the same care I bring to the booth.{" "}
              <Link href="/about" className="inline-text-link">
                More about me
              </Link>
              .
            </p>
            <ul className="home-signature-trust" aria-label="Store assurances">
              <li>Secure PayPal checkout</li>
              <li>Ships across Canada</li>
              <li>Handmade &amp; made-to-order in one shop</li>
            </ul>
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
            <ol className="home-signature-steps" aria-label="Custom photo prints in 3 steps">
              <li>
                <strong>Upload</strong>
                <p>One photo and any notes on the product page.</p>
              </li>
              <li>
                <strong>Pay</strong>
                <p>Checkout with PayPal—quick on mobile.</p>
              </li>
              <li>
                <strong>We make it</strong>
                <p>Printed or stitched with care, then shipped.</p>
              </li>
            </ol>
          </div>
          <figure className="home-signature-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/home-gallery/stand-13.webp"
              alt="Cydney at the AnglKiss Creations market booth"
              width={1200}
              height={900}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="home-gift-finder" aria-label="Gift finder">
        <div className="home-gift-finder-inner">
          <div>
            <p className="home-gift-finder-kicker">Gift finder</p>
            <h2>Shop by “who is it for?”</h2>
            <p className="home-gift-finder-copy">
              Quick picks for custom photo keepsakes and cozy handmade gifts.
            </p>
          </div>
          <div className="home-gift-finder-chips">
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For couples
            </Link>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For parents
            </Link>
            <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="chip">
              For pet lovers
            </Link>
            <Link href="/shop?category=handmade_crochet_knit" className="chip">
              Cozy handmade
            </Link>
            <Link href="/shop" className="chip chip-accent">
              See all gifts
            </Link>
          </div>
        </div>
      </section>

      <div className="home-collections-block">
        <div className="home-section-intro">
          <p className="home-section-eyebrow">Collections</p>
          <h2 className="home-section-title">Find your next favorite</h2>
        </div>

        <section className="home-collections-bento" aria-label="Shop collections">
          <article className="home-bento-card home-bento-card--large">
            <div className="home-bento-card-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/home-gallery/stand-05.webp"
                alt="Custom-printed mugs at the craft fair booth"
                width={800}
                height={600}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="home-bento-card-body">
              <p className="card-kicker">Collection</p>
              <h2>Custom photo prints</h2>
              <p>Upload a photo for mugs, tumblers, bags, and more—made to order.</p>
              <Link
                href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
                className="btn btn-outline btn-sm"
              >
                Shop photo-upload prints
              </Link>
            </div>
          </article>

          <article className="home-bento-card home-bento-card--small">
            <div className="home-bento-card-body">
              <p className="card-kicker">Collection</p>
              <h2>Ready-made print designs</h2>
              <p>In-house studio art—pick a design and we print it for you.</p>
              <Link href="/gallery" className="btn btn-outline btn-sm">
                Browse designs
              </Link>
            </div>
          </article>

          <article className="home-bento-card home-bento-card--wide">
            <div className="home-bento-card-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/products/product-01.jpg"
                alt="Crochet frog with a small plant in a cozy handmade setup"
                width={800}
                height={500}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="home-bento-card-body">
              <p className="card-kicker">Collection</p>
              <h2>Handmade crochet &amp; knit</h2>
              <p>Limited batches—sold-out pieces stay visible for restock browsing.</p>
              <Link href="/shop?category=handmade_crochet_knit" className="btn btn-outline btn-sm">
                Shop crochet &amp; knit
              </Link>
            </div>
          </article>
        </section>
      </div>

      <section className="home-closing-cta panel" aria-label="Start shopping">
        <h2 className="home-closing-cta-title">Ready to find something special?</h2>
        <div className="button-row home-closing-cta-actions">
          <Link href="/shop" className="btn btn-primary">
            Shop all
          </Link>
          <a href="mailto:anglkisscreations@gmail.com" className="btn btn-outline">
            Email us
          </a>
        </div>
        <p className="home-closing-cta-policies">
          <Link href="/shipping">Shipping</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/returns">Returns</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacy">Privacy</Link>
        </p>
      </section>
    </main>
  );
}
