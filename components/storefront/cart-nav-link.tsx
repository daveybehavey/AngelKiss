"use client";

import { useCart } from "@/components/storefront/cart-provider";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CartNavLink() {
  const { itemCount, lastAddedAt } = useCart();
  const itemLabel = itemCount === 1 ? "item" : "items";
  const [animateBadge, setAnimateBadge] = useState(false);

  useEffect(() => {
    if (lastAddedAt === 0) {
      return;
    }

    setAnimateBadge(true);
    const timeoutId = window.setTimeout(() => {
      setAnimateBadge(false);
    }, 460);

    return () => window.clearTimeout(timeoutId);
  }, [lastAddedAt]);

  return (
    <Link
      href="/cart"
      className="site-nav-cart-link"
      aria-label={itemCount > 0 ? `Cart, ${itemCount} ${itemLabel}` : "Cart"}
    >
      <span>Cart</span>
      {itemCount > 0 ? (
        <span className={`site-cart-count-badge ${animateBadge ? "is-pulse" : ""}`}>
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
