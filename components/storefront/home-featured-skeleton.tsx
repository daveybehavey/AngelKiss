import Link from "next/link";

/**
 * Shown while homepage featured products stream in (Supabase + signed URLs).
 */
export function HomeFeaturedSkeleton() {
  return (
    <section
      className="home-featured home-featured-skeleton"
      aria-labelledby="home-featured-heading"
      aria-busy="true"
      aria-live="polite"
    >
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
      <p className="home-featured-loading-hint">Loading the latest listings…</p>
      <div className="home-featured-grid-wrap">
        <ul className="home-featured-grid home-featured-skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="home-featured-card home-featured-skeleton-card">
              <div className="home-featured-skeleton-media" />
              <div className="home-featured-skeleton-body">
                <div className="home-featured-skeleton-line home-featured-skeleton-line--short" />
                <div className="home-featured-skeleton-line home-featured-skeleton-line--title" />
                <div className="home-featured-skeleton-line home-featured-skeleton-line--price" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
