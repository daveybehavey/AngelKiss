export default function ProductLoading() {
  return (
    <main className="page-main product-page shop-skeleton" aria-busy="true" aria-label="Loading product">
      <div className="shop-skeleton-line shop-skeleton-line-sm" style={{ maxWidth: "140px" }} />
      <section className="panel product-layout shop-skeleton-product-layout">
        <div className="shop-skeleton-gallery" />
        <div className="shop-skeleton-summary">
          <div className="shop-skeleton-line shop-skeleton-line-xl" />
          <div className="shop-skeleton-line shop-skeleton-line-md" style={{ maxWidth: "120px" }} />
          <div className="shop-skeleton-line shop-skeleton-line-sm" />
          <div className="shop-skeleton-line shop-skeleton-line-sm" />
          <div className="shop-skeleton-line shop-skeleton-line-sm" />
          <div className="shop-skeleton-block" />
        </div>
      </section>
    </main>
  );
}
