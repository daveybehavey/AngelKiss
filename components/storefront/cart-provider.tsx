"use client";

import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  type CartItem,
  createCartItemId,
  clampCartQuantity,
  cartItemCount,
  cartSubtotalCents
} from "@/lib/storefront/cart";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  lastAddedAt: number;
  subtotalCents: number;
  currency: string;
  addItem: (
    item: Omit<CartItem, "quantity" | "cart_item_id">,
    quantity?: number,
    options?: { forceNewLine?: boolean }
  ) => void;
  setItemQuantity: (cartItemId: string, quantity: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`
  );
  return `{${entries.join(",")}}`;
}

function customizationSignature(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "{}";
  }
  return stableStringify(value);
}

function sanitizeParsedItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const result: CartItem[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const raw = entry as Partial<CartItem>;
    if (
      typeof raw.product_id !== "string" ||
      typeof raw.slug !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.category !== "string" ||
      typeof raw.unit_price_cents !== "number" ||
      typeof raw.currency !== "string" ||
      typeof raw.quantity !== "number"
    ) {
      continue;
    }

    const quantity = clampCartQuantity(raw.quantity);
    result.push({
      cart_item_id:
        typeof raw.cart_item_id === "string" && raw.cart_item_id.trim().length > 0
          ? raw.cart_item_id
          : createCartItemId(),
      product_id: raw.product_id,
      slug: raw.slug,
      name: raw.name,
      category: raw.category,
      unit_price_cents: raw.unit_price_cents,
      currency: raw.currency,
      quantity,
      image_url: typeof raw.image_url === "string" ? raw.image_url : null,
      image_alt: typeof raw.image_alt === "string" ? raw.image_alt : null,
      customization: raw.customization ?? {}
    });
  }

  return result;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [lastAddedAt, setLastAddedAt] = useState(0);

  useEffect(() => {
    try {
      const primaryRaw = window.localStorage.getItem(CART_STORAGE_KEY);
      const legacyRaw = primaryRaw
        ? null
        : window.localStorage.getItem(LEGACY_CART_STORAGE_KEY);
      const raw = primaryRaw ?? legacyRaw;
      if (!raw) {
        setHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const sanitized = sanitizeParsedItems(parsed);
      setItems(sanitized);
      if (!primaryRaw && legacyRaw) {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(sanitized));
        window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
      }
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  const addItem = useCallback(
    (
      item: Omit<CartItem, "quantity" | "cart_item_id">,
      quantity = 1,
      options?: { forceNewLine?: boolean }
    ) => {
      const safeQuantity = clampCartQuantity(quantity);

      setItems((current) => {
        const forceNewLine = options?.forceNewLine === true;
        const nextCustomizationSignature = customizationSignature(item.customization ?? {});
        const existing = forceNewLine
          ? null
          : current.find(
              (entry) =>
                entry.product_id === item.product_id &&
                customizationSignature(entry.customization ?? {}) ===
                  nextCustomizationSignature
            );
        if (!existing) {
          return [
            ...current,
            { ...item, cart_item_id: createCartItemId(), quantity: safeQuantity }
          ];
        }

        return current.map((entry) => {
          if (entry.cart_item_id !== existing.cart_item_id) {
            return entry;
          }

          return {
            ...entry,
            quantity: clampCartQuantity(entry.quantity + safeQuantity),
            unit_price_cents: item.unit_price_cents,
            currency: item.currency,
            image_url: item.image_url,
            image_alt: item.image_alt,
            customization: item.customization ?? {}
          };
        });
      });

      setLastAddedAt(Date.now());
    },
    []
  );

  const setItemQuantity = useCallback((cartItemId: string, quantity: number) => {
    const rounded = Math.round(quantity);
    if (rounded <= 0) {
      setItems((current) =>
        current.filter((entry) => entry.cart_item_id !== cartItemId)
      );
      return;
    }

    const safeQuantity = clampCartQuantity(rounded);
    setItems((current) =>
      current.map((entry) => {
        if (entry.cart_item_id !== cartItemId) {
          return entry;
        }
        return { ...entry, quantity: safeQuantity };
      })
    );
  }, []);

  const removeItem = useCallback((cartItemId: string) => {
    setItems((current) =>
      current.filter((entry) => entry.cart_item_id !== cartItemId)
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const itemCount = useMemo(() => cartItemCount(items), [items]);
  const subtotalCents = useMemo(() => cartSubtotalCents(items), [items]);
  const currency = items[0]?.currency ?? "CAD";

  const contextValue = useMemo(
    () => ({
      items,
      itemCount,
      lastAddedAt,
      subtotalCents,
      currency,
      addItem,
      setItemQuantity,
      removeItem,
      clearCart
    }),
    [
      items,
      itemCount,
      lastAddedAt,
      subtotalCents,
      currency,
      addItem,
      setItemQuantity,
      removeItem,
      clearCart
    ]
  );

  return (
    <CartContext.Provider
      value={contextValue}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
