import Link from "next/link";

type HomeStudioPrintGalleryEmptyProps = {
  reason: "no-prints" | "error";
};

/** Shown when there are no active prints yet, or the gallery query failed. */
export function HomeStudioPrintGalleryEmpty({ reason }: HomeStudioPrintGalleryEmptyProps) {
  return (
    <section
      className="home-studio-print-gallery home-studio-print-gallery-empty"
      aria-labelledby="home-studio-print-empty-heading"
    >
      <div className="home-studio-print-gallery-header">
        <p className="home-studio-print-kicker">In-house designs</p>
        <h2 id="home-studio-print-empty-heading" className="home-studio-print-title">
          Studio print gallery
        </h2>
        <p className="home-studio-print-lead">
          {reason === "no-prints"
            ? "Rotating previews of our in-house designs will appear here as soon as they are live in the catalog."
            : "We could not load the gallery just now—custom tumblers, mugs, and bags are still in the shop."}
        </p>
        <div className="home-studio-print-caption-actions home-studio-print-empty-actions">
          <Link
            href="/shop?category=custom_sublimation&sublimation_mode=customer_upload"
            className="btn btn-primary"
          >
            Browse custom blanks
          </Link>
          <Link href="/shop" className="btn btn-outline">
            Full shop
          </Link>
        </div>
      </div>
    </section>
  );
}
