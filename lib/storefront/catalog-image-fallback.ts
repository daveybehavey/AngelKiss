import type { ProductCategory } from "@/lib/admin/products";

/**
 * Local marketing images served from `public/marketing/…` when a product has no
 * primary image in Supabase yet. Replace `custom-print-mugs.jpg` on disk when
 * a tighter product shot is ready; uploaded `product_images` override these.
 */

const CUSTOM_PRINT_MUGS = {
  path: "/marketing/home-gallery/stand-05.jpg",
  alt: "Custom-printed mugs at the craft fair booth"
} as const;

const FROG_CROCHET_PRODUCT = {
  path: "/marketing/products/product-01.jpg",
  alt: "Crochet frog with a small plant in a cozy handmade setup"
} as const;

function isCustomMugListing(product: {
  slug: string;
  name: string;
  category: ProductCategory;
}): boolean {
  if (product.category !== "custom_sublimation") {
    return false;
  }
  return product.slug === "custom-photo-mug";
}

function isFrogListing(product: {
  slug: string;
  name: string;
  category: ProductCategory;
}): boolean {
  if (product.category !== "handmade_crochet_knit") {
    return false;
  }
  return /\bfrog\b/i.test(product.name.trim());
}

/**
 * Picks a local placeholder for known product shapes so you do not need to
 * copy the URL slug from admin.
 */
export function getLocalCatalogImageForProduct(product: {
  slug: string;
  name: string;
  category: ProductCategory;
}): { url: string; alt: string } | null {
  if (isCustomMugListing(product)) {
    return { url: CUSTOM_PRINT_MUGS.path, alt: CUSTOM_PRINT_MUGS.alt };
  }
  if (isFrogListing(product)) {
    return { url: FROG_CROCHET_PRODUCT.path, alt: FROG_CROCHET_PRODUCT.alt };
  }
  return null;
}
