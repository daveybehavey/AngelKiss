"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function CartError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("cart.segment.error", error);
  }, [error]);

  return (
    <main className="page-main cart-page">
      <section className="panel page-intro">
        <h1 className="page-title">We could not load your cart</h1>
        <p className="page-lead">
          Something went wrong while loading this page. Your cart is still stored in this
          browser—try again in a moment.
        </p>
        <p className="page-link-row">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/shop">Continue shopping</Link>
          <Link href="/">Back to home</Link>
        </p>
        {process.env.NODE_ENV === "development" ? (
          <pre className="admin-note-tight" style={{ whiteSpace: "pre-wrap", overflow: "auto" }}>
            {error.message}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
