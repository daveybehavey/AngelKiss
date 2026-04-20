"use client";

import {
  AdminToastStack,
  type AdminToast,
  type AdminToastKind
} from "@/components/admin/toast-stack";
import {
  normalizeCityInput,
  normalizeCountryCodeInput,
  normalizePostalCodeInput,
  normalizeProvinceCodeInput,
  validateShippingOriginInput,
  type ShippingOriginField,
  type ShippingOriginFieldErrors
} from "@/lib/admin/shipping-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProductCategory = "custom_sublimation" | "handmade_crochet_knit";
type ProductStatus = "draft" | "published" | "unpublished";
type InventoryMode = "finite" | "made_to_order";
type ProductViewFilter = "all" | "needs_attention" | "low_stock" | "sold_out" | "no_images" | "hidden";
type AdminView = "home" | "add" | "manage" | "shipping";
type ShippingZone = "local" | "regional" | "national" | "usa";

type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  base_price_cents: number;
  currency: string;
  inventory_mode: InventoryMode;
  stock_quantity: number | null;
  reserved_quantity: number;
  available_quantity: number | null;
  is_sold_out: boolean;
  is_low_stock: boolean;
  low_stock_threshold: number;
  is_available: boolean;
  status: ProductStatus;
  custom_sublimation_details: {
    allow_image_upload: boolean;
  } | null;
  created_at: string;
  updated_at: string;
};

type ProductsResponse = {
  items: ProductSummary[];
  nextCursor: string | null;
};

type ProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  signed_url: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

type ProductImagesResponse = {
  images: ProductImage[];
};

type UploadUrlResponse = {
  uploadUrl: string;
  storagePath: string;
  expiresAt: string;
  token?: string;
};

type ShippingSettingsResponse = {
  free_shipping_enabled: boolean;
  free_shipping_threshold_cents: number;
  origin: {
    country_code: string;
    province_code: string;
    city: string;
    postal_code: string;
  };
};

type ShippingRateRule = {
  id: string;
  zone: ShippingZone;
  shipping_cents: number;
  is_active: boolean;
  label: string;
  sort_order: number;
};

type ShippingRatesResponse = {
  rules: ShippingRateRule[];
};

type ShippingRateDraft = {
  id?: string;
  zone: ShippingZone;
  label: string;
  shippingDollars: string;
  isActive: boolean;
  sortOrder: number;
};

const supabase = getSupabaseBrowserClient();
const SHIPPING_ZONE_ORDER: ShippingZone[] = ["local", "regional", "national", "usa"];

const SHIPPING_ZONE_NAMES: Record<ShippingZone, string> = {
  local: "Local",
  regional: "Regional",
  national: "Across Canada",
  usa: "USA"
};

const DEFAULT_SHIPPING_ZONE_DOLLARS: Record<ShippingZone, string> = {
  local: "21.00",
  regional: "21.00",
  national: "31.00",
  usa: "27.00"
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dollarsToCents(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function dollarsToNonnegativeCents(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function centsToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

function formatCategory(category: ProductCategory): string {
  if (category === "custom_sublimation") {
    return "Custom Sublimation";
  }
  return "Handmade Crochet/Knit";
}

function formatInventoryMode(mode: InventoryMode): string {
  return mode === "finite" ? "Limited stock" : "Made to order";
}

function formatSublimationMode(allowImageUpload: boolean): string {
  return allowImageUpload ? "Upload your photo" : "Ready-made design";
}

function formatShippingZone(zone: ShippingZone): string {
  return SHIPPING_ZONE_NAMES[zone];
}

function defaultShippingRateDraft(zone: ShippingZone): ShippingRateDraft {
  return {
    zone,
    label: `${formatShippingZone(zone)} shipping`,
    shippingDollars: DEFAULT_SHIPPING_ZONE_DOLLARS[zone],
    isActive: true,
    sortOrder: (SHIPPING_ZONE_ORDER.indexOf(zone) + 1) * 10
  };
}

function toShippingRateDrafts(rules: ShippingRateRule[]): ShippingRateDraft[] {
  const byZone = new Map<ShippingZone, ShippingRateRule>(rules.map((rule) => [rule.zone, rule]));

  return SHIPPING_ZONE_ORDER.map((zone) => {
    const rule = byZone.get(zone);
    if (!rule) {
      return defaultShippingRateDraft(zone);
    }

    return {
      id: rule.id,
      zone: rule.zone,
      label: rule.label,
      shippingDollars: centsToDollars(rule.shipping_cents),
      isActive: rule.is_active,
      sortOrder: rule.sort_order
    };
  });
}

function defaultTrackStockForCategory(category: ProductCategory): boolean {
  return category === "handmade_crochet_knit";
}

function confirmDestructiveAction(
  confirmWord: "UNPUBLISH" | "DELETE",
  itemName: string
): boolean {
  const typed = window.prompt(
    `Type ${confirmWord} to continue for "${itemName}".`
  );
  return (typed ?? "").trim().toUpperCase() === confirmWord;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [priceDraftByProduct, setPriceDraftByProduct] = useState<Record<string, string>>({});
  const [stockDraftByProduct, setStockDraftByProduct] = useState<Record<string, string>>({});
  const [imagesByProduct, setImagesByProduct] = useState<Record<string, ProductImage[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [uploadAsPrimary, setUploadAsPrimary] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("handmade_crochet_knit");
  const [priceDollars, setPriceDollars] = useState("10.00");
  const [trackStock, setTrackStock] = useState(true);
  const [stockQuantity, setStockQuantity] = useState("1");
  const [allowCustomerUpload, setAllowCustomerUpload] = useState(true);
  const [material, setMaterial] = useState("Cotton yarn");
  const [createBusy, setCreateBusy] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productViewFilter, setProductViewFilter] = useState<ProductViewFilter>("all");
  const [adminView, setAdminView] = useState<AdminView>("home");
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [savingShippingSettings, setSavingShippingSettings] = useState(false);
  const [savingShippingRates, setSavingShippingRates] = useState(false);
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(true);
  const [freeShippingThresholdDollars, setFreeShippingThresholdDollars] = useState("100.00");
  const [shippingOriginCountryCode, setShippingOriginCountryCode] = useState("CA");
  const [shippingOriginProvinceCode, setShippingOriginProvinceCode] = useState("BC");
  const [shippingOriginCity, setShippingOriginCity] = useState("Sooke");
  const [shippingOriginPostalCode, setShippingOriginPostalCode] = useState("V9Z 0V1");
  const [shippingOriginErrors, setShippingOriginErrors] = useState<ShippingOriginFieldErrors>({});
  const [shippingRateDrafts, setShippingRateDrafts] = useState<ShippingRateDraft[]>(
    SHIPPING_ZONE_ORDER.map((zone) => defaultShippingRateDraft(zone))
  );

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const nextToastId = useRef(1);

  const [newsletterItems, setNewsletterItems] = useState<
    Array<{ email: string; created_at: string; source: string }>
  >([]);
  const [newsletterBusy, setNewsletterBusy] = useState(false);

  const pushToast = useCallback((kind: AdminToastKind, text: string) => {
    const toast: AdminToast = {
      id: nextToastId.current++,
      kind,
      message: text
    };
    setToasts((current) => [...current, toast]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  async function callAdmin(path: string, init?: RequestInit): Promise<unknown> {
    if (!token) {
      throw new Error("Not logged in");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, {
      ...init,
      headers
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new Error((json.error as string | undefined) ?? `Request failed (${response.status})`);
    }

    return json;
  }

  async function loadImagesForProduct(productId: string): Promise<ProductImage[]> {
    const response = (await callAdmin(`/api/admin/products/${productId}/images`)) as ProductImagesResponse;
    return response.images ?? [];
  }

  async function refreshImagesForProduct(productId: string) {
    const images = await loadImagesForProduct(productId);
    setImagesByProduct((current) => ({
      ...current,
      [productId]: images
    }));
  }

  function applyShippingSettings(settings: ShippingSettingsResponse) {
    setFreeShippingEnabled(settings.free_shipping_enabled);
    setFreeShippingThresholdDollars(centsToDollars(settings.free_shipping_threshold_cents));
    setShippingOriginCountryCode(settings.origin.country_code);
    setShippingOriginProvinceCode(settings.origin.province_code);
    setShippingOriginCity(settings.origin.city);
    setShippingOriginPostalCode(settings.origin.postal_code);
    setShippingOriginErrors({});
  }

  function applyShippingRates(response: ShippingRatesResponse) {
    setShippingRateDrafts(toShippingRateDrafts(response.rules ?? []));
  }

  async function loadShippingConfiguration() {
    if (!token) {
      setFreeShippingEnabled(true);
      setFreeShippingThresholdDollars("100.00");
      setShippingOriginCountryCode("CA");
      setShippingOriginProvinceCode("BC");
      setShippingOriginCity("Sooke");
      setShippingOriginPostalCode("V9Z 0V1");
      setShippingRateDrafts(SHIPPING_ZONE_ORDER.map((zone) => defaultShippingRateDraft(zone)));
      return;
    }

    setLoadingShipping(true);
    setError(null);

    try {
      const [settingsResponse, ratesResponse] = await Promise.all([
        callAdmin("/api/admin/settings/shipping"),
        callAdmin("/api/admin/settings/shipping/rates")
      ]);

      applyShippingSettings(settingsResponse as ShippingSettingsResponse);
      applyShippingRates(ratesResponse as ShippingRatesResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load shipping settings");
    } finally {
      setLoadingShipping(false);
    }
  }

  async function loadProducts() {
    if (!token) {
      setProducts([]);
      setImagesByProduct({});
      return;
    }

    setLoadingProducts(true);
    setError(null);

    try {
      const result = (await callAdmin("/api/admin/products?limit=100")) as ProductsResponse;
      const items = result.items ?? [];
      setProducts(items);
      setPriceDraftByProduct(
        Object.fromEntries(items.map((item) => [item.id, (item.base_price_cents / 100).toFixed(2)]))
      );
      setStockDraftByProduct(
        Object.fromEntries(items.map((item) => [item.id, item.inventory_mode === "finite" ? String(item.stock_quantity ?? 0) : ""]))
      );

      const imageEntries = await Promise.all(
        items.map(async (item) => {
          try {
            const images = await loadImagesForProduct(item.id);
            return [item.id, images] as const;
          } catch {
            return [item.id, []] as const;
          }
        })
      );

      setImagesByProduct(Object.fromEntries(imageEntries));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }
      setToken(data.session?.access_token ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadShippingConfiguration();
    if (!token) {
      setNewsletterItems([]);
      return;
    }

    let cancelled = false;
    setNewsletterBusy(true);
    void (async () => {
      try {
        const headers = new Headers();
        headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch("/api/admin/newsletter/subscribers?limit=500", { headers });
        const json = (await response.json().catch(() => ({}))) as {
          items?: Array<{ email: string; created_at: string; source: string }>;
        };
        if (!cancelled && response.ok && Array.isArray(json.items)) {
          setNewsletterItems(json.items);
        }
      } finally {
        if (!cancelled) {
          setNewsletterBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!error) {
      return;
    }
    pushToast("error", error);
    setError(null);
  }, [error, pushToast]);

  useEffect(() => {
    if (!message) {
      return;
    }
    pushToast("success", message);
    setMessage(null);
  }, [message, pushToast]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError(null);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        throw signInError;
      }

      setMessage("Signed in.");
      setPassword("");
      setAdminView("home");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Failed to sign in");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setMessage(null);
    await supabase.auth.signOut();
    setProducts([]);
    setAdminView("home");
    setMessage("Signed out.");
  }

  async function handleCopyNewsletterEmails() {
    if (newsletterItems.length === 0) {
      pushToast("error", "No subscribers on the list yet.");
      return;
    }
    const text = newsletterItems.map((row) => row.email).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      pushToast("success", `Copied ${newsletterItems.length} email addresses.`);
    } catch {
      pushToast("error", "Could not copy automatically. Try selecting the list manually.");
    }
  }

  function handleDownloadNewsletterCsv() {
    if (newsletterItems.length === 0) {
      pushToast("error", "No subscribers on the list yet.");
      return;
    }

    const header = ["email", "source", "created_at"].join(",");
    const rows = newsletterItems.map((row) => {
      const email = JSON.stringify(row.email ?? "");
      const source = JSON.stringify(row.source ?? "");
      const createdAt = JSON.stringify(row.created_at ?? "");
      return [email, source, createdAt].join(",");
    });
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `angelkiss-newsletter-subscribers-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    pushToast("success", "Downloaded CSV.");
  }

  function updateShippingRateDraft(
    zone: ShippingZone,
    patch: Partial<Pick<ShippingRateDraft, "label" | "shippingDollars" | "isActive">>
  ) {
    setShippingRateDrafts((current) =>
      current.map((rule) => (rule.zone === zone ? { ...rule, ...patch } : rule))
    );
  }

  function clearShippingOriginError(field: ShippingOriginField) {
    setShippingOriginErrors((current) => {
      if (!current[field]) {
        return current;
      }
      return {
        ...current,
        [field]: undefined
      };
    });
  }

  async function handleSaveShippingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingShippingSettings(true);
    setError(null);
    setMessage(null);

    try {
      const thresholdCents = dollarsToNonnegativeCents(freeShippingThresholdDollars);
      if (thresholdCents === null) {
        throw new Error("Free shipping threshold must be 0 or more.");
      }

      const originValidation = validateShippingOriginInput({
        country_code: shippingOriginCountryCode,
        province_code: shippingOriginProvinceCode,
        city: shippingOriginCity,
        postal_code: shippingOriginPostalCode
      });

      if (!originValidation.ok) {
        setShippingOriginErrors(originValidation.errors);
        throw new Error("Please fix the highlighted shipping origin fields.");
      }

      setShippingOriginErrors({});
      const { country_code, province_code, city, postal_code } = originValidation.normalized;
      setShippingOriginCountryCode(country_code);
      setShippingOriginProvinceCode(province_code);
      setShippingOriginCity(city);
      setShippingOriginPostalCode(postal_code);

      const response = (await callAdmin("/api/admin/settings/shipping", {
        method: "PATCH",
        body: JSON.stringify({
          free_shipping_enabled: freeShippingEnabled,
          free_shipping_threshold_cents: thresholdCents,
          origin: {
            country_code,
            province_code,
            city,
            postal_code
          }
        })
      })) as ShippingSettingsResponse;

      applyShippingSettings(response);
      setMessage("Shipping settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save shipping settings");
    } finally {
      setSavingShippingSettings(false);
    }
  }

  async function handleSaveShippingRates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingShippingRates(true);
    setError(null);
    setMessage(null);

    try {
      const rulesPayload = shippingRateDrafts.map((rule) => {
        const cents = dollarsToNonnegativeCents(rule.shippingDollars);
        if (cents === null) {
          throw new Error(`${formatShippingZone(rule.zone)} shipping price must be 0 or more.`);
        }

        return {
          ...(rule.id ? { id: rule.id } : {}),
          zone: rule.zone,
          shipping_cents: cents,
          is_active: rule.isActive,
          label: rule.label.trim() || `${formatShippingZone(rule.zone)} shipping`,
          sort_order: rule.sortOrder
        };
      });

      const response = (await callAdmin("/api/admin/settings/shipping/rates", {
        method: "PATCH",
        body: JSON.stringify({ rules: rulesPayload })
      })) as ShippingRatesResponse;

      applyShippingRates(response);
      setMessage("Shipping rates saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save shipping rates");
    } finally {
      setSavingShippingRates(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBusy(true);
    setError(null);
    setMessage(null);

    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Name is required");
      }

      const finalSlug = slugify(trimmedName);
      if (!finalSlug) {
        throw new Error("Slug is required");
      }

      const basePriceCents = dollarsToCents(priceDollars);
      if (!basePriceCents) {
        throw new Error("Price must be greater than 0");
      }

      const inventoryMode: InventoryMode = trackStock ? "finite" : "made_to_order";

      const payload: Record<string, unknown> = {
        name: trimmedName,
        slug: finalSlug,
        category,
        base_price_cents: basePriceCents,
        currency: "USD",
        inventory_mode: inventoryMode,
        is_available: true,
        status: "draft",
        low_stock_threshold: 2
      };

      if (inventoryMode === "finite") {
        const parsedStock = Number(stockQuantity);
        if (!Number.isInteger(parsedStock) || parsedStock < 0) {
          throw new Error("Stock must be a non-negative integer");
        }
        payload.stock_quantity = parsedStock;
      }

      if (category === "custom_sublimation") {
        payload.custom_sublimation_details = {
          template_image_path: `templates/${finalSlug}.png`,
          default_blank_color: "white",
          safe_area_x: 0,
          safe_area_y: 0,
          safe_area_width: 2000,
          safe_area_height: 2000,
          max_upload_mb: 20,
          allow_image_upload: allowCustomerUpload,
          allow_text_overlay: allowCustomerUpload,
          max_text_layers: allowCustomerUpload ? 3 : 0,
          allowed_fonts: ["Arial", "Montserrat", "Playfair Display"]
        };
      } else {
        payload.handmade_details = {
          material: material.trim() || "Cotton yarn",
          care_instructions: null,
          lead_time_days: 7,
          personalization_available: false
        };
      }

      await callAdmin("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setMessage("Product added.");
      setName("");
      setStockQuantity("1");
      setTrackStock(defaultTrackStockForCategory(category));
      setAllowCustomerUpload(true);
      await loadProducts();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create product");
    } finally {
      setCreateBusy(false);
    }
  }

  async function updateProductStatus(product: ProductSummary, nextStatus: "publish" | "unpublish") {
    if (nextStatus === "unpublish") {
      const confirmed = confirmDestructiveAction("UNPUBLISH", product.name);
      if (!confirmed) {
        setMessage("Unpublish cancelled.");
        return;
      }
    }

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}/${nextStatus}`, {
        method: "POST"
      });
      setMessage(`Product ${nextStatus === "publish" ? "published" : "unpublished"}.`);
      await loadProducts();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update status");
    } finally {
      setBusyProductId(null);
    }
  }

  async function toggleAvailability(product: ProductSummary) {
    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !product.is_available })
      });
      setMessage(`Availability updated.`);
      await loadProducts();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update availability");
    } finally {
      setBusyProductId(null);
    }
  }

  async function toggleSublimationMode(product: ProductSummary) {
    if (product.category !== "custom_sublimation") {
      return;
    }

    const currentMode = product.custom_sublimation_details?.allow_image_upload;
    if (typeof currentMode !== "boolean") {
      setError("This sublimation item is missing customization settings.");
      return;
    }

    const nextMode = !currentMode;

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          custom_sublimation_details: {
            allow_image_upload: nextMode,
            allow_text_overlay: nextMode,
            max_text_layers: nextMode ? 3 : 0
          }
        })
      });

      setMessage(
        nextMode
          ? "Sublimation mode updated: customer image upload is required."
          : "Sublimation mode updated: ready-made design (no customer upload)."
      );
      await loadProducts();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update sublimation mode"
      );
    } finally {
      setBusyProductId(null);
    }
  }

  async function updatePrice(product: ProductSummary) {
    const draft = priceDraftByProduct[product.id]?.trim() ?? "";
    const cents = dollarsToCents(draft);
    if (!cents) {
      setError("Price must be greater than 0");
      return;
    }

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ base_price_cents: cents })
      });
      setMessage("Price updated.");
      await loadProducts();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update price");
    } finally {
      setBusyProductId(null);
    }
  }

  async function applyStockChange(product: ProductSummary, delta: number, reason: "restock" | "manual_adjustment") {
    if (product.inventory_mode !== "finite") {
      return;
    }

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}/inventory/adjust`, {
        method: "POST",
        body: JSON.stringify({
          delta,
          reason
        })
      });
      setMessage("Stock updated.");
      await loadProducts();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to adjust stock");
    } finally {
      setBusyProductId(null);
    }
  }

  async function addOneStock(product: ProductSummary) {
    await applyStockChange(product, 1, "restock");
  }

  async function removeOneStock(product: ProductSummary) {
    await applyStockChange(product, -1, "manual_adjustment");
  }

  async function saveStockLevel(product: ProductSummary) {
    if (product.inventory_mode !== "finite") {
      return;
    }

    const stockInput = stockDraftByProduct[product.id]?.trim() ?? "";
    if (!stockInput) {
      setError("Enter a stock value");
      return;
    }

    const nextStock = Number(stockInput);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      setError("Stock must be a non-negative integer");
      return;
    }

    const currentStock = product.stock_quantity ?? 0;
    const delta = nextStock - currentStock;
    if (delta === 0) {
      setError(null);
      setMessage("Stock already set.");
      return;
    }

    const reason: "restock" | "manual_adjustment" = delta > 0 ? "restock" : "manual_adjustment";
    await applyStockChange(product, delta, reason);
  }

  async function deleteProduct(product: ProductSummary) {
    const confirmed = confirmDestructiveAction("DELETE", product.name);
    if (!confirmed) {
      setMessage("Delete cancelled.");
      return;
    }

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${product.id}`, {
        method: "DELETE"
      });
      setMessage("Product deleted.");
      await loadProducts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete product");
    } finally {
      setBusyProductId(null);
    }
  }

  function setSelectedFile(productId: string, file: File | null) {
    setSelectedFiles((current) => ({
      ...current,
      [productId]: file
    }));
  }

  function setUploadPrimaryFlag(productId: string, value: boolean) {
    setUploadAsPrimary((current) => ({
      ...current,
      [productId]: value
    }));
  }

  async function uploadProductImage(product: ProductSummary) {
    const file = selectedFiles[product.id];
    if (!file) {
      setError("Choose an image file first.");
      return;
    }

    setBusyProductId(product.id);
    setError(null);
    setMessage(null);

    try {
      const uploadInfo = (await callAdmin(`/api/admin/products/${product.id}/images/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "application/octet-stream"
        })
      })) as UploadUrlResponse;

      const uploadResponse = await fetch(uploadInfo.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(`Image upload failed (${uploadResponse.status})`);
      }

      await callAdmin(`/api/admin/products/${product.id}/images`, {
        method: "POST",
        body: JSON.stringify({
          storage_path: uploadInfo.storagePath,
          is_primary: uploadAsPrimary[product.id] ?? false
        })
      });

      setSelectedFile(product.id, null);
      setUploadPrimaryFlag(product.id, false);
      setMessage("Image uploaded.");
      await refreshImagesForProduct(product.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload image");
    } finally {
      setBusyProductId(null);
    }
  }

  async function makeImagePrimary(productId: string, imageId: string) {
    setBusyProductId(productId);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${productId}/images/${imageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_primary: true
        })
      });

      setMessage("Primary image updated.");
      await refreshImagesForProduct(productId);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update image");
    } finally {
      setBusyProductId(null);
    }
  }

  async function deleteImage(productId: string, image: ProductImage) {
    const imageLabel = image.storage_path.split("/").pop() ?? image.id;
    const confirmed = confirmDestructiveAction("DELETE", imageLabel);
    if (!confirmed) {
      setMessage("Delete cancelled.");
      return;
    }

    setBusyProductId(productId);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/products/${productId}/images/${image.id}`, {
        method: "DELETE"
      });
      setMessage("Image deleted.");
      await refreshImagesForProduct(productId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete image");
    } finally {
      setBusyProductId(null);
    }
  }

  const productCounts = useMemo(() => {
    let lowStock = 0;
    let soldOut = 0;
    let noImages = 0;
    let hidden = 0;
    let needsAttention = 0;

    for (const product of products) {
      const imageCount = imagesByProduct[product.id]?.length ?? 0;
      const isLowStock = product.inventory_mode === "finite" && product.is_low_stock;
      const isSoldOut = product.inventory_mode === "finite" && product.is_sold_out;
      const isHidden = product.status !== "published" || !product.is_available;
      const isNoImages = imageCount === 0;
      const isNeedsAttention = isLowStock || isSoldOut || isNoImages;

      if (isLowStock) {
        lowStock += 1;
      }
      if (isSoldOut) {
        soldOut += 1;
      }
      if (isNoImages) {
        noImages += 1;
      }
      if (isHidden) {
        hidden += 1;
      }
      if (isNeedsAttention) {
        needsAttention += 1;
      }
    }

    return {
      total: products.length,
      lowStock,
      soldOut,
      noImages,
      hidden,
      needsAttention
    };
  }, [imagesByProduct, products]);

  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const imageCount = imagesByProduct[product.id]?.length ?? 0;
      const isLowStock = product.inventory_mode === "finite" && product.is_low_stock;
      const isSoldOut = product.inventory_mode === "finite" && product.is_sold_out;
      const isNoImages = imageCount === 0;
      const isHidden = product.status !== "published" || !product.is_available;
      const isNeedsAttention = isLowStock || isSoldOut || isNoImages;

      if (productViewFilter === "needs_attention" && !isNeedsAttention) {
        return false;
      }

      if (productViewFilter === "low_stock" && !isLowStock) {
        return false;
      }

      if (productViewFilter === "sold_out" && !isSoldOut) {
        return false;
      }

      if (productViewFilter === "no_images" && !isNoImages) {
        return false;
      }

      if (productViewFilter === "hidden" && !isHidden) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        product.name.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query)
      );
    });
  }, [imagesByProduct, productSearch, productViewFilter, products]);

  return (
    <main className="page-main admin-page">
      <h1>Store dashboard</h1>
      <p className="admin-lead">Add products, fix stock, check orders — one calm screen at a time.</p>
      <p className="admin-subtle">Choose a task below. You can always come back to Home.</p>

      <section className="sectionCard sectionCardMuted">
        <h2>At a glance</h2>
        <p className="admin-note-tight">A quick snapshot of your catalog. Tap a tab when you are ready.</p>
        <div className="admin-orders-stats" role="status" aria-label="Store summary">
          <p className="admin-orders-stat">
            <strong>{productCounts.total}</strong>
            <span>Total items</span>
          </p>
          <p className="admin-orders-stat">
            <strong>{productCounts.needsAttention}</strong>
            <span>Needs review</span>
          </p>
          <p className="admin-orders-stat">
            <strong>{productCounts.lowStock}</strong>
            <span>Low stock</span>
          </p>
        </div>
        {token ? (
          <div className="admin-mode-toggle-row" aria-label="Admin section picker">
            <button
              type="button"
              className={`admin-mode-toggle ${adminView === "home" ? "is-active" : ""}`}
              onClick={() => setAdminView("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={`admin-mode-toggle ${adminView === "add" ? "is-active" : ""}`}
              onClick={() => setAdminView("add")}
            >
              New product
            </button>
            <button
              type="button"
              className={`admin-mode-toggle ${adminView === "manage" ? "is-active" : ""}`}
              onClick={() => setAdminView("manage")}
            >
              Edit products
            </button>
            <button
              type="button"
              className={`admin-mode-toggle ${adminView === "shipping" ? "is-active" : ""}`}
              onClick={() => setAdminView("shipping")}
            >
              Shipping
            </button>
            <a href="/admin/orders" className="toolbarLink">
              Orders
            </a>
          </div>
        ) : (
          <p className="admin-note-tight">Log in to access product and order tools.</p>
        )}
        <p className="admin-note-tight">
          <strong>Orders</strong> live on a separate page — use the Orders tab or link above.
        </p>
      </section>

      <AdminToastStack toasts={toasts} onDismiss={dismissToast} />

      {!token ? (
        <section className="sectionCard">
          <h2>Sign In</h2>
          <form onSubmit={handleSignIn} className="formGrid authForm">
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={authBusy}>
                {authBusy ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="admin-subtle">
            Use the admin email and password for this shop.
          </p>
        </section>
      ) : (
        <>
          <section className="sectionCard admin-sticky-tools">
            <div className="toolbar">
              <button type="button" onClick={handleSignOut}>
                Sign out
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadProducts();
                  void loadShippingConfiguration();
                  if (token) {
                    setNewsletterBusy(true);
                    void (async () => {
                      try {
                        const headers = new Headers();
                        headers.set("Authorization", `Bearer ${token}`);
                        const response = await fetch(
                          "/api/admin/newsletter/subscribers?limit=500",
                          { headers }
                        );
                        const json = (await response.json().catch(() => ({}))) as {
                          items?: Array<{ email: string; created_at: string; source: string }>;
                        };
                        if (response.ok && Array.isArray(json.items)) {
                          setNewsletterItems(json.items);
                        }
                      } finally {
                        setNewsletterBusy(false);
                      }
                    })();
                  }
                }}
                disabled={loadingProducts || loadingShipping}
              >
                {loadingProducts || loadingShipping ? "Refreshing..." : "Refresh"}
              </button>
              <a href="/admin/orders" className="toolbarLink">
                Orders
              </a>
            </div>
            <div className="admin-mode-toggle-row">
              <button
                type="button"
                className={`admin-mode-toggle ${adminView === "home" ? "is-active" : ""}`}
                onClick={() => setAdminView("home")}
              >
                Home
              </button>
              <button
                type="button"
                className={`admin-mode-toggle ${adminView === "add" ? "is-active" : ""}`}
                onClick={() => setAdminView("add")}
              >
                New product
              </button>
              <button
                type="button"
                className={`admin-mode-toggle ${adminView === "manage" ? "is-active" : ""}`}
                onClick={() => setAdminView("manage")}
              >
                Edit products
              </button>
              <button
                type="button"
                className={`admin-mode-toggle ${adminView === "shipping" ? "is-active" : ""}`}
                onClick={() => setAdminView("shipping")}
              >
                Shipping
              </button>
            </div>
          </section>

          {adminView === "home" ? (
            <>
              <section className="sectionCard admin-home-hero">
                <h2>What do you want to do?</h2>
                <p className="admin-note">Large buttons, small decisions — tap one.</p>
                <p className="admin-subtle admin-home-analytics-status">
                  Analytics:{" "}
                  <strong>
                    {process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim() ? "On" : "Off"}
                  </strong>{" "}
                  <span className="admin-subtle">
                    (Cloudflare Web Analytics)
                  </span>
                </p>
                <ul className="admin-setup-checklist" aria-label="Setup checklist">
                  <li
                    className={`admin-setup-item ${
                      process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim()
                        ? "is-ok"
                        : "is-warn"
                    }`}
                  >
                    <strong>Analytics</strong>
                    <span>
                      {process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim()
                        ? "On"
                        : "Off (optional)"}
                    </span>
                  </li>
                  <li
                    className={`admin-setup-item ${
                      process.env.PAYPAL_WEBHOOK_ID?.trim() ? "is-ok" : "is-warn"
                    }`}
                  >
                    <strong>PayPal webhook verification</strong>
                    <span>
                      {process.env.PAYPAL_WEBHOOK_ID?.trim()
                        ? "On"
                        : "Off (set PAYPAL_WEBHOOK_ID in production)"}
                    </span>
                  </li>
                  <li
                    className={`admin-setup-item ${
                      newsletterBusy
                        ? "is-warn"
                        : newsletterItems.length > 0
                          ? "is-ok"
                          : "is-warn"
                    }`}
                  >
                    <strong>Email list</strong>
                    <span>
                      {newsletterBusy
                        ? "Loading…"
                        : newsletterItems.length > 0
                          ? "Collecting"
                          : "No signups yet (ok)"}
                    </span>
                  </li>
                  <li className="admin-setup-item is-ok">
                    <strong>Shipping</strong>
                    <span>Configured in this admin</span>
                  </li>
                </ul>
                <div className="actionGrid admin-hub-grid">
                  <button
                    type="button"
                    className="admin-primary-action admin-hub-action"
                    onClick={() => setAdminView("add")}
                  >
                    New product
                  </button>
                  <button type="button" className="admin-hub-action" onClick={() => setAdminView("manage")}>
                    Edit products (price, photos, stock)
                  </button>
                  <button type="button" className="admin-hub-action" onClick={() => setAdminView("shipping")}>
                    Shipping rates
                  </button>
                  <a href="/admin/orders" className="toolbarLink admin-hub-action">
                    Orders
                  </a>
                </div>
              </section>

              <section className="sectionCard admin-newsletter-panel">
                <h2>Email list (restocks &amp; news)</h2>
                <p className="admin-note-tight">
                  Shoppers can join from your website footer. Copy the list into Mailchimp, Flodesk,
                  Kit, or any tool you like for newsletters.
                </p>
                <p className="admin-orders-stat admin-newsletter-stat">
                  <strong>{newsletterBusy ? "…" : newsletterItems.length}</strong>
                  <span>subscribers {newsletterBusy ? "(loading)" : "(showing up to 500)"}</span>
                </p>
                <div className="actionGrid actionGridTight">
                  <button
                    type="button"
                    onClick={() => handleDownloadNewsletterCsv()}
                    disabled={newsletterBusy || newsletterItems.length === 0}
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyNewsletterEmails()}
                    disabled={newsletterBusy || newsletterItems.length === 0}
                  >
                    Copy all emails
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {adminView === "add" ? (
            <section className="sectionCard" id="add-item">
            <h2>New product</h2>
            <p className="admin-note">
              Start with name and price — you can add photos and publish in the next step.
            </p>
            <form onSubmit={handleCreateProduct} className="formGrid createForm">
              <label>
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Category
                <select
                  value={category}
                  onChange={(event) => {
                    const nextCategory = event.target.value as ProductCategory;
                    setCategory(nextCategory);
                    setTrackStock(defaultTrackStockForCategory(nextCategory));
                  }}
                >
                  <option value="handmade_crochet_knit">Handmade Crochet/Knit</option>
                  <option value="custom_sublimation">Custom Sublimation</option>
                </select>
              </label>
              <label>
                Price (USD)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="24.99"
                  value={priceDollars}
                  onChange={(event) => setPriceDollars(event.target.value)}
                  required
                />
              </label>
              <label className="inlineToggle">
                <input
                  type="checkbox"
                  checked={trackStock}
                  onChange={(event) => setTrackStock(event.target.checked)}
                />
                Track stock
              </label>
              <p className="admin-note-tight">
                {category === "handmade_crochet_knit"
                  ? "Recommended for crochet/knit items with limited quantity."
                  : "Usually off for custom sublimation items made to order."}
              </p>

              {category === "custom_sublimation" ? (
                <>
                  <label className="inlineToggle">
                    <input
                      type="checkbox"
                      checked={allowCustomerUpload}
                      onChange={(event) => setAllowCustomerUpload(event.target.checked)}
                    />
                    Customer uploads photo
                  </label>
                  <p className="admin-note-tight">
                    {allowCustomerUpload
                      ? "On: customer uploads a photo for this product."
                      : "Off: this is your ready-made design, made to order."}
                  </p>
                </>
              ) : null}

              {trackStock ? (
                <label>
                  Starting stock quantity
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={stockQuantity}
                    onChange={(event) => setStockQuantity(event.target.value)}
                    required
                  />
                </label>
              ) : null}

              <details className="admin-details">
                <summary className="admin-details-summary">Optional details</summary>
                {category === "handmade_crochet_knit" ? (
                  <label className="admin-label-spaced">
                    Material (optional)
                    <input value={material} onChange={(event) => setMaterial(event.target.value)} />
                  </label>
                ) : (
                  <p className="admin-note-spaced">
                    No extra details needed for quick setup.
                  </p>
                )}
              </details>

              <button type="submit" disabled={createBusy}>
                {createBusy ? "Creating..." : "Create item"}
              </button>
            </form>
            </section>
          ) : null}

          {adminView === "shipping" ? (
            <section className="sectionCard" id="shipping-settings">
              <h2>Shipping Settings</h2>
              <p className="admin-note">
                Keep this simple: where you ship from, when free shipping starts, and the 4 zone
                prices.
              </p>
              {loadingShipping ? (
                <p className="admin-note-tight">Loading shipping settings...</p>
              ) : null}

              <form onSubmit={handleSaveShippingSettings} className="formGrid">
                <label className="inlineToggle">
                  <input
                    type="checkbox"
                    checked={freeShippingEnabled}
                    onChange={(event) => setFreeShippingEnabled(event.target.checked)}
                  />
                  Free shipping enabled
                </label>
                <label>
                  Free shipping threshold (USD)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={freeShippingThresholdDollars}
                    onChange={(event) => setFreeShippingThresholdDollars(event.target.value)}
                    required
                  />
                </label>

                <div className="admin-shipping-grid">
                  <label>
                    Origin country code
                    <input
                      value={shippingOriginCountryCode}
                      onChange={(event) => {
                        setShippingOriginCountryCode(
                          normalizeCountryCodeInput(event.target.value)
                        );
                        clearShippingOriginError("country_code");
                      }}
                      onBlur={(event) => {
                        const normalizedCountry = normalizeCountryCodeInput(event.target.value);
                        setShippingOriginCountryCode(normalizedCountry);
                        setShippingOriginPostalCode((current) =>
                          normalizePostalCodeInput(normalizedCountry, current)
                        );
                      }}
                      maxLength={2}
                      autoCapitalize="characters"
                      required
                    />
                    <span className="admin-field-hint">Use CA or US.</span>
                    {shippingOriginErrors.country_code ? (
                      <span className="admin-field-error">{shippingOriginErrors.country_code}</span>
                    ) : null}
                  </label>
                  <label>
                    Origin province/state
                    <input
                      value={shippingOriginProvinceCode}
                      onChange={(event) => {
                        setShippingOriginProvinceCode(
                          normalizeProvinceCodeInput(event.target.value)
                        );
                        clearShippingOriginError("province_code");
                      }}
                      onBlur={(event) =>
                        setShippingOriginProvinceCode(
                          normalizeProvinceCodeInput(event.target.value)
                        )
                      }
                      maxLength={32}
                      autoCapitalize="characters"
                      required
                    />
                    {shippingOriginErrors.province_code ? (
                      <span className="admin-field-error">{shippingOriginErrors.province_code}</span>
                    ) : null}
                  </label>
                  <label>
                    Origin city
                    <input
                      value={shippingOriginCity}
                      onChange={(event) => {
                        setShippingOriginCity(event.target.value);
                        clearShippingOriginError("city");
                      }}
                      onBlur={(event) =>
                        setShippingOriginCity(normalizeCityInput(event.target.value))
                      }
                      maxLength={120}
                      required
                    />
                    {shippingOriginErrors.city ? (
                      <span className="admin-field-error">{shippingOriginErrors.city}</span>
                    ) : null}
                  </label>
                  <label>
                    Origin postal code
                    <input
                      value={shippingOriginPostalCode}
                      onChange={(event) => {
                        setShippingOriginPostalCode(
                          normalizePostalCodeInput(shippingOriginCountryCode, event.target.value)
                        );
                        clearShippingOriginError("postal_code");
                      }}
                      onBlur={(event) =>
                        setShippingOriginPostalCode(
                          normalizePostalCodeInput(shippingOriginCountryCode, event.target.value)
                        )
                      }
                      maxLength={32}
                      required
                    />
                    {shippingOriginErrors.postal_code ? (
                      <span className="admin-field-error">{shippingOriginErrors.postal_code}</span>
                    ) : null}
                  </label>
                </div>

                <div className="toolbar">
                  <button type="submit" disabled={savingShippingSettings || loadingShipping}>
                    {savingShippingSettings ? "Saving..." : "Save shipping settings"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadShippingConfiguration()}
                    disabled={loadingShipping || savingShippingSettings || savingShippingRates}
                  >
                    {loadingShipping ? "Refreshing..." : "Refresh shipping"}
                  </button>
                </div>
              </form>

              <div className="admin-divider-block">
                <p className="admin-item-line">
                  <strong>Zone rates (USD)</strong>
                </p>
                <p className="admin-note-tight">
                  Set 0 if you want free shipping for a zone.
                </p>

                <form onSubmit={handleSaveShippingRates} className="formGrid">
                  <ul className="admin-card-list">
                    {shippingRateDrafts.map((rate) => (
                      <li key={rate.zone} className="itemCard">
                        <p className="admin-item-line">
                          <strong>{formatShippingZone(rate.zone)}</strong>
                        </p>
                        <div className="admin-shipping-grid">
                          <label>
                            Label
                            <input
                              value={rate.label}
                              onChange={(event) =>
                                updateShippingRateDraft(rate.zone, { label: event.target.value })
                              }
                              maxLength={120}
                            />
                          </label>
                          <label>
                            Price (USD)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={rate.shippingDollars}
                              onChange={(event) =>
                                updateShippingRateDraft(rate.zone, {
                                  shippingDollars: event.target.value
                                })
                              }
                              required
                            />
                          </label>
                          <label className="inlineToggle">
                            <input
                              type="checkbox"
                              checked={rate.isActive}
                              onChange={(event) =>
                                updateShippingRateDraft(rate.zone, {
                                  isActive: event.target.checked
                                })
                              }
                            />
                            Active
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="toolbar">
                    <button type="submit" disabled={savingShippingRates || loadingShipping}>
                      {savingShippingRates ? "Saving..." : "Save zone rates"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {adminView === "manage" ? (
            <section className="sectionCard" id="manage-items">
            <h2>Manage Items</h2>
            <p className="admin-note-tight">
              Important info is visible first. Open <strong>More controls</strong> only when needed.
            </p>

            <div className="admin-orders-stats" role="status" aria-label="Product summary">
              <p className="admin-orders-stat">
                <strong>{productCounts.total}</strong>
                <span>Total</span>
              </p>
              <p className="admin-orders-stat">
                <strong>{productCounts.needsAttention}</strong>
                <span>Needs review</span>
              </p>
              <p className="admin-orders-stat">
                <strong>{productCounts.lowStock}</strong>
                <span>Low stock</span>
              </p>
            </div>

            <div className="filterRow">
              <label className="compactLabel">
                Search
                <input
                  type="search"
                  placeholder="Search item name or code"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
              </label>

              <label className="compactLabel">
                View
                <select
                  value={productViewFilter}
                  onChange={(event) => setProductViewFilter(event.target.value as ProductViewFilter)}
                >
                  <option value="all">All products</option>
                  <option value="needs_attention">Needs review</option>
                  <option value="low_stock">Low stock</option>
                  <option value="sold_out">Sold out</option>
                  <option value="no_images">Missing photos</option>
                  <option value="hidden">Not visible</option>
                </select>
              </label>
            </div>

            <div className="toolbar">
              <button type="button" onClick={() => void loadProducts()} disabled={loadingProducts}>
                {loadingProducts ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <p className="admin-note-spaced">
              Showing {visibleProducts.length} of {products.length} products.
            </p>
            {loadingProducts ? <p className="admin-note-tight">Loading items...</p> : null}

            <ul className="admin-card-list">
              {visibleProducts.map((product) => {
                const productImages = imagesByProduct[product.id] ?? [];
                const imageCount = productImages.length;
                const primaryImage =
                  productImages.find((image) => image.is_primary) ?? productImages[0] ?? null;
                const isLowStock = product.inventory_mode === "finite" && product.is_low_stock;
                const isSoldOut = product.inventory_mode === "finite" && product.is_sold_out;
                const isNoImages = imageCount === 0;
                const isHidden = product.status !== "published" || !product.is_available;

                const publishTone =
                  product.status === "published"
                    ? "is-positive"
                    : product.status === "draft"
                      ? "is-neutral"
                      : "is-warning";
                const publishLabel =
                  product.status === "published"
                    ? "Published"
                    : product.status === "draft"
                      ? "Draft"
                      : "Unpublished";

                const stockSummary =
                  product.inventory_mode === "finite"
                    ? `${product.available_quantity ?? 0} available (${product.stock_quantity ?? 0} total, ${
                        product.reserved_quantity
                      } reserved)`
                    : "Made to order";

                return (
                  <li key={product.id} className="itemCard">
                    <div className="admin-product-preview-row">
                      <div className="admin-product-preview-frame" aria-hidden="true">
                        {primaryImage?.signed_url ? (
                          <img
                            src={primaryImage.signed_url}
                            alt={primaryImage.alt_text ?? `${product.name} photo`}
                          />
                        ) : (
                          <div className="admin-product-preview-empty">No photo</div>
                        )}
                      </div>

                      <div className="admin-product-summary">
                        <div className="admin-order-head">
                          <p className="admin-item-title">
                            <strong>{product.name}</strong>
                          </p>
                          <span className={`admin-badge ${publishTone}`}>{publishLabel}</span>
                        </div>

                        <p className="admin-item-line-muted">
                          {formatCategory(product.category)} • Code: {product.slug}
                        </p>
                        <p className="admin-order-meta">
                          ${(product.base_price_cents / 100).toFixed(2)} {product.currency} • {stockSummary} • Photos{" "}
                          {imageCount}
                        </p>
                      </div>
                    </div>

                    <div className="admin-chip-row">
                      <span className={`admin-badge ${product.is_available ? "is-positive" : "is-warning"}`}>
                        {product.is_available ? "Visible" : "Hidden"}
                      </span>
                      {isLowStock ? <span className="admin-badge is-warning">Low stock</span> : null}
                      {isSoldOut ? <span className="admin-badge is-danger">Sold out</span> : null}
                      {isNoImages ? <span className="admin-badge is-warning">No photos</span> : null}
                      {isHidden ? <span className="admin-badge is-neutral">Check visibility</span> : null}
                    </div>

                    {product.category === "custom_sublimation" ? (
                      <p className="admin-item-line-muted">
                        Mode:{" "}
                        {product.custom_sublimation_details ? (
                          <span
                            className={`admin-badge ${
                              product.custom_sublimation_details.allow_image_upload
                                ? "is-info"
                                : "is-neutral"
                            }`}
                          >
                            {formatSublimationMode(product.custom_sublimation_details.allow_image_upload)}
                          </span>
                        ) : (
                          <span className="admin-badge is-danger">Missing setup</span>
                        )}
                      </p>
                    ) : null}

                    <div className="actionGrid is-center actionGridTight">
                      {product.status === "published" ? (
                        <button
                          type="button"
                          onClick={() => void updateProductStatus(product, "unpublish")}
                          disabled={busyProductId === product.id}
                        >
                          Unpublish
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-primary-action"
                          onClick={() => void updateProductStatus(product, "publish")}
                          disabled={busyProductId === product.id}
                        >
                          Publish
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void toggleAvailability(product)}
                        disabled={busyProductId === product.id}
                      >
                        {product.is_available ? "Temporarily hide" : "Show again"}
                      </button>

                      {product.inventory_mode === "finite" ? (
                        <button
                          type="button"
                          onClick={() => void addOneStock(product)}
                          disabled={busyProductId === product.id}
                        >
                          Add 1 stock
                        </button>
                      ) : null}
                    </div>

                    <details className="admin-details admin-divider-top">
                      <summary className="admin-details-summary">More controls</summary>
                      <div className="admin-details-body">
                        {product.category === "custom_sublimation" ? (
                          <div className="actionGrid actionGridTight">
                            <button
                              type="button"
                              onClick={() => void toggleSublimationMode(product)}
                              disabled={
                                busyProductId === product.id || !product.custom_sublimation_details
                              }
                            >
                              {product.custom_sublimation_details?.allow_image_upload
                                ? "Set as ready-made design"
                                : "Require customer upload"}
                            </button>
                          </div>
                        ) : null}

                        <div className="priceEditor">
                          <label className="compactLabel">
                            Price (USD)
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={priceDraftByProduct[product.id] ?? ""}
                              onChange={(event) =>
                                setPriceDraftByProduct((current) => ({
                                  ...current,
                                  [product.id]: event.target.value
                                }))
                              }
                              inputMode="decimal"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void updatePrice(product)}
                            disabled={busyProductId === product.id}
                          >
                            Save price
                          </button>
                        </div>

                        {product.inventory_mode === "finite" ? (
                          <>
                            <div className="stockEditor">
                          <label className="compactLabel">
                            Set stock to
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={stockDraftByProduct[product.id] ?? ""}
                              onChange={(event) =>
                                setStockDraftByProduct((current) => ({
                                  ...current,
                                      [product.id]: event.target.value
                                    }))
                                  }
                                  inputMode="numeric"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void saveStockLevel(product)}
                                disabled={busyProductId === product.id}
                              >
                                Set stock
                              </button>
                            </div>

                            <div className="actionGrid actionGridTight">
                              <button
                                type="button"
                                onClick={() => void addOneStock(product)}
                                disabled={busyProductId === product.id}
                              >
                                Add 1
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeOneStock(product)}
                                disabled={busyProductId === product.id}
                              >
                                Remove 1
                              </button>
                            </div>
                          </>
                        ) : null}

                        <div className="admin-divider-block">
                          <p className="admin-item-line">
                            <strong>Photos</strong>
                          </p>
                          <div className="actionGrid is-center">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                setSelectedFile(product.id, file);
                              }}
                            />
                            <label className="inlineToggle">
                              <input
                                type="checkbox"
                                checked={uploadAsPrimary[product.id] ?? false}
                                onChange={(event) =>
                                  setUploadPrimaryFlag(product.id, event.target.checked)
                                }
                              />
                              Use as main photo
                            </label>
                            <button
                              type="button"
                              onClick={() => void uploadProductImage(product)}
                              disabled={busyProductId === product.id}
                            >
                              Upload photo
                            </button>
                            <button
                              type="button"
                              onClick={() => void refreshImagesForProduct(product.id)}
                              disabled={busyProductId === product.id}
                            >
                              Refresh photos
                            </button>
                          </div>

                          <ul className="admin-stack-list">
                            {(imagesByProduct[product.id] ?? []).map((image) => (
                              <li key={image.id} className="imageItem">
                                <span className="imagePath">
                                  {image.storage_path}
                                  {image.is_primary ? " (primary)" : ""}
                                </span>
                                {!image.is_primary ? (
                                  <button
                                    type="button"
                                    onClick={() => void makeImagePrimary(product.id, image.id)}
                                    disabled={busyProductId === product.id}
                                  >
                                    Set main photo
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void deleteImage(product.id, image)}
                                  disabled={busyProductId === product.id}
                                >
                                  Delete photo
                                </button>
                              </li>
                            ))}
                          </ul>
                          {imageCount === 0 ? <p className="admin-note-spaced">No images yet.</p> : null}
                        </div>

                        <div className="admin-divider-block">
                          <button
                            type="button"
                            onClick={() => void deleteProduct(product)}
                            disabled={busyProductId === product.id}
                            className="dangerButton"
                          >
                            Delete item
                          </button>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>

            {!loadingProducts && products.length === 0 ? <p>No products yet.</p> : null}
            {!loadingProducts && products.length > 0 && visibleProducts.length === 0 ? (
              <p>No products match this filter/search.</p>
            ) : null}
            </section>
          ) : null}
        </>
      )}

    </main>
  );
}
