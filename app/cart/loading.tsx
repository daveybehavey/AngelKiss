export default function CartLoading() {
  return (
    <main className="page-main cart-page shop-skeleton" aria-busy="true" aria-label="Loading cart">
      <section className="panel page-intro">
        <div className="shop-skeleton-line shop-skeleton-line-xl" style={{ maxWidth: "240px" }} />
        <div className="shop-skeleton-line shop-skeleton-line-md" />
        <div className="shop-skeleton-line shop-skeleton-line-sm" style={{ maxWidth: "400px" }} />
        <div className="shop-skeleton-chips" style={{ marginTop: "0.75rem" }}>
          <div className="shop-skeleton-chip" style={{ width: "140px" }} />
          <div className="shop-skeleton-chip" style={{ width: "120px" }} />
        </div>
      </section>
      <ul className="cart-list">
        {Array.from({ length: 2 }).map((_, i) => (
          <li key={i} className="panel cart-item shop-skeleton-product" style={{ minHeight: "120px" }} />
        ))}
      </ul>
    </main>
  );
}
