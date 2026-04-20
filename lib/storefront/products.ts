import { getProductImagesBucket, normalizeStoragePathForBucket } from "@/lib/admin/images";
import {
  computeInventory,
  type InventoryMode,
  type ProductCategory,
  type ProductRow
} from "@/lib/admin/products";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type CustomSublimationPublicDetails = {
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
};

type CustomSublimationSummaryDetails = {
  product_id: string;
  allow_image_upload: boolean;
};

type HandmadePublicDetails = {
  material: string;
  care_instructions: string | null;
  lead_time_days: number;
  personalization_available: boolean;
};

export type SublimationMode = "customer_upload" | "ready_made_design";

type PublicProductBase = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  sublimation_mode: SublimationMode | null;
  short_description: string | null;
  base_price_cents: number;
  currency: string;
  inventory_mode: InventoryMode;
  available_quantity: number | null;
  is_sold_out: boolean;
  is_low_stock: boolean;
  can_purchase: boolean;
  primary_image_url: string | null;
  primary_image_alt: string | null;
  created_at: string;
};

export type PublicProductSummary = PublicProductBase;

export type PublicProductImage = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  signed_url: string | null;
};

export type PublicProductDetail = PublicProductBase & {
  long_description: string | null;
  images: PublicProductImage[];
  custom_sublimation_details: CustomSublimationPublicDetails | null;
  handmade_details: HandmadePublicDetails | null;
};

export type ListPublicProductsOptions = {
  category?: ProductCategory;
  /** Only applied when `category` is `custom_sublimation` (filters via DB join). */
  sublimationMode?: SublimationMode;
  q?: string;
  limit: number;
  cursor?: string;
};

const PRODUCT_SUMMARY_COLUMNS =
  "id,slug,name,category,short_description,base_price_cents,currency,inventory_mode,stock_quantity,reserved_quantity,low_stock_threshold,is_available,status,created_at,updated_at,deleted_at";

export type PublishedShopOverview = {
  total: number;
  handmade: number;
  customSublimation: number;
  customUpload: number;
  readyMade: number;
};

/**
 * Lightweight shop dashboard counts (two parallel queries, no image signing).
 */
export async function getPublishedShopOverview(
  supabase: SupabaseClient
): Promise<PublishedShopOverview> {
  const [productsRes, customRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, category")
      .is("deleted_at", null)
      .eq("status", "published")
      .eq("is_available", true),
    supabase.from("custom_sublimation_products").select("product_id, allow_image_upload")
  ]);

  if (productsRes.error) {
    throw new Error(productsRes.error.message || "Failed to load products for overview");
  }
  if (customRes.error) {
    throw new Error(customRes.error.message || "Failed to load sublimation overview");
  }

  const products = (productsRes.data ?? []) as Pick<ProductRow, "id" | "category">[];
  const uploadPreference = new Map<string, boolean>(
    (customRes.data ?? []).map((row: { product_id: string; allow_image_upload: boolean }) => [
      row.product_id,
      row.allow_image_upload
    ])
  );

  let handmade = 0;
  let customSublimation = 0;
  let customUpload = 0;
  let readyMade = 0;

  for (const product of products) {
    if (product.category === "handmade_crochet_knit") {
      handmade += 1;
      continue;
    }
    if (product.category !== "custom_sublimation") {
      continue;
    }
    customSublimation += 1;
    const prefersUpload = uploadPreference.get(product.id);
    if (prefersUpload === true) {
      customUpload += 1;
    } else if (prefersUpload === false) {
      readyMade += 1;
    }
  }

  return {
    total: products.length,
    handmade,
    customSublimation,
    customUpload,
    readyMade
  };
}

function stripProductJoinRow(row: Record<string, unknown>): ProductRow {
  const { custom_sublimation_products: _join, ...rest } = row;
  return rest as ProductRow;
}

function canPurchase(inventoryMode: InventoryMode, availableQuantity: number | null): boolean {
  if (inventoryMode === "made_to_order") {
    return true;
  }
  return (availableQuantity ?? 0) > 0;
}

function mapSublimationMode(allowImageUpload: boolean): SublimationMode {
  return allowImageUpload ? "customer_upload" : "ready_made_design";
}

async function signImagePaths(
  supabase: SupabaseClient,
  storagePaths: string[]
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(storagePaths.filter((value) => value.trim().length > 0)));
  if (uniquePaths.length === 0) {
    return {};
  }

  const bucket = getProductImagesBucket();
  const normalizedPaths = uniquePaths.map((path) => normalizeStoragePathForBucket(path, bucket));

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(normalizedPaths, 60 * 60);
  if (error || !data) {
    return {};
  }

  const byNormalizedPath = new Map<string, string>();
  for (const item of data) {
    if (!item.path || !item.signedUrl || item.error) {
      continue;
    }
    byNormalizedPath.set(item.path, item.signedUrl);
  }

  const byOriginalPath: Record<string, string> = {};
  for (const path of uniquePaths) {
    const normalized = normalizeStoragePathForBucket(path, bucket);
    const signedUrl = byNormalizedPath.get(normalized);
    if (signedUrl) {
      byOriginalPath[path] = signedUrl;
    }
  }

  return byOriginalPath;
}

function mapPublicSummary(
  product: ProductRow,
  primaryImage: ProductImageRow | null,
  signedImageUrl: string | null,
  customDetailsByProductId: Map<string, CustomSublimationSummaryDetails>
): PublicProductSummary {
  const inventory = computeInventory(product);
  const customDetails =
    product.category === "custom_sublimation"
      ? customDetailsByProductId.get(product.id) ?? null
      : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    sublimation_mode: customDetails
      ? mapSublimationMode(customDetails.allow_image_upload)
      : null,
    short_description: product.short_description,
    base_price_cents: product.base_price_cents,
    currency: product.currency,
    inventory_mode: product.inventory_mode,
    available_quantity: inventory.available_quantity,
    is_sold_out: inventory.is_sold_out,
    is_low_stock: inventory.is_low_stock,
    can_purchase: canPurchase(product.inventory_mode, inventory.available_quantity),
    primary_image_url: signedImageUrl,
    primary_image_alt: primaryImage?.alt_text ?? null,
    created_at: product.created_at
  };
}

export async function listPublicProducts(
  supabase: SupabaseClient,
  options: ListPublicProductsOptions
): Promise<{ items: PublicProductSummary[]; nextCursor: string | null }> {
  const useSublimationJoin =
    options.category === "custom_sublimation" && options.sublimationMode !== undefined;

  const selectColumns = useSublimationJoin
    ? `${PRODUCT_SUMMARY_COLUMNS},custom_sublimation_products!inner(allow_image_upload)`
    : PRODUCT_SUMMARY_COLUMNS;

  let query = supabase
    .from("products")
    .select(selectColumns)
    .is("deleted_at", null)
    .eq("status", "published")
    .eq("is_available", true)
    .order("created_at", { ascending: false })
    .limit(options.limit + 1);

  if (options.category && !useSublimationJoin) {
    query = query.eq("category", options.category);
  }

  if (useSublimationJoin) {
    query = query
      .eq("category", "custom_sublimation")
      .eq(
        "custom_sublimation_products.allow_image_upload",
        options.sublimationMode === "customer_upload"
      );
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
    throw new Error(error.message || "Failed to list products");
  }

  const rawRows = (data ?? []) as unknown[];
  const rows: ProductRow[] = useSublimationJoin
    ? rawRows.map((row) => stripProductJoinRow(row as Record<string, unknown>))
    : (rawRows as ProductRow[]);
  const pageRows = rows.slice(0, options.limit);
  const productIds = pageRows.map((row) => row.id);

  let primaryImageByProductId: Record<string, ProductImageRow> = {};
  if (productIds.length > 0) {
    const { data: imageRows, error: imagesError } = await supabase
      .from("product_images")
      .select("id,product_id,storage_path,alt_text,sort_order,is_primary")
      .in("product_id", productIds)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!imagesError) {
      const byProduct: Record<string, ProductImageRow> = {};
      for (const image of (imageRows ?? []) as ProductImageRow[]) {
        if (!byProduct[image.product_id]) {
          byProduct[image.product_id] = image;
        }
      }
      primaryImageByProductId = byProduct;
    }
  }

  const signedUrlsByStoragePath = await signImagePaths(
    supabase,
    Object.values(primaryImageByProductId).map((image) => image.storage_path)
  );

  const customProductIds = pageRows
    .filter((row) => row.category === "custom_sublimation")
    .map((row) => row.id);
  const customDetailsByProductId = new Map<
    string,
    CustomSublimationSummaryDetails
  >();
  if (customProductIds.length > 0) {
    const { data: detailsRows, error: detailsError } = await supabase
      .from("custom_sublimation_products")
      .select("product_id,allow_image_upload")
      .in("product_id", customProductIds);

    if (detailsError) {
      throw new Error(detailsError.message || "Failed to fetch sublimation details");
    }

    for (const details of (detailsRows ?? []) as CustomSublimationSummaryDetails[]) {
      customDetailsByProductId.set(details.product_id, details);
    }
  }

  const items = pageRows.map((row) => {
    const primaryImage = primaryImageByProductId[row.id] ?? null;
    const signedImageUrl = primaryImage ? (signedUrlsByStoragePath[primaryImage.storage_path] ?? null) : null;
    return mapPublicSummary(
      row,
      primaryImage,
      signedImageUrl,
      customDetailsByProductId
    );
  });

  const nextCursor = rows.length > options.limit ? (items[items.length - 1]?.created_at ?? null) : null;
  return { items, nextCursor };
}

export async function getPublicProductBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PublicProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,slug,name,category,short_description,long_description,base_price_cents,currency,inventory_mode,stock_quantity,reserved_quantity,low_stock_threshold,is_available,status,created_at,updated_at,deleted_at"
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .eq("status", "published")
    .eq("is_available", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to fetch product");
  }

  const product = (data as ProductRow | null) ?? null;
  if (!product) {
    return null;
  }

  const imagesQuery = supabase
    .from("product_images")
    .select("id,product_id,storage_path,alt_text,sort_order,is_primary")
    .eq("product_id", product.id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const categoryDetailsQuery =
    product.category === "custom_sublimation"
      ? supabase
          .from("custom_sublimation_products")
          .select(
            "template_image_path,default_blank_color,safe_area_x,safe_area_y,safe_area_width,safe_area_height,max_upload_mb,allow_image_upload,allow_text_overlay,max_text_layers,allowed_fonts"
          )
          .eq("product_id", product.id)
          .maybeSingle()
      : supabase
          .from("handmade_products")
          .select("material,care_instructions,lead_time_days,personalization_available")
          .eq("product_id", product.id)
          .maybeSingle();

  const [imagesResult, detailsResult] = await Promise.all([imagesQuery, categoryDetailsQuery]);

  if (imagesResult.error) {
    throw new Error(imagesResult.error.message || "Failed to fetch product images");
  }

  const images = (imagesResult.data ?? []) as ProductImageRow[];
  const signedUrlsByStoragePath = await signImagePaths(
    supabase,
    images.map((image) => image.storage_path)
  );

  const mappedImages: PublicProductImage[] = images.map((image) => ({
    id: image.id,
    storage_path: image.storage_path,
    alt_text: image.alt_text,
    sort_order: image.sort_order,
    is_primary: image.is_primary,
    signed_url: signedUrlsByStoragePath[image.storage_path] ?? null
  }));

  let customDetails: CustomSublimationPublicDetails | null = null;
  let handmadeDetails: HandmadePublicDetails | null = null;
  let sublimationMode: SublimationMode | null = null;

  if (detailsResult.error) {
    throw new Error(
      detailsResult.error.message ||
        (product.category === "custom_sublimation"
          ? "Failed to fetch custom sublimation details"
          : "Failed to fetch handmade details")
    );
  }

  if (product.category === "custom_sublimation") {
    customDetails = (detailsResult.data as CustomSublimationPublicDetails | null) ?? null;
    if (customDetails) {
      sublimationMode = mapSublimationMode(customDetails.allow_image_upload);
    }
  } else {
    handmadeDetails = (detailsResult.data as HandmadePublicDetails | null) ?? null;
  }

  const primaryImage = mappedImages.find((image) => image.is_primary) ?? mappedImages[0] ?? null;
  const inventory = computeInventory(product);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    sublimation_mode: sublimationMode,
    short_description: product.short_description,
    long_description: product.long_description,
    base_price_cents: product.base_price_cents,
    currency: product.currency,
    inventory_mode: product.inventory_mode,
    available_quantity: inventory.available_quantity,
    is_sold_out: inventory.is_sold_out,
    is_low_stock: inventory.is_low_stock,
    can_purchase: canPurchase(product.inventory_mode, inventory.available_quantity),
    primary_image_url: primaryImage?.signed_url ?? null,
    primary_image_alt: primaryImage?.alt_text ?? null,
    images: mappedImages,
    custom_sublimation_details: customDetails,
    handmade_details: handmadeDetails,
    created_at: product.created_at
  };
}
