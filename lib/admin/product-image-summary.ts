import type { ProductCategory } from "@/lib/admin/products";
import { getLocalCatalogImageForProduct } from "@/lib/storefront/catalog-image-fallback";
import { resolveStorefrontProductImageReadUrls } from "@/lib/storefront/storefront-media-url";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type AdminProductImageSummary = {
  /** Rows in `product_images` (upload/delete source of truth). */
  uploaded_image_count: number;
  /** Count aligned with what shoppers see on /shop cards. */
  display_image_count: number;
  primary_preview_url: string | null;
  primary_preview_alt: string | null;
  /** True when the preview uses `public/marketing` fallback, not an upload. */
  uses_local_catalog_fallback: boolean;
};

function pickPrimaryImage(images: ProductImageRow[]): ProductImageRow | null {
  if (images.length === 0) {
    return null;
  }
  return images.find((image) => image.is_primary) ?? images[0] ?? null;
}

/**
 * Batch-resolve admin catalog thumbnails using the same rules as `listPublicProducts`.
 */
export async function resolveAdminProductImageSummaries(
  supabase: SupabaseClient,
  products: Array<{ id: string; slug: string; name: string; category: ProductCategory }>
): Promise<Record<string, AdminProductImageSummary>> {
  const summaries: Record<string, AdminProductImageSummary> = {};
  if (products.length === 0) {
    return summaries;
  }

  for (const product of products) {
    summaries[product.id] = {
      uploaded_image_count: 0,
      display_image_count: 0,
      primary_preview_url: null,
      primary_preview_alt: null,
      uses_local_catalog_fallback: false
    };
  }

  const productIds = products.map((product) => product.id);
  const { data, error } = await supabase
    .from("product_images")
    .select("id,product_id,storage_path,alt_text,sort_order,is_primary")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load product images");
  }

  const imagesByProductId = new Map<string, ProductImageRow[]>();
  for (const image of (data ?? []) as ProductImageRow[]) {
    const list = imagesByProductId.get(image.product_id) ?? [];
    list.push(image);
    imagesByProductId.set(image.product_id, list);
  }

  const primaryByProductId = new Map<string, ProductImageRow>();
  for (const [productId, images] of imagesByProductId) {
    const primary = pickPrimaryImage(images);
    if (primary) {
      primaryByProductId.set(productId, primary);
    }
  }

  const signedUrlsByStoragePath = await resolveStorefrontProductImageReadUrls(
    supabase,
    [...primaryByProductId.values()].map((image) => image.storage_path)
  );

  for (const product of products) {
    const images = imagesByProductId.get(product.id) ?? [];
    const uploadedCount = images.length;
    const primary = primaryByProductId.get(product.id) ?? null;
    let previewUrl = primary ? (signedUrlsByStoragePath[primary.storage_path] ?? null) : null;
    let previewAlt = primary?.alt_text ?? null;
    let usesFallback = false;

    if (!previewUrl) {
      const local = getLocalCatalogImageForProduct(product);
      if (local) {
        previewUrl = local.url;
        previewAlt = local.alt;
        usesFallback = uploadedCount === 0;
      }
    }

    const displayCount = previewUrl ? (uploadedCount > 0 ? uploadedCount : 1) : 0;

    summaries[product.id] = {
      uploaded_image_count: uploadedCount,
      display_image_count: displayCount,
      primary_preview_url: previewUrl,
      primary_preview_alt: previewAlt,
      uses_local_catalog_fallback: usesFallback
    };
  }

  return summaries;
}
