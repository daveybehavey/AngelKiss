import { CANONICAL_SITE_URL } from "@/lib/site-domains";

/**
 * Public site origin for sitemap/robots/structured data.
 * Prefer `NEXT_PUBLIC_SITE_URL`; fall back to the repo-canonical `.ca` host
 * (never localhost) so crawler-facing generators stay production-shaped.
 */
export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return CANONICAL_SITE_URL;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return CANONICAL_SITE_URL;
  }
}
