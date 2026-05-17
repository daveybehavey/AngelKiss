import {
  computeInventory,
  type InventoryMode,
  type ProductCategory,
  type ProductRow
} from "@/lib/admin/products";
import { getLocalCatalogImageForProduct } from "@/lib/storefront/catalog-image-fallback";
import {
  listVariantsForProduct,
  type PublicProductVariant
} from "@/lib/storefront/product-variants";
import { resolveStorefrontProductImageReadUrls } from "@/lib/storefront/storefront-media-url";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  variant_id: string | null;
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
  /** When true, shoppers may pick an active row from `sublimation_studio_prints` instead of uploading. */
  allow_gallery_selection: boolean;
  allow_text_overlay: boolean;
  max_text_layers: number;
  allowed_fonts: string[];
};

type CustomSublimationSummaryDetails = {
  product_id: string;
  allow_image_upload: boolean;
  allow_gallery_selection: boolean;
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
  variant_id: string | null;
};

export type PublicProductDetail = PublicProductBase & {
  long_description: string | null;
  images: PublicProductImage[];
  variants: PublicProductVariant[];
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
  /**
   * Skip the follow-up `custom_sublimation_products` query (one less round trip).
   * Summaries for sublimation rows get `sublimation_mode: null`. Use for widgets that only need category + price + image.
   */
  skipSublimationDetails?: boolean;
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
    supabase.from("custom_sublimation_products").select("product_id, allow_image_upload, allow_gallery_selection")
  ]);

  if (productsRes.error) {
    throw new Error(productsRes.error.message || "Failed to load products for overview");
  }
  if (customRes.error) {
    throw new Error(customRes.error.message || "Failed to load sublimation overview");
  }

  const products = (productsRes.data ?? []) as Pick<ProductRow, "id" | "category">[];
  const uploadPreference = new Map<
    string,
    { allow_image_upload: boolean; allow_gallery_selection: boolean }
  >(
    (customRes.data ?? []).map(
      (row: {
        product_id: string;
        allow_image_upload: boolean;
        allow_gallery_selection?: boolean;
      }) => [
        row.product_id,
        {
          allow_image_upload: row.allow_image_upload,
          allow_gallery_selection: row.allow_gallery_selection ?? false
        }
      ]
    )
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
    const prefs = uploadPreference.get(product.id);
    const prefersUpload = prefs?.allow_image_upload === true;
    const prefersGallery = prefs?.allow_gallery_selection === true;
    if (prefersUpload || prefersGallery) {
      customUpload += 1;
    } else {
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

function mapSublimationMode(allowImageUpload: boolean, allowGallerySelection: boolean): SublimationMode {
  return allowImageUpload || allowGallerySelection ? "customer_upload" : "ready_made_design";
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
      ? mapSublimationMode(
          customDetails.allow_image_upload,
          (customDetails.allow_gallery_selection ?? false) || customDetails.allow_image_upload
        )
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
    ? `${PRODUCT_SUMMARY_COLUMNS},custom_sublimation_products!inner(allow_image_upload,allow_gallery_selection)`
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
    query = query.eq("category", "custom_sublimation");
    if (options.sublimationMode === "customer_upload") {
      query = query.or("allow_image_upload.eq.true,allow_gallery_selection.eq.true", {
        foreignTable: "custom_sublimation_products"
      });
    } else {
      query = query
        .eq("custom_sublimation_products.allow_image_upload", false)
        .eq("custom_sublimation_products.allow_gallery_selection", false);
    }
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
  const customProductIds = pageRows
    .filter((row) => row.category === "custom_sublimation")
    .map((row) => row.id);

  const skipSublimationDetails = options.skipSublimationDetails === true;

  const emptyImages = Promise.resolve({
    data: [] as ProductImageRow[],
    error: null as null
  });
  const imagesPromise =
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("id,product_id,storage_path,alt_text,sort_order,is_primary")
          .in("product_id", productIds)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      : emptyImages;

  const emptyDetails = Promise.resolve({
    data: [] as CustomSublimationSummaryDetails[],
    error: null as null
  });
  const detailsPromise =
    !skipSublimationDetails && customProductIds.length > 0
      ? supabase
          .from("custom_sublimation_products")
          .select("product_id,allow_image_upload,allow_gallery_selection")
          .in("product_id", customProductIds)
      : emptyDetails;

  const [imagesResult, detailsResult] = await Promise.all([imagesPromise, detailsPromise]);

  let primaryImageByProductId: Record<string, ProductImageRow> = {};
  if (!imagesResult.error) {
    const byProduct: Record<string, ProductImageRow> = {};
    for (const image of (imagesResult.data ?? []) as ProductImageRow[]) {
      if (!byProduct[image.product_id]) {
        byProduct[image.product_id] = image;
      }
    }
    primaryImageByProductId = byProduct;
  }

  const signedUrlsByStoragePath = await resolveStorefrontProductImageReadUrls(
    supabase,
    Object.values(primaryImageByProductId).map((image) => image.storage_path)
  );

  const customDetailsByProductId = new Map<string, CustomSublimationSummaryDetails>();
  if (detailsResult.error) {
    throw new Error(detailsResult.error.message || "Failed to fetch sublimation details");
  }
  for (const details of (detailsResult.data ?? []) as CustomSublimationSummaryDetails[]) {
    customDetailsByProductId.set(details.product_id, {
      ...details,
      allow_gallery_selection: details.allow_gallery_selection ?? false
    });
  }

  const items = pageRows.map((row) => {
    const primaryImage = primaryImageByProductId[row.id] ?? null;
    const signedImageUrl = primaryImage ? (signedUrlsByStoragePath[primaryImage.storage_path] ?? null) : null;
    const summary = mapPublicSummary(
      row,
      primaryImage,
      signedImageUrl,
      customDetailsByProductId
    );
    if (!summary.primary_image_url) {
      const local = getLocalCatalogImageForProduct(row);
      if (local) {
        return {
          ...summary,
          primary_image_url: local.url,
          primary_image_alt: local.alt
        };
      }
    }
    return summary;
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
    .select("id,product_id,storage_path,alt_text,sort_order,is_primary,variant_id")
    .eq("product_id", product.id)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const categoryDetailsQuery =
    product.category === "custom_sublimation"
      ? supabase
          .from("custom_sublimation_products")
          .select(
            "template_image_path,default_blank_color,safe_area_x,safe_area_y,safe_area_width,safe_area_height,max_upload_mb,allow_image_upload,allow_gallery_selection,allow_text_overlay,max_text_layers,allowed_fonts"
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
  const signedUrlsByStoragePath = await resolveStorefrontProductImageReadUrls(
    supabase,
    images.map((image) => image.storage_path)
  );

  let mappedImages: PublicProductImage[] = images.map((image) => ({
    id: image.id,
    storage_path: image.storage_path,
    alt_text: image.alt_text,
    sort_order: image.sort_order,
    is_primary: image.is_primary,
    signed_url: signedUrlsByStoragePath[image.storage_path] ?? null,
    variant_id: image.variant_id ?? null
  }));

  const localCatalog = getLocalCatalogImageForProduct(product);
  if (localCatalog && !mappedImages.some((image) => image.signed_url)) {
    mappedImages = [
      {
        id: `local-catalog:${product.slug}`,
        storage_path: `__local__${localCatalog.url}`,
        alt_text: localCatalog.alt,
        sort_order: -1,
        is_primary: true,
        signed_url: localCatalog.url,
        variant_id: null
      },
      ...mappedImages.map((image) => ({ ...image, is_primary: false }))
    ];
  }

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
      customDetails = {
        ...customDetails,
        allow_gallery_selection: customDetails.allow_gallery_selection ?? false
      };
      sublimationMode = mapSublimationMode(
        customDetails.allow_image_upload,
        customDetails.allow_gallery_selection || customDetails.allow_image_upload
      );
    }
  } else {
    handmadeDetails = (detailsResult.data as HandmadePublicDetails | null) ?? null;
  }

  const primaryImage = mappedImages.find((image) => image.is_primary) ?? mappedImages[0] ?? null;
  const inventory = computeInventory(product);
  const variants = await listVariantsForProduct(supabase, product.id);

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
    variants,
    custom_sublimation_details: customDetails,
    handmade_details: handmadeDetails,
    created_at: product.created_at
  };
}
