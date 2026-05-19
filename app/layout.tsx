import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Allura, Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { CloudflareWebAnalytics } from "@/components/analytics/cloudflare-web-analytics";
import { normalizeStorefrontImageCdnBaseUrl } from "@/lib/storefront/image-cdn-env";
import { SiteBrandLink } from "@/components/storefront/site-brand-link";
import { HeaderNav } from "@/components/storefront/header-nav";
import { CartProvider } from "@/components/storefront/cart-provider";
import { NewsletterSignup } from "@/components/storefront/newsletter-signup";
import "./globals.css";

const fontBody = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body-next",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display-next",
  display: "swap",
  weight: ["500", "600", "700"]
});

const fontLogo = Allura({
  subsets: ["latin"],
  variable: "--font-logo-next",
  weight: "400",
  display: "swap"
});

const fallbackSiteUrl = "http://127.0.0.1:3010";
const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackSiteUrl;
const metadataBase = (() => {
  try {
    return new URL(configuredSiteUrl);
  } catch {
    return new URL(fallbackSiteUrl);
  }
})();

const siteDescription =
  "Handmade crochet gifts and custom prints from Vancouver Island—your photo or our in-house designs on mugs, tumblers, bags, and more.";

const siteOgImage = {
  url: "/marketing/home-gallery/stand-04.webp",
  width: 1200,
  height: 630,
  alt: "AnglKiss Creations market booth — handmade crochet and custom prints"
} as const;

const FACEBOOK_PAGE_URL = "https://www.facebook.com/share/g/1HKrrGAS6B/";

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "AnglKiss Creations",
    template: "%s | AnglKiss Creations"
  },
  description: siteDescription,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: metadataBase,
    siteName: "AnglKiss Creations",
    title: "AnglKiss Creations",
    description: siteDescription,
    images: [siteOgImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "AnglKiss Creations",
    description: siteDescription,
    images: [siteOgImage.url]
  },
  robots: {
    index: true,
    follow: true
  }
};

const imageCdnOrigin = (() => {
  const base = normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (!base) {
    return null;
  }
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
})();

const storeJsonLd = {
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  name: "AnglKiss Creations",
  description: siteDescription,
  url: metadataBase.origin,
  areaServed: ["CA"]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontBody.variable} ${fontDisplay.variable} ${fontLogo.variable}`}
    >
      <head>
        {imageCdnOrigin ? (
          <link rel="preconnect" href={imageCdnOrigin} crossOrigin="anonymous" />
        ) : null}
        <link
          rel="preload"
          as="image"
          href="/marketing/brand/hero-mobile.webp"
          type="image/webp"
          media="(max-width: 700px)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          href="/marketing/brand/hero-tablet.webp"
          type="image/webp"
          media="(max-width: 980px)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          href="/marketing/brand/hero-desktop.webp"
          type="image/webp"
          media="(min-width: 981px)"
          fetchPriority="high"
        />
      </head>
      <body className="font-body">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
        />
        <CartProvider>
          <div className="site-root">
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <header className="site-header">
              <div className="site-wrap site-header-inner">
                <SiteBrandLink />
                <HeaderNav />
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
                      <Link href="/shop">All products</Link>
                    </li>
                    <li>
                      <Link href="/shop?category=handmade_crochet_knit">Crochet &amp; knit</Link>
                    </li>
                    <li>
                      <Link href="/shop?category=custom_sublimation">Custom prints</Link>
                    </li>
                    <li>
                      <Link href="/gallery">Our print designs</Link>
                    </li>
                    <li>
                      <Link href="/about">About</Link>
                    </li>
                  </ul>
                </section>
                <section className="site-footer-column site-footer-newsletter">
                  <NewsletterSignup headingId="footer-newsletter-heading" />
                </section>
                <section className="site-footer-column">
                  <h2 className="site-footer-title">Contact</h2>
                  <p>
                    Email:{" "}
                    <a href="mailto:anglkisscreations@gmail.com">
                      anglkisscreations@gmail.com
                    </a>
                  </p>
                  <p className="site-footer-social">
                    <a
                      href={FACEBOOK_PAGE_URL}
                      className="site-footer-social-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Follow us on Facebook (opens in a new tab)"
                    >
                      <svg
                        className="site-footer-social-icon"
                        viewBox="0 0 24 24"
                        aria-hidden={true}
                        focusable="false"
                      >
                        <path
                          fill="currentColor"
                          d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.12 8.44 9.88v-6.99H7.9v-2.89h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.89h-2.33v6.99C18.34 21.12 22 16.99 22 12z"
                        />
                      </svg>
                      <span>Follow us on Facebook</span>
                    </a>
                  </p>
                  <p>Secure checkout with PayPal.</p>
                  <p>Shipping available across Canada.</p>
                  <ul className="site-footer-links">
                    <li>
                      <Link href="/shipping">Shipping Policy</Link>
                    </li>
                    <li>
                      <Link href="/returns">Returns &amp; Refunds</Link>
                    </li>
                    <li>
                      <Link href="/privacy">Privacy Policy</Link>
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
        <CloudflareWebAnalytics />
      </body>
    </html>
  );
}
