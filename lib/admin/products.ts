import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductCategory = "custom_sublimation" | "handmade_crochet_knit";
export type ProductStatus = "draft" | "published" | "unpublished";
export type InventoryMode = "finite" | "made_to_order";
export type InventoryFilter = "all" | "low_stock" | "out_of_stock";

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  short_description: string | null;
  long_description: string | null;
  base_price_cents: number;
  currency: string;
  inventory_mode: InventoryMode;
  stock_quantity: number | null;
  reserved_quantity: number;
  low_stock_threshold: number;
  is_available: boolean;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CustomSublimationDetails = {
  product_id: string;
  template_image_path: string;
  default_blank_color: string;
  safe_area_x: number;
  safe_area_y: number;
  safe_area_width: number;
  safe_area_height: number;
  max_upload_mb: number;
  allow_image_upload: boolean;
  allow_text_overlay: boolean;
  max_text_layers: number;
  allowed_fonts: string[];
  created_at: string;
  updated_at: string;
};

type CustomSublimationSummaryDetails = {
  allow_image_upload: boolean;
};

type HandmadeDetails = {
  product_id: string;
  material: string;
  care_instructions: string | null;
  lead_time_days: number;
  personalization_available: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminProductSummary = {
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
  custom_sublimation_details: CustomSublimationSummaryDetails | null;
  created_at: string;
  updated_at: string;
};

export type AdminProductDetail = ProductRow & {
  available_quantity: number | null;
  is_sold_out: boolean;
  is_low_stock: boolean;
  custom_sublimation_details: CustomSublimationDetails | null;
  handmade_details: HandmadeDetails | null;
};

export type ListAdminProductsOptions = {
  category?: ProductCategory;
  status?: ProductStatus;
  inventoryFilter?: InventoryFilter;
  q?: string;
  limit: number;
  cursor?: string;
};

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function computeInventory(product: Pick<ProductRow, "inventory_mode" | "stock_quantity" | "reserved_quantity" | "low_stock_threshold">) {
  if (product.inventory_mode !== "finite") {
    return {
      available_quantity: null as number | null,
      is_sold_out: false,
      is_low_stock: false
    };
  }

  const availableQuantity = (product.stock_quantity ?? 0) - product.reserved_quantity;
  return {
    available_quantity: availableQuantity,
    is_sold_out: availableQuantity <= 0,
    is_low_stock: availableQuantity > 0 && availableQuantity <= product.low_stock_threshold
  };
}

function mapSummary(
  product: ProductRow,
  customSublimationDetails: CustomSublimationSummaryDetails | null
): AdminProductSummary {
  const inventory = computeInventory(product);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    base_price_cents: product.base_price_cents,
    currency: product.currency,
    inventory_mode: product.inventory_mode,
    stock_quantity: product.stock_quantity,
    reserved_quantity: product.reserved_quantity,
    available_quantity: inventory.available_quantity,
    is_sold_out: inventory.is_sold_out,
    is_low_stock: inventory.is_low_stock,
    low_stock_threshold: product.low_stock_threshold,
    is_available: product.is_available,
    status: product.status,
    custom_sublimation_details:
      product.category === "custom_sublimation" ? customSublimationDetails : null,
    created_at: product.created_at,
    updated_at: product.updated_at
  };
}

function applyInventoryFilter(items: AdminProductSummary[], filter: InventoryFilter): AdminProductSummary[] {
  if (filter === "low_stock") {
    return items.filter((item) => item.inventory_mode === "finite" && item.is_low_stock);
  }

  if (filter === "out_of_stock") {
    return items.filter((item) => item.inventory_mode === "finite" && item.is_sold_out);
  }

  return items;
}

export async function listAdminProducts(
  supabase: SupabaseClient,
  options: ListAdminProductsOptions
): Promise<{ items: AdminProductSummary[]; nextCursor: string | null }> {
  const inventoryFilter = options.inventoryFilter ?? "all";
  const fetchSize = Math.min(Math.max(options.limit * 4, options.limit), 400);

  let query = supabase
    .from("products")
    .select(
      "id,slug,name,category,base_price_cents,currency,inventory_mode,stock_quantity,reserved_quantity,low_stock_threshold,is_available,status,created_at,updated_at,deleted_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(fetchSize + 1);

  if (options.category) {
    query = query.eq("category", options.category);
  }

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.cursor) {
    query = query.lt("created_at", options.cursor);
  }

  if (options.q) {
    const q = options.q.trim().replace(/,/g, " ");
    if (q.length > 0) {
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to list products"));
  }

  const rows = ((data ?? []) as ProductRow[]).filter((row) => row.deleted_at === null);
  const customProductIds = rows
    .filter((row) => row.category === "custom_sublimation")
    .map((row) => row.id);

  const customDetailsByProductId = new Map<
    string,
    CustomSublimationSummaryDetails
  >();
  if (customProductIds.length > 0) {
    const { data: customDetails, error: customDetailsError } = await supabase
      .from("custom_sublimation_products")
      .select("product_id,allow_image_upload")
      .in("product_id", customProductIds);

    if (customDetailsError) {
      throw new Error(
        safeErrorMessage(
          customDetailsError,
          "Failed to load custom sublimation product settings"
        )
      );
    }

    for (const row of (customDetails ?? []) as Array<{
      product_id: string;
      allow_image_upload: boolean;
    }>) {
      customDetailsByProductId.set(row.product_id, {
        allow_image_upload: row.allow_image_upload
      });
    }
  }

  const filtered = applyInventoryFilter(
    rows.map((row) => mapSummary(row, customDetailsByProductId.get(row.id) ?? null)),
    inventoryFilter
  );
  const items = filtered.slice(0, options.limit);

  let nextCursor: string | null = null;
  if (filtered.length > options.limit) {
    nextCursor = items[items.length - 1]?.created_at ?? null;
  } else if (rows.length > fetchSize && items.length > 0) {
    nextCursor = items[items.length - 1]?.created_at ?? null;
  }

  return { items, nextCursor };
}

export async function getAdminProductRow(
  supabase: SupabaseClient,
  productId: string
): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to fetch product"));
  }

  return (data as ProductRow | null) ?? null;
}

export async function categoryDetailsExist(
  supabase: SupabaseClient,
  productId: string,
  category: ProductCategory
): Promise<boolean> {
  if (category === "custom_sublimation") {
    const { data, error } = await supabase
      .from("custom_sublimation_products")
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      throw new Error(safeErrorMessage(error, "Failed to verify custom sublimation details"));
    }

    return !!data;
  }

  const { data, error } = await supabase
    .from("handmade_products")
    .select("product_id")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to verify handmade details"));
  }

  return !!data;
}

export async function getAdminProductDetail(
  supabase: SupabaseClient,
  productId: string
): Promise<AdminProductDetail | null> {
  const product = await getAdminProductRow(supabase, productId);
  if (!product) {
    return null;
  }

  const inventory = computeInventory(product);

  if (product.category === "custom_sublimation") {
    const { data, error } = await supabase
      .from("custom_sublimation_products")
      .select("*")
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      throw new Error(safeErrorMessage(error, "Failed to fetch custom sublimation details"));
    }

    return {
      ...product,
      ...inventory,
      custom_sublimation_details: (data as CustomSublimationDetails | null) ?? null,
      handmade_details: null
    };
  }

  const { data, error } = await supabase.from("handmade_products").select("*").eq("product_id", productId).maybeSingle();

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to fetch handmade details"));
  }

  return {
    ...product,
    ...inventory,
    custom_sublimation_details: null,
    handmade_details: (data as HandmadeDetails | null) ?? null
  };
}
