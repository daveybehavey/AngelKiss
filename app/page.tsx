import { HomeFeaturedProducts } from "@/components/storefront/home-featured";
import { ScrollReveal } from "@/components/storefront/scroll-reveal";
import { listPublicProducts } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

/** Avoid build-time Supabase when env is only present at runtime (e.g. CI). */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = getSupabaseAdminClient();
  const { items: featuredItems } = await listPublicProducts(supabase, { limit: 6 });

  return (
    <main className="page-main home-main">
      <section className="panel home-hero">
        <div className="home-hero-ambient" aria-hidden="true">
          <span className="home-orb home-orb-a" />
          <span className="home-orb home-orb-b" />
          <span className="home-orb home-orb-c" />
        </div>

        <div className="home-hero-content">
          <p className="hero-kicker reveal">AnglKiss Creations</p>
          <h1 className="reveal reveal-delay-1">
            Handmade treasures and personalized keepsakes, made with love.
          </h1>
          <p className="hero-lead reveal reveal-delay-2">
            Browse limited crochet pieces, choose ready-made print designs, or upload your own
            photo for mugs, tumblers, bags, and more.
          </p>
          <p className="hero-origin reveal reveal-delay-3">
            Handmade and shipped from beautiful Vancouver Island.
          </p>
          <div className="button-row reveal reveal-delay-3">
            <Link href="/shop" className="btn btn-primary">
              Shop the Collection
            </Link>
            <Link
              href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
              className="btn btn-outline"
            >
              Start a Custom Print
            </Link>
          </div>
          <ul className="hero-trust reveal reveal-delay-4" aria-label="Store highlights">
            <li>Secure PayPal checkout on mobile and desktop</li>
            <li>Easy photo upload for personalized products</li>
            <li>Sold-out handmade pieces stay visible for future restocks</li>
          </ul>
        </div>

        <div className="hero-visual reveal reveal-delay-2" aria-hidden="true">
          <div className="hero-visual-card hero-visual-card-float">
            <p className="hero-visual-label">Most Loved</p>
            <h2>Photo Mug</h2>
            <p>Upload one photo, add your notes, and we take care of the rest.</p>
            <div className="hero-visual-tags">
              <span>Photo upload</span>
              <span>Ready-made designs</span>
              <span>Gift-ready</span>
            </div>
          </div>
        </div>
      </section>

      <HomeFeaturedProducts items={featuredItems} />

      <ScrollReveal
        as="section"
        className="home-value-strip"
        variant="fade-up"
        aria-label="Store assurances"
      >
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
          <p className="home-value-title">Ships Across Canada & USA</p>
          <p className="home-value-copy">Shipping rates are shown at checkout by destination.</p>
        </article>
      </ScrollReveal>

      <ScrollReveal as="div" className="home-collections-block" variant="fade-up">
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
      </ScrollReveal>

      <ScrollReveal as="section" className="home-process panel" variant="fade-up" aria-label="How your order comes to life">
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
      </ScrollReveal>

      <ScrollReveal
        as="section"
        className="grid-2 home-policies"
        variant="fade-up"
        aria-label="Shipping and policy highlights"
      >
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
      </ScrollReveal>
    </main>
  );
}
