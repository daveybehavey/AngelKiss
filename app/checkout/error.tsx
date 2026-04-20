"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function CheckoutError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("checkout.segment.error", error);
  }, [error]);

  return (
    <main className="page-main checkout-page">
      <section className="panel page-intro">
        <h1 className="page-title">Checkout hit a snag</h1>
        <p className="page-lead">
          Your cart is still saved in this browser. You can try this step again or return to the
          shop—nothing is charged until PayPal confirms payment.
        </p>
        <p className="page-link-row">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/cart">Back to cart</Link>
          <Link href="/shop">Continue shopping</Link>
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
