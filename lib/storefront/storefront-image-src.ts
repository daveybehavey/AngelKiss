import {
  catalogGridCdnUrlFromMasterUrl,
  isStorefrontR2GridVariantsEnabled
} from "@/lib/storefront/catalog-grid-image";
import {
  isStorefrontCdnImageSrc,
  normalizeStorefrontImageCdnBaseUrl
} from "@/lib/storefront/image-cdn-env";
import { getSiteOrigin } from "@/lib/site-url";

/** Default max width for shop / featured product cards (~2× typical 2-col mobile). */
export const STOREFRONT_GRID_IMAGE_WIDTH = 384;

/** Studio print tiles and PDP thumbs. */
export const STOREFRONT_THUMB_IMAGE_WIDTH = 200;

/** Home studio-print carousel (larger hero, still below full 1600px masters). */
export const STOREFRONT_HOME_STUDIO_IMAGE_WIDTH = 640;

/**
 * Values safe to pass to `next/image` `src` (absolute URL or root-relative path).
 * Rejects empty strings and strings that are not valid absolute URLs.
 */
export function storefrontImageSrcOrNull(url: string | null | undefined): string | null {
  let raw = typeof url === "string" ? url.trim() : "";
  if (!raw) {
    return null;
  }
  // Protocol-relative URLs (some CDNs / proxies) — `new URL("//host")` throws in Node.
  if (raw.startsWith("//")) {
    raw = `https:${raw}`;
  }
  if (raw.startsWith("/")) {
    return raw;
  }
  try {
    void new URL(raw);
    return raw;
  } catch {
    return null;
  }
}

import { storefrontImageUnoptimized } from "@/lib/storefront/image-cdn-env";

export { isStorefrontCdnImageSrc, storefrontImageUnoptimized } from "@/lib/storefront/image-cdn-env";

function storefrontCfImageResizeFlag(): boolean | null {
  const raw = process.env.NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on") {
    return true;
  }
  return null;
}

/** When true, grid/thumb URLs use `/cdn-cgi/image` on the site origin (Cloudflare Image Resizing). */
export function isStorefrontCfImageResizeEnabled(): boolean {
  const flag = storefrontCfImageResizeFlag();
  if (flag !== null) {
    return flag;
  }
  return Boolean(normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL));
}

function buildCfImageResizeUrl(
  source: string,
  options: { width: number; quality: number }
): string {
  const origin = getSiteOrigin();
  const opts = `width=${options.width},quality=${options.quality},format=auto`;
  if (source.startsWith("/")) {
    return `${origin}/cdn-cgi/image/${opts}${source}`;
  }
  return `${origin}/cdn-cgi/image/${opts}/${source}`;
}

/**
 * Smaller URL for product grids, featured cards, and gallery thumbs.
 * Uses Cloudflare `/cdn-cgi/image` when enabled; otherwise returns the normalized source.
 * Does not alter PDP main images — pass full-size URLs there.
 */
export function getStorefrontGridImageUrl(
  url: string | null | undefined,
  options?: { width?: number; quality?: number }
): string | null {
  const source = storefrontImageSrcOrNull(url);
  if (!source) {
    return null;
  }
  // R2 pub URLs: pre-generated `_grid.webp` siblings (not `/cdn-cgi/image` — 403 on pub.r2.dev).
  if (isStorefrontCdnImageSrc(source) && isStorefrontR2GridVariantsEnabled()) {
    return catalogGridCdnUrlFromMasterUrl(source) ?? source;
  }
  if (!isStorefrontCfImageResizeEnabled()) {
    return source;
  }
  const width = options?.width ?? STOREFRONT_GRID_IMAGE_WIDTH;
  const quality = options?.quality ?? 75;
  // Same-zone static assets (marketing booth, brand art).
  if (source.startsWith("/")) {
    return buildCfImageResizeUrl(source, { width, quality });
  }
  return source;
}

/** Keep `/_next/image` off resized CDN-cgi URLs and R2 masters. */
export function storefrontGridImageUnoptimized(src: string): boolean {
  if (src.includes("/cdn-cgi/image/")) {
    return true;
  }
  return storefrontImageUnoptimized(src);
}
