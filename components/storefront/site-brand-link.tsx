import Link from "next/link";

/** Sticky header brand: script wordmark only (no image mark). */
export function SiteBrandLink() {
  return (
    <Link className="brand-link" href="/" prefetch={false}>
      AnglKiss Creations
    </Link>
  );
}
