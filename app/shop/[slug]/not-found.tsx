import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="page-main product-page">
      <p className="product-back-row">
        <Link href="/shop" className="product-back-link">
          Back to shop
        </Link>
      </p>

      <section className="panel page-intro">
        <h1 className="page-title">Product not found</h1>
        <p className="page-lead">
          This listing may have been removed, or the link might be outdated. Browse the shop for
          current pieces and prints.
        </p>
        <p className="page-link-row">
          <Link href="/shop" className="btn btn-primary">
            Browse the shop
          </Link>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
