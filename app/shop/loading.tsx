export default function ShopLoading() {
  return (
    <main className="page-main shop-page shop-skeleton" aria-busy="true" aria-label="Loading shop">
      <section className="panel shop-hero shop-hero-enhanced shop-skeleton-hero">
        <div className="shop-skeleton-line shop-skeleton-line-lg" />
        <div className="shop-skeleton-line shop-skeleton-line-xl" />
        <div className="shop-skeleton-line shop-skeleton-line-md" />
      </section>
      <div className="shop-skeleton-stats">
        <div className="shop-skeleton-card" />
        <div className="shop-skeleton-card" />
        <div className="shop-skeleton-card" />
      </div>
      <div className="shop-skeleton-chips">
        <div className="shop-skeleton-chip" />
        <div className="shop-skeleton-chip" />
        <div className="shop-skeleton-chip" />
      </div>
      <ul className="shop-skeleton-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="shop-skeleton-product" />
        ))}
      </ul>
    </main>
  );
}
