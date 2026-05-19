"use client";

import { CartIcon } from "@/components/storefront/cart-icon";
import { useCart } from "@/components/storefront/cart-provider";
import Link from "next/link";
import { useEffect, useState } from "react";

type CartNavLinkProps = {
  className?: string;
};

export function CartNavLink({ className }: CartNavLinkProps) {
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

  const classes = ["site-nav-cart-link", className].filter(Boolean).join(" ");

  return (
    <Link
      href="/cart"
      className={classes}
      aria-label={itemCount > 0 ? `Cart, ${itemCount} ${itemLabel}` : "Cart"}
    >
      <CartIcon className="site-nav-cart-icon" />
      {itemCount > 0 ? (
        <span className={`site-cart-count-badge ${animateBadge ? "is-pulse" : ""}`}>
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
