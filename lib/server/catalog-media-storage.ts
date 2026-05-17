import { getProductImagesBucket, normalizeStoragePathForBucket } from "@/lib/admin/images";
import {
  deleteR2CatalogObjectIfConfigured,
  isR2ProductMediaUploadConfigured
} from "@/lib/server/r2-product-media";
import { isStorefrontImageCdnEnabled } from "@/lib/storefront/storefront-media-url";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Admin catalog + studio gallery uploads go to R2 when all `R2_*` vars are set. */
export function catalogMediaUsesR2Uploads(): boolean {
  return isR2ProductMediaUploadConfigured();
}

/**
 * When the storefront serves images from a public CDN (`NEXT_PUBLIC_IMAGE_CDN_BASE_URL`),
 * new uploads must land in the same R2 bucket — not Supabase Storage.
 */
export function getCatalogMediaUploadBlockReason(): string | null {
  if (isStorefrontImageCdnEnabled() && !isR2ProductMediaUploadConfigured()) {
    return (
      "NEXT_PUBLIC_IMAGE_CDN_BASE_URL is set but R2 upload credentials are missing. " +
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME " +
      "(same bucket as the CDN). Admin uploads will not fall back to Supabase Storage while CDN mode is on."
    );
  }
  return null;
}

/** Remove object from R2 (if configured) and Supabase Storage (legacy copies). */
export async function deleteCatalogMediaObject(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  const bucket = getProductImagesBucket();
  const key = normalizeStoragePathForBucket(storagePath, bucket);
  await deleteR2CatalogObjectIfConfigured(key);
  try {
    await supabase.storage.from(bucket).remove([key]);
  } catch {
    /* legacy object may exist only on R2 */
  }
}
