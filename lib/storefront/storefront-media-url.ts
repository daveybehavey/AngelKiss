import { getProductImagesBucket, normalizeStoragePathForBucket } from "@/lib/admin/images";
import { normalizeStorefrontImageCdnBaseUrl } from "@/lib/storefront/image-cdn-env";
import { STOREFRONT_STORAGE_SIGNED_URL_TTL_SEC } from "@/lib/storefront/signed-url-ttl";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Public origin (or origin+path) for catalog + studio images. No trailing slash; scheme added if omitted. */
export function getStorefrontImageCdnBaseUrl(): string | null {
  return normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
}

export function isStorefrontImageCdnEnabled(): boolean {
  return Boolean(getStorefrontImageCdnBaseUrl());
}

export function buildStorefrontCdnObjectUrl(normalizedObjectKey: string): string {
  const base = getStorefrontImageCdnBaseUrl();
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

/**
 * Map each original `storage_path` (as stored in Postgres) to a browser URL.
 * When `NEXT_PUBLIC_IMAGE_CDN_BASE_URL` is set, uses stable public URLs (no Supabase egress).
 * Otherwise uses Supabase signed URLs (TTL from options or storefront default).
 */
export async function resolveStorefrontProductImageReadUrls(
  supabase: SupabaseClient,
  storagePaths: string[],
  options?: { signedUrlTtlSec?: number }
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(storagePaths.filter((value) => value.trim().length > 0)));
  if (uniquePaths.length === 0) {
    return {};
  }

  const cdnBase = getStorefrontImageCdnBaseUrl();
  if (cdnBase) {
    const bucket = getProductImagesBucket();
    const out: Record<string, string> = {};
    for (const path of uniquePaths) {
      const norm = normalizeStoragePathForBucket(path, bucket);
      out[path] = buildStorefrontCdnObjectUrl(norm);
    }
    return out;
  }

  const bucket = getProductImagesBucket();
  const normalizedPaths = uniquePaths.map((path) => normalizeStoragePathForBucket(path, bucket));
  const ttl = options?.signedUrlTtlSec ?? STOREFRONT_STORAGE_SIGNED_URL_TTL_SEC;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(normalizedPaths, ttl);
  if (error || !data) {
    return {};
  }

  const byNormalizedPath = new Map<string, string>();
  for (const item of data) {
    if (!item.path || !item.signedUrl || item.error) {
      continue;
    }
    byNormalizedPath.set(item.path, item.signedUrl);
  }

  const byOriginalPath: Record<string, string> = {};
  for (const path of uniquePaths) {
    const normalized = normalizeStoragePathForBucket(path, bucket);
    const signedUrl = byNormalizedPath.get(normalized);
    if (signedUrl) {
      byOriginalPath[path] = signedUrl;
    }
  }

  return byOriginalPath;
}
