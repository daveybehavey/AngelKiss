import type { PublicProductImage } from "@/lib/storefront/products";

/**
 * When a product has color/style variants, shoppers see photos for the selected variant
 * plus any photos not tied to a specific variant. Falls back to all photos if none match.
 */
export function filterProductImagesByVariant(
  images: PublicProductImage[],
  variantId: string | null,
  hasVariants: boolean
): PublicProductImage[] {
  if (!hasVariants || images.length === 0) {
    return images;
  }

  const forSelection = images.filter(
    (image) => image.variant_id == null || image.variant_id === variantId
  );

  return forSelection.length > 0 ? forSelection : images;
}
