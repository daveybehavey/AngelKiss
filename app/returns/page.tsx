import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Returns & Refunds",
  description: "Returns and refund policy for AnglKiss Creations."
};

export default function ReturnsPolicyPage() {
  return (
    <main className="page-main policy-page">
      <section className="panel page-intro">
        <h1 className="page-title">Returns &amp; Refunds</h1>
        <p className="page-lead">
          We want every order to arrive as expected. If there is an issue, contact us and we will
          help.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Refund Policy</h2>
        <ul className="policy-list">
          <li>Refunds are handled at the full-order level in our current policy.</li>
          <li>Customer is responsible for return shipping costs.</li>
          <li>Please contact us before sending a return.</li>
        </ul>
      </section>

      <section className="panel policy-card">
        <h2>Custom and Handmade Items</h2>
        <p>
          Because many products are handmade or made-to-order, eligibility can depend on item
          condition and order type. We review each request case-by-case.
        </p>
      </section>

      <section className="panel policy-card">
        <h2>How to Start a Return</h2>
        <ol className="policy-list policy-list-ordered">
          <li>Email your order number and the reason for return.</li>
          <li>Wait for return instructions and confirmation.</li>
          <li>Ship the package using the provided guidance.</li>
        </ol>
      </section>

      <section className="panel policy-card">
        <h2>Support Contact</h2>
        <p>
          Email: <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>
        </p>
      </section>
    </main>
  );
}
