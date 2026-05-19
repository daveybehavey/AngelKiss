export default function CheckoutLoading() {
  return (
    <main className="page-main checkout-page shop-skeleton" aria-busy="true" aria-label="Loading checkout">
      <section className="panel page-intro checkout-intro">
        <div className="shop-skeleton-line shop-skeleton-line-xl" style={{ maxWidth: "220px" }} />
        <div className="shop-skeleton-line shop-skeleton-line-md" />
        <div className="shop-skeleton-block" style={{ minHeight: "2rem", maxWidth: "420px" }} />
        <div className="shop-skeleton-block" style={{ minHeight: "2.4rem" }} />
      </section>
      <div className="checkout-layout">
        <aside className="checkout-aside">
          <section className="panel checkout-summary" style={{ minHeight: "280px", padding: "1rem" }}>
            <div className="shop-skeleton-line shop-skeleton-line-lg" style={{ marginBottom: "0.85rem" }} />
            <div className="shop-skeleton-block" style={{ minHeight: "120px", marginBottom: "0.75rem" }} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shop-skeleton-line shop-skeleton-line-sm"
                style={{ marginBottom: "0.5rem", maxWidth: i === 1 ? "88%" : "100%" }}
              />
            ))}
          </section>
        </aside>
        <div className="checkout-main">
          <section className="panel checkout-form-panel" style={{ minHeight: "420px", padding: "1rem" }}>
            <div className="shop-skeleton-line shop-skeleton-line-lg" style={{ marginBottom: "1rem" }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="shop-skeleton-line shop-skeleton-line-sm"
                style={{ marginBottom: "0.65rem", maxWidth: i % 2 === 0 ? "100%" : "85%" }}
              />
            ))}
            <div className="shop-skeleton-block" style={{ marginTop: "1.25rem", minHeight: "48px" }} />
          </section>
        </div>
      </div>
    </main>
  );
}
