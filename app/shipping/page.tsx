import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Shipping zones, rates, and delivery expectations for AnglKiss Creations.",
  openGraph: {
    title: "Shipping Policy | AnglKiss Creations",
    description: "Where we ship, how rates work, and what to expect at checkout.",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Shipping Policy | AnglKiss Creations",
    description: "Where we ship and how shipping is calculated at checkout."
  }
};

export default function ShippingPolicyPage() {
  return (
    <main className="page-main policy-page">
      <section className="panel page-intro">
        <h1 className="page-title">Shipping Policy</h1>
        <p className="page-lead">
          We pack with care from Vancouver Island and ship across Canada.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Where We Ship</h2>
        <ul className="policy-list">
          <li>Canada (local, regional, and national zones)</li>
        </ul>
      </section>

      <section className="panel policy-card">
        <h2>How Shipping Is Calculated</h2>
        <p>
          Shipping is calculated at checkout based on destination zone. Rates are shown before you
          complete payment.
        </p>
        <p>
          Free shipping is automatically applied on eligible orders when your subtotal reaches the
          current threshold.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Processing and Delivery</h2>
        <ul className="policy-list">
          <li>Ready-made and in-stock items usually ship faster.</li>
          <li>Made-to-order and custom print items need production time before shipping.</li>
          <li>Once shipped, you will receive tracking details when available.</li>
        </ul>
      </section>

      <section className="panel policy-card">
        <h2>Need Help?</h2>
        <p>
          Questions about shipping timelines or an existing order can be sent to{" "}
          <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>.
        </p>
      </section>
    </main>
  );
}
