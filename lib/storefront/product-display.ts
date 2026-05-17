import type { ProductCategory } from "@/lib/admin/products";
import type { SublimationMode } from "@/lib/storefront/products";

/**
 * Display tweak: `11oz`, `11OZ`, `11 oz` → normalized `11 oz` (and keeps a trailing period outside the unit).
 * Does not change stored catalog names—use only for shopper-facing copy.
 */
export function formatShopperProductTitle(name: string): string {
  return name.replace(/\b(\d+)\s*(oz|OZ)(\.(?=\s|$))?/gi, (_match, digits: string, _oz: string, dot?: string) => {
    return `${digits} oz${dot ?? ""}`;
  });
}

export function formatStorefrontMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function formatStorefrontCategory(category: ProductCategory): string {
  if (category === "custom_sublimation") {
    return "Custom Sublimation";
  }
  return "Handmade Crochet/Knit";
}

export function formatStorefrontSublimationMode(mode: SublimationMode): string {
  if (mode === "customer_upload") {
    return "Custom photo upload";
  }
  return "Ready-made design";
}

export function formatStorefrontStockText(
  inventoryMode: "finite" | "made_to_order",
  isSoldOut: boolean,
  availableQuantity: number | null
): string {
  if (inventoryMode === "made_to_order") {
    return "Made to order";
  }
  if (isSoldOut) {
    return "Sold out";
  }
  return `${availableQuantity ?? 0} in stock`;
}

export function storefrontStockToneClass(
  inventoryMode: "finite" | "made_to_order",
  isSoldOut: boolean
): "is-made-to-order" | "is-sold-out" | "is-in-stock" {
  if (inventoryMode === "made_to_order") {
    return "is-made-to-order";
  }
  if (isSoldOut) {
    return "is-sold-out";
  }
  return "is-in-stock";
}
