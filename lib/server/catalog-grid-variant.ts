import { getProductImagesBucket, normalizeStoragePathForBucket } from "@/lib/admin/images";
import {
  catalogGridObjectKey,
  CATALOG_GRID_MAX_EDGE,
  isCatalogGridObjectKey
} from "@/lib/storefront/catalog-grid-image";
import { catalogMediaUsesR2Uploads } from "@/lib/server/catalog-media-storage";
import { isStorefrontImageCdnEnabled } from "@/lib/storefront/storefront-media-url";
import {
  deleteR2CatalogObjectIfConfigured,
  getR2CatalogObjectBufferIfConfigured,
  headR2CatalogObjectIfConfigured,
  isR2ProductMediaUploadConfigured,
  putR2CatalogObjectBufferIfConfigured
} from "@/lib/server/r2-product-media";
import sharp from "sharp";

const GRID_WEBP_QUALITY = 75;

/**
 * Encode a grid WebP from master bytes (long edge ≤ CATALOG_GRID_MAX_EDGE).
 */
export async function encodeCatalogGridWebpFromBuffer(
  input: Buffer,
  maxEdge: number = CATALOG_GRID_MAX_EDGE
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(input, { failOn: "none", animated: false, pages: 1 }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW <= 0 || srcH <= 0) {
    throw new Error("invalid image dimensions");
  }
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const out = await sharp(input, { failOn: "none", animated: false, pages: 1 })
    .rotate()
    .resize({ width: w, height: h, fit: "inside", withoutEnlargement: true })
    .webp({ quality: GRID_WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toBuffer();
  return { buffer: out, width: w, height: h };
}

export type EnsureCatalogGridVariantResult =
  | { status: "skipped"; reason: string }
  | { status: "exists" }
  | { status: "created"; gridKey: string; bytes: number }
  | { status: "failed"; error: string };

/**
 * Write `_grid.webp` next to a catalog master in R2 when CDN + R2 uploads are configured.
 * Safe to call after admin uploads; no-op for template mockups and existing grid keys.
 */
export async function ensureCatalogGridVariantInR2(
  storagePath: string,
  options?: { force?: boolean; maxEdge?: number }
): Promise<EnsureCatalogGridVariantResult> {
  if (!isStorefrontImageCdnEnabled() || !catalogMediaUsesR2Uploads()) {
    return { status: "skipped", reason: "cdn_or_r2_not_configured" };
  }

  const bucket = getProductImagesBucket();
  const masterKey = normalizeStoragePathForBucket(storagePath, bucket);
  if (!masterKey || isCatalogGridObjectKey(masterKey)) {
    return { status: "skipped", reason: "not_a_master_key" };
  }

  const gridKey = catalogGridObjectKey(masterKey);
  if (!gridKey) {
    return { status: "skipped", reason: "no_grid_derivation" };
  }

  if (!isR2ProductMediaUploadConfigured()) {
    return { status: "skipped", reason: "r2_not_configured" };
  }

  if (!options?.force) {
    const exists = await headR2CatalogObjectIfConfigured(gridKey);
    if (exists) {
      return { status: "exists" };
    }
  }

  const master = await getR2CatalogObjectBufferIfConfigured(masterKey);
  if (!master) {
    return { status: "failed", error: "master_not_found_in_r2" };
  }

  try {
    const encoded = await encodeCatalogGridWebpFromBuffer(master, options?.maxEdge ?? CATALOG_GRID_MAX_EDGE);
    await putR2CatalogObjectBufferIfConfigured(gridKey, encoded.buffer, "image/webp");
    return { status: "created", gridKey, bytes: encoded.buffer.length };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Remove grid sibling when deleting a master (best-effort). */
export async function deleteCatalogGridVariantInR2(storagePath: string): Promise<void> {
  const bucket = getProductImagesBucket();
  const masterKey = normalizeStoragePathForBucket(storagePath, bucket);
  const gridKey = catalogGridObjectKey(masterKey);
  if (gridKey) {
    await deleteR2CatalogObjectIfConfigured(gridKey);
  }
}
