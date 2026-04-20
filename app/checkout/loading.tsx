export default function CheckoutLoading() {
  return (
    <main className="page-main checkout-page shop-skeleton" aria-busy="true" aria-label="Loading checkout">
      <section className="panel page-intro">
        <div className="shop-skeleton-line shop-skeleton-line-xl" style={{ maxWidth: "280px" }} />
        <div className="shop-skeleton-line shop-skeleton-line-md" />
        <div className="shop-skeleton-line shop-skeleton-line-sm" style={{ maxWidth: "360px" }} />
      </section>
      <section className="panel" style={{ minHeight: "420px", padding: "1rem" }}>
        <div className="shop-skeleton-line shop-skeleton-line-lg" style={{ marginBottom: "1rem" }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="shop-skeleton-line shop-skeleton-line-sm"
            style={{ marginBottom: "0.65rem", maxWidth: i % 2 === 0 ? "100%" : "85%" }}
          />
        ))}
        <div className="shop-skeleton-block" style={{ marginTop: "1.25rem", minHeight: "80px" }} />
      </section>
    </main>
  );
}
