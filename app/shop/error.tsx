"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ShopError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("shop.segment.error", error);
  }, [error]);

  return (
    <main className="page-main shop-page">
      <section className="panel page-intro">
        <h1 className="page-title">We could not load the shop</h1>
        <p className="page-lead">
          Something went wrong while loading this page. Your connection and our store are both fine
          most of the time—this is usually a temporary glitch.
        </p>
        <p className="page-link-row">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/">Back to home</Link>
          <Link href="/shop">Shop</Link>
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
