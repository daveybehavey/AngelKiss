import Link from "next/link";

export default function GlobalNotFound() {
  return (
    <main className="page-main">
      <section className="panel page-intro">
        <h1 className="page-title">Page not found</h1>
        <p className="page-lead">
          We could not find what you were looking for. The address may be mistyped, or the page may
          have moved.
        </p>
        <p className="page-link-row">
          <Link href="/" className="btn btn-primary">
            Back to home
          </Link>
          <Link href="/shop">Shop</Link>
        </p>
      </section>
    </main>
  );
}
