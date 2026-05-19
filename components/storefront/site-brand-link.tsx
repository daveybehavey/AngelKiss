import Link from "next/link";

/** Sticky header brand: script wordmark (text only). */
export function SiteBrandLink() {
  return (
    <Link className="brand-link" href="/" prefetch={false}>
      AnglKiss Creations
    </Link>
  );
}
