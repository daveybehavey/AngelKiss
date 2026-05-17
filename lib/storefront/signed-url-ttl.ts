/**
 * Supabase Storage signed URL lifetime (seconds) for **public storefront** images
 * (catalog + studio gallery). Higher = fewer re-signs and better browser caching of the
 * same URL while Next `unstable_cache` serves a stable HTML/JSON payload.
 *
 * Override with `STOREFRONT_STORAGE_SIGNED_URL_TTL_SEC` (e.g. `43200` = 12h). Clamped 3600–172800.
 */
function readTtlSeconds(): number {
  const raw = process.env.STOREFRONT_STORAGE_SIGNED_URL_TTL_SEC?.trim();
  if (!raw) {
    return 6 * 60 * 60;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 6 * 60 * 60;
  }
  return Math.min(172800, Math.max(3600, n));
}

export const STOREFRONT_STORAGE_SIGNED_URL_TTL_SEC = readTtlSeconds();
