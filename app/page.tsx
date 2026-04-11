export default function HomePage() {
  return (
    <main className="page-main home-main">
      <section className="panel home-hero">
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
            <a href="/shop" className="btn btn-primary">
              Shop the Collection
            </a>
            <a href="/shop?category=custom_sublimation" className="btn btn-outline">
              Start a Custom Print
            </a>
          </div>
          <ul className="hero-trust reveal reveal-delay-4" aria-label="Store highlights">
            <li>Secure PayPal checkout on mobile and desktop</li>
            <li>Easy photo upload for personalized products</li>
            <li>Sold-out handmade pieces stay visible for future restocks</li>
          </ul>
        </div>

        <div className="hero-visual reveal reveal-delay-2" aria-hidden="true">
          <div className="hero-visual-card">
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

      <section className="home-value-strip" aria-label="Store assurances">
        <article className="home-value-item">
          <p className="home-value-title">Easy to Order</p>
          <p className="home-value-copy">Clear listings, simple options, and a smooth checkout.</p>
        </article>
        <article className="home-value-item">
          <p className="home-value-title">Handmade + Made-to-Order</p>
          <p className="home-value-copy">
            One-of-a-kind crochet pieces and custom print products in one shop.
          </p>
        </article>
        <article className="home-value-item">
          <p className="home-value-title">Ships Across Canada & USA</p>
          <p className="home-value-copy">Shipping rates are shown at checkout by destination.</p>
        </article>
      </section>

      <section className="grid-2 home-collections" aria-label="Shop collections">
        <article className="card home-card">
          <p className="card-kicker">Collection</p>
          <h2>Custom Photo Prints</h2>
          <p>
            Upload a photo, add notes, and place your order in minutes. Perfect for personalized
            mugs, tumblers, and bags.
          </p>
          <a href="/shop?category=custom_sublimation">Shop custom-print items</a>
        </article>

        <article className="card home-card">
          <p className="card-kicker">Collection</p>
          <h2>Ready-Made Print Designs</h2>
          <p>
            Choose one of our in-house designs and we will make it to order just for you.
          </p>
          <a href="/shop?category=custom_sublimation">Shop ready-made prints</a>
        </article>

        <article className="card home-card">
          <p className="card-kicker">Collection</p>
          <h2>Handmade Crochet & Knit</h2>
          <p>
            Limited-stock handmade pieces crafted with care. Sold-out items stay visible so you can
            still browse the full style.
          </p>
          <a href="/shop?category=handmade_crochet_knit">Shop handmade</a>
        </article>
      </section>

      <section className="home-process panel" aria-label="How your order comes to life">
        <div className="home-process-head">
          <p className="card-kicker">How It Works</p>
          <h2>How Your Order Comes to Life</h2>
        </div>
        <ol className="home-process-list">
          <li>
            <strong>1. Choose your favorite</strong>
            <p>Pick handmade crochet, a ready-made print design, or a custom photo listing.</p>
          </li>
          <li>
            <strong>2. Add your details</strong>
            <p>For custom items, upload one image and include any notes on the product page.</p>
          </li>
          <li>
            <strong>3. Checkout securely</strong>
            <p>Pay with PayPal and receive clear updates as your order moves forward.</p>
          </li>
          <li>
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
