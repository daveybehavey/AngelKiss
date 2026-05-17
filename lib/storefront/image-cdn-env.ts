/**
 * Normalizes `NEXT_PUBLIC_IMAGE_CDN_BASE_URL` for R2 / custom CDNs.
 * Accepts host-only values (e.g. `pub-….r2.dev`) by prepending `https://`.
 */
export function normalizeStorefrontImageCdnBaseUrl(raw: string | undefined | null): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) {
    return null;
  }
  const noTrail = t.replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(noTrail) ? noTrail : `https://${noTrail}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return null;
    }
    const path = u.pathname.replace(/\/+$/, "") || "";
    return path ? `${u.origin}${path}` : u.origin;
  } catch {
    return null;
  }
}

/** True when `src` is served from the public R2/CDN origin (not Supabase signed URLs). */
export function isStorefrontCdnImageSrc(src: string | null | undefined): boolean {
  const raw = typeof src === "string" ? src.trim() : "";
  if (!raw || raw.startsWith("/")) {
    return false;
  }
  const base = normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (!base) {
    return false;
  }
  try {
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    const imageOrigin = new URL(normalized).origin;
    const cdnOrigin = new URL(base).origin;
    return imageOrigin === cdnOrigin;
  } catch {
    return false;
  }
}

/**
 * Skip `/_next/image` for CDN catalog art — OpenNext on Cloudflare returns 400 for many
 * remote R2 URLs, and uploads are already WebP from the admin pipeline.
 */
export function storefrontImageUnoptimized(src: string): boolean {
  return isStorefrontCdnImageSrc(src);
}
