"use client";

import { CartNavLink } from "@/components/storefront/cart-nav-link";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

const CROCHET_HREF = "/shop?category=handmade_crochet_knit";
const PRINTS_HREF = "/shop?category=custom_sublimation";
const DESKTOP_NAV_MQ = "(min-width: 901px)";

function isDesktopNavViewport() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_NAV_MQ).matches;
}

type DrawerLinkProps = {
  href: string;
  mobile: string;
  desktop: string;
  className?: string;
};

function DrawerLink({ href, mobile, desktop, className }: DrawerLinkProps) {
  const classes = ["site-nav-drawer-link", className].filter(Boolean).join(" ");
  return (
    <Link href={href} prefetch={false} className={classes}>
      <span className="site-nav-text site-nav-text--mobile">{mobile}</span>
      <span className="site-nav-text site-nav-text--desktop">{desktop}</span>
    </Link>
  );
}

function DrawerGroupLabel({ children }: { children: ReactNode }) {
  return <p className="site-nav-group-label">{children}</p>;
}

/** Header: cart always visible; browse links in a mobile drawer / desktop row. */
export function HeaderNav() {
  const drawerRef = useRef<HTMLDetailsElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function closeDrawer() {
    if (drawerRef.current) {
      drawerRef.current.open = false;
    }
    setMenuOpen(false);
  }

  function handleToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    if (isDesktopNavViewport()) {
      event.currentTarget.open = true;
      setMenuOpen(false);
      return;
    }
    setMenuOpen(event.currentTarget.open);
  }

  function handleNavClickCapture(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("a")) {
      return;
    }
    closeDrawer();
  }

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_NAV_MQ);

    function syncDrawerForViewport() {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }
      if (mq.matches) {
        drawer.open = true;
        setMenuOpen(false);
        return;
      }
      drawer.open = false;
      setMenuOpen(false);
    }

    syncDrawerForViewport();
    mq.addEventListener("change", syncDrawerForViewport);
    return () => mq.removeEventListener("change", syncDrawerForViewport);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="site-header-actions">
      <CartNavLink className="site-header-cart" />
      <details className="site-nav-drawer" ref={drawerRef} onToggle={handleToggle}>
        <summary className="site-nav-menu-btn" aria-expanded={menuOpen}>
          <span className="site-nav-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="site-nav-menu-label">Menu</span>
        </summary>
        <button
          type="button"
          className="site-nav-backdrop"
          aria-label="Close menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={closeDrawer}
        />
        <div className="site-nav-panel">
          <div className="site-nav-panel-head">
            <p className="site-nav-panel-title">Browse</p>
            <button type="button" className="site-nav-panel-close" onClick={closeDrawer}>
              Close
            </button>
          </div>
          <nav
            className="site-nav"
            aria-label="Main navigation"
            onClickCapture={handleNavClickCapture}
          >
            <DrawerGroupLabel>Shop</DrawerGroupLabel>
            <DrawerLink
              href={CROCHET_HREF}
              mobile="Crochet & knit"
              desktop="Crochet"
            />
            <DrawerLink href={PRINTS_HREF} mobile="Custom prints" desktop="Prints" />
            <DrawerGroupLabel>Explore</DrawerGroupLabel>
            <DrawerLink href="/gallery" mobile="Print gallery" desktop="Gallery" />
            <DrawerLink href="/about" mobile="About the maker" desktop="About" />
            <DrawerLink
              href="/checkout"
              mobile="Checkout"
              desktop="Checkout"
              className="site-nav-checkout-link site-nav-checkout-link--desktop-only"
            />
          </nav>
          <p className="site-nav-panel-foot">Secure checkout with PayPal · Ships across Canada</p>
        </div>
      </details>
    </div>
  );
}

