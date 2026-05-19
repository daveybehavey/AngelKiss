import {
  isStorefrontCdnImageSrc,
  normalizeStorefrontImageCdnBaseUrl
} from "@/lib/storefront/image-cdn-env";

function buildCdnObjectUrl(normalizedObjectKey: string): string {
  const base = normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (!base) {
    throw new Error("NEXT_PUBLIC_IMAGE_CDN_BASE_URL is not set");
  }
  const key = normalizedObjectKey.replace(/^\/+/, "");
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encoded}`;
}

/** Max long edge for R2 `_grid.webp` siblings (shop cards, featured, gallery thumbs). */
export const CATALOG_GRID_MAX_EDGE = 384;

const RASTER_EXT = /\.(jpe?g|png|gif|webp|tiff?|heic|heif)$/i;

export function isRasterCatalogObjectKey(objectKey: string): boolean {
  return RASTER_EXT.test(String(objectKey ?? "").trim());
}

/** True when the object key is already a storefront grid variant. */
export function isCatalogGridObjectKey(objectKey: string): boolean {
  return /_grid\.webp$/i.test(String(objectKey ?? "").trim());
}

/**
 * Predictable R2 object key for a grid WebP sibling, e.g. `products/foo.webp` → `products/foo_grid.webp`.
 * Returns null when no grid variant should be created (templates, non-raster, already grid).
 */
export function catalogGridObjectKey(masterObjectKey: string): string | null {
  const key = String(masterObjectKey ?? "")
    .trim()
    .replace(/^\/+/, "");
  if (!key || isCatalogGridObjectKey(key)) {
    return null;
  }
  if (key.startsWith("templates/")) {
    return null;
  }
  if (!isRasterCatalogObjectKey(key)) {
    return null;
  }
  if (/\.webp$/i.test(key)) {
    return key.replace(/\.webp$/i, "_grid.webp");
  }
  return key.replace(/\.(jpe?g|png|gif|tiff?|heic|heif)$/i, "_grid.webp");
}

export function isStorefrontR2GridVariantsEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on") {
    return true;
  }
  return false;
}

function decodeCdnPathname(pathname: string): string {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/** Extract catalog object key from a public CDN URL (must match configured CDN origin). */
export function catalogObjectKeyFromCdnUrl(cdnUrl: string): string | null {
  const base = normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (!base) {
    return null;
  }
  try {
    const imageUrl = cdnUrl.startsWith("//") ? `https:${cdnUrl}` : cdnUrl;
    const u = new URL(imageUrl);
    const baseUrl = new URL(base);
    if (u.origin !== baseUrl.origin) {
      return null;
    }
    const basePath = baseUrl.pathname.replace(/\/+$/, "");
    let path = u.pathname;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length);
    }
    const key = decodeCdnPathname(path);
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Public CDN URL for the `_grid.webp` sibling of a master catalog URL.
 * Returns null when derivation is not possible (caller should use the master URL).
 */
export function catalogGridCdnUrlFromMasterUrl(masterUrl: string): string | null {
  if (!isStorefrontCdnImageSrc(masterUrl)) {
    return null;
  }
  const objectKey = catalogObjectKeyFromCdnUrl(masterUrl);
  if (!objectKey) {
    return null;
  }
  const gridKey = catalogGridObjectKey(objectKey);
  if (!gridKey) {
    return null;
  }
  return buildCdnObjectUrl(gridKey);
}
