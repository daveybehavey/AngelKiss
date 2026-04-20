import type { ProductCategory } from "@/lib/admin/products";
import type { SublimationMode } from "@/lib/storefront/products";

export function buildShopHref(options: {
  category?: ProductCategory | null;
  sublimationMode?: SublimationMode | null;
}): string {
  const search = new URLSearchParams();
  if (options.category) {
    search.set("category", options.category);
  }
  if (options.sublimationMode) {
    search.set("sublimation_mode", options.sublimationMode);
  }

  const query = search.toString();
  return query ? `/shop?${query}` : "/shop";
}
