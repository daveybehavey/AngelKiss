import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AnglKiss Creations collects, uses, and protects your information.",
  openGraph: {
    title: "Privacy Policy | AnglKiss Creations",
    description: "What we collect at checkout and how we keep your data safe.",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | AnglKiss Creations",
    description: "Checkout data, PayPal payments, and how to contact us about privacy."
  }
};

export default function PrivacyPolicyPage() {
  return (
    <main className="page-main policy-page">
      <section className="panel page-intro">
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-lead">
          We only collect what we need to fulfill your order and keep the shop running. Last
          updated: {new Date().getFullYear()}.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>What We Collect</h2>
        <ul className="policy-list">
          <li>
            <strong>Checkout:</strong> name, email, shipping address, phone (if you provide it),
            cart contents, and customization details you submit (for example uploaded images for
            custom-print items).
          </li>
          <li>
            <strong>Payments:</strong> processed by <strong>PayPal</strong>. We do not store your
            full card or bank details on our servers—PayPal handles payment credentials according
            to their own privacy policy.
          </li>
          <li>
            <strong>Technical data:</strong> standard server or hosting logs (such as IP address and
            browser type) may be collected by our hosting provider to operate the site securely.
          </li>
          <li>
            <strong>Site usage (optional):</strong> when enabled, we may use Cloudflare Web
            Analytics for aggregated page views and referrers to understand what content helps
            customers find the shop.
          </li>
          <li>
            <strong>Email list:</strong> if you sign up for updates in the footer, we store your email
            address (and when you subscribed) so we can send occasional shop news. You can ask us to
            remove you anytime using the contact below.
          </li>
        </ul>
      </section>

      <section className="panel policy-card">
        <h2>How We Use Information</h2>
        <ul className="policy-list">
          <li>To process, ship, and support your order.</li>
          <li>To communicate with you about your purchase if needed.</li>
          <li>To improve the storefront and fix technical issues.</li>
        </ul>
      </section>

      <section className="panel policy-card">
        <h2>Storage &amp; Security</h2>
        <p>
          Order and product data are stored in our database (hosted by Supabase). Uploaded custom
          images are stored in secure cloud storage. We use industry-standard practices such as
          encrypted connections (HTTPS) for the website.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Retention</h2>
        <p>
          We keep order records as needed for taxes, fulfillment, and customer support. If you need
          a copy of your data or want to ask about deletion where the law allows, contact us below.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Contact</h2>
        <p>
          Questions about this policy:{" "}
          <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>
        </p>
      </section>
    </main>
  );
}
