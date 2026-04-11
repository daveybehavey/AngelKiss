import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Allura, Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { CartProvider } from "@/components/storefront/cart-provider";
import { CartNavLink } from "@/components/storefront/cart-nav-link";
import "./globals.css";

const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display"
});

const fontLogo = Allura({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-logo"
});

const fontBody = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

const fallbackSiteUrl = "http://localhost:3000";
const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackSiteUrl;
const metadataBase = (() => {
  try {
    return new URL(configuredSiteUrl);
  } catch {
    return new URL(fallbackSiteUrl);
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "AnglKiss Creations",
    template: "%s | AnglKiss Creations"
  },
  description:
    "Handmade crochet gifts, ready-made designs, and made-to-order custom sublimation prints.",
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontLogo.variable} ${fontBody.variable}`}>
      <body className="font-body">
        <CartProvider>
          <div className="site-root">
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <header className="site-header">
              <div className="site-wrap site-header-inner">
                <a className="brand-link" href="/">
                  AnglKiss Creations
                </a>
                <nav className="site-nav" aria-label="Main navigation">
                  <a href="/shop">Shop</a>
                  <CartNavLink />
                  <a href="/checkout">Checkout</a>
                </nav>
              </div>
            </header>
            <div id="main-content" tabIndex={-1}>
              {children}
            </div>
            <footer className="site-footer">
              <div className="site-wrap site-footer-grid">
                <section className="site-footer-column">
                  <h2 className="site-footer-title site-footer-brand">AnglKiss Creations</h2>
                  <p>
                    Handmade crochet gifts and custom keepsakes, lovingly crafted on Vancouver
                    Island.
                  </p>
                </section>
                <section className="site-footer-column">
                  <h2 className="site-footer-title">Shop</h2>
                  <ul className="site-footer-links">
                    <li>
                      <a href="/shop">All Products</a>
                    </li>
                    <li>
                      <a href="/shop?category=custom_sublimation">Custom-Printed</a>
                    </li>
                    <li>
                      <a href="/shop?category=handmade_crochet_knit">Crochet & Knit</a>
                    </li>
                  </ul>
                </section>
                <section className="site-footer-column">
                  <h2 className="site-footer-title">Contact</h2>
                  <p>
                    Email:{" "}
                    <a href="mailto:anglkisscreations@gmail.com">
                      anglkisscreations@gmail.com
                    </a>
                  </p>
                  <p>Secure checkout with PayPal.</p>
                  <p>Shipping available across Canada and the USA.</p>
                  <ul className="site-footer-links">
                    <li>
                      <a href="/shipping">Shipping Policy</a>
                    </li>
                    <li>
                      <a href="/returns">Returns &amp; Refunds</a>
                    </li>
                  </ul>
                </section>
              </div>
              <div className="site-wrap site-footer-bottom">
                <p>&copy; {new Date().getFullYear()} AnglKiss Creations. All rights reserved.</p>
              </div>
            </footer>
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
