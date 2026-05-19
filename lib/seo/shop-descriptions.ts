import type { ProductCategory } from "@/lib/admin/products";
import type { SublimationMode } from "@/lib/storefront/products";

/** Short descriptions for shop `generateMetadata` (filters + Open Graph). */
export const SHOP_DEFAULT_DESCRIPTION =
  "Browse handmade crochet, in-house print designs, and custom photo gifts from Vancouver Island.";

export const SHOP_SUBLIMATION_DESCRIPTION =
  "Custom prints on mugs, tumblers, bags, and more—your photo or our in-house designs.";

export const SHOP_HANDMADE_DESCRIPTION =
  "Limited-run crochet and knit pieces crafted with care.";

export const SHOP_UPLOAD_DESCRIPTION =
  "Upload your photo for mugs, tumblers, and other custom-print gifts.";

export const SHOP_READY_MADE_DESCRIPTION =
  "Ready-made in-house print designs, made to order.";

export function resolveShopPageSeo(
  category: ProductCategory | null,
  sublimationMode: SublimationMode | null
): { title: string; description: string } {
  if (sublimationMode === "customer_upload") {
    return { title: "Shop photo-upload custom prints", description: SHOP_UPLOAD_DESCRIPTION };
  }
  if (sublimationMode === "ready_made_design") {
    return { title: "Shop ready-made print designs", description: SHOP_READY_MADE_DESCRIPTION };
  }
  if (category === "custom_sublimation") {
    return { title: "Shop custom prints", description: SHOP_SUBLIMATION_DESCRIPTION };
  }
  if (category === "handmade_crochet_knit") {
    return { title: "Shop Crochet & Knit", description: SHOP_HANDMADE_DESCRIPTION };
  }
  return { title: "Shop", description: SHOP_DEFAULT_DESCRIPTION };
}
