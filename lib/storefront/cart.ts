import type { ProductCategory } from "@/lib/admin/products";

export const CART_STORAGE_KEY = "anglkisscreations_cart_v1";
export const LEGACY_CART_STORAGE_KEY = "angelkiss_cart_v1";
export const MIN_CART_QUANTITY = 1;
export const MAX_CART_QUANTITY = 99;

export type CartItem = {
  cart_item_id: string;
  product_id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  unit_price_cents: number;
  currency: string;
  quantity: number;
  image_url: string | null;
  image_alt: string | null;
  customization?: Record<string, unknown>;
};

export type CheckoutShippingAddress = {
  full_name: string;
  address_line1: string;
  address_line2: string;
  country_code: string;
  province_code: string;
  city: string;
  postal_code: string;
  phone: string;
};

export function createCartItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clampCartQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) {
    return MIN_CART_QUANTITY;
  }
  const rounded = Math.round(quantity);
  if (rounded < MIN_CART_QUANTITY) {
    return MIN_CART_QUANTITY;
  }
  if (rounded > MAX_CART_QUANTITY) {
    return MAX_CART_QUANTITY;
  }
  return rounded;
}

export function lineTotalCents(item: Pick<CartItem, "unit_price_cents" | "quantity">): number {
  return item.unit_price_cents * item.quantity;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
