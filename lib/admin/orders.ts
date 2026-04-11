import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCustomerUploadsBucket,
  normalizeStoragePathForBucket
} from "@/lib/admin/images";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "in_production"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "canceled"
  | "refunded"
  | "payment_failed";

type OrderRow = {
  id: string;
  order_number: number;
  checkout_session_id: string | null;
  paypal_order_id: string | null;
  customer_email: string;
  customer_name: string | null;
  shipping_address: Record<string, unknown>;
  status: OrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: string;
  notes: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  product_snapshot: Record<string, unknown>;
  customization_json: Record<string, unknown>;
  created_at: string;
};

type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_order_id: string;
  provider_capture_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type OrderStatusHistoryRow = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type AdminOrderSummary = {
  id: string;
  order_number: number;
  status: OrderStatus;
  customer_email: string;
  total_cents: number;
  currency: string;
  item_count: number;
  customization_item_count: number;
  has_customization_upload: boolean;
  shipping_destination: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminOrderItem = OrderItemRow & {
  customization_download_url: string | null;
  customization_upload_filename: string | null;
  customization_notes: string | null;
};

export type AdminOrderDetail = OrderRow & {
  items: AdminOrderItem[];
  payments: PaymentRow[];
  status_history: OrderStatusHistoryRow[];
};

export type ListAdminOrdersOptions = {
  status?: OrderStatus;
  limit: number;
  cursor?: string;
};

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readShippingText(shippingAddress: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = shippingAddress[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function summarizeShippingDestination(shippingAddress: unknown): string | null {
  const shippingRecord = asRecord(shippingAddress);
  if (!shippingRecord) {
    return null;
  }

  const city = readShippingText(shippingRecord, ["city", "locality", "town"]);
  const region = readShippingText(shippingRecord, [
    "province_code",
    "provinceCode",
    "province",
    "state_code",
    "state",
    "region"
  ]);
  const country = readShippingText(shippingRecord, [
    "country_code",
    "countryCode",
    "country"
  ]);

  const parts = [city, region, country].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(", ") : null;
}

function extractCustomizationInfo(customization: unknown): {
  notes: string | null;
  uploadBucket: string | null;
  uploadPath: string | null;
  uploadFilename: string | null;
} {
  const customizationRecord = asRecord(customization);
  if (!customizationRecord) {
    return {
      notes: null,
      uploadBucket: null,
      uploadPath: null,
      uploadFilename: null
    };
  }

  const notes =
    typeof customizationRecord.customer_notes === "string" &&
    customizationRecord.customer_notes.trim().length > 0
      ? customizationRecord.customer_notes.trim()
      : null;

  const uploadRecord = asRecord(customizationRecord.upload);
  if (uploadRecord) {
    const uploadPath =
      typeof uploadRecord.storage_path === "string" &&
      uploadRecord.storage_path.trim().length > 0
        ? uploadRecord.storage_path.trim()
        : null;
    const uploadBucket =
      typeof uploadRecord.bucket === "string" && uploadRecord.bucket.trim().length > 0
        ? uploadRecord.bucket.trim()
        : getCustomerUploadsBucket();
    const uploadFilename =
      typeof uploadRecord.original_filename === "string" &&
      uploadRecord.original_filename.trim().length > 0
        ? uploadRecord.original_filename.trim()
        : null;

    return {
      notes,
      uploadBucket,
      uploadPath,
      uploadFilename
    };
  }

  if (
    typeof customizationRecord.image_storage_path === "string" &&
    customizationRecord.image_storage_path.trim().length > 0
  ) {
    return {
      notes,
      uploadBucket: getCustomerUploadsBucket(),
      uploadPath: customizationRecord.image_storage_path.trim(),
      uploadFilename: null
    };
  }

  return {
    notes,
    uploadBucket: null,
    uploadPath: null,
    uploadFilename: null
  };
}

export async function listAdminOrders(
  supabase: SupabaseClient,
  options: ListAdminOrdersOptions
): Promise<{ items: AdminOrderSummary[]; nextCursor: string | null }> {
  let query = supabase
    .from("orders")
    .select(
      "id,order_number,status,customer_email,shipping_address,shipping_carrier,tracking_number,tracking_url,shipped_at,total_cents,currency,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(options.limit + 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.cursor) {
    query = query.lt("created_at", options.cursor);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to list orders"));
  }

  const rows = (data ?? []) as Array<
    Pick<
      OrderRow,
      | "id"
      | "order_number"
      | "status"
      | "customer_email"
      | "shipping_address"
      | "shipping_carrier"
      | "tracking_number"
      | "tracking_url"
      | "shipped_at"
      | "total_cents"
      | "currency"
      | "created_at"
      | "updated_at"
    >
  >;

  const pageRows = rows.slice(0, options.limit);
  const orderIds = pageRows.map((row) => row.id);

  const itemCountByOrder = new Map<string, number>();
  const customizationCountByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from("order_items")
      .select("order_id,customization_json")
      .in("order_id", orderIds);

    if (itemError) {
      throw new Error(safeErrorMessage(itemError, "Failed to load order item counts"));
    }

    for (const row of itemRows ?? []) {
      const typedRow = row as { order_id: string; customization_json?: unknown };
      const orderId = typedRow.order_id;
      itemCountByOrder.set(orderId, (itemCountByOrder.get(orderId) ?? 0) + 1);

      const customizationInfo = extractCustomizationInfo(typedRow.customization_json);
      if (customizationInfo.uploadPath) {
        customizationCountByOrder.set(
          orderId,
          (customizationCountByOrder.get(orderId) ?? 0) + 1
        );
      }
    }
  }

  const items: AdminOrderSummary[] = pageRows.map((row) => ({
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    customer_email: row.customer_email,
    total_cents: row.total_cents,
    currency: row.currency,
    item_count: itemCountByOrder.get(row.id) ?? 0,
    customization_item_count: customizationCountByOrder.get(row.id) ?? 0,
    has_customization_upload: (customizationCountByOrder.get(row.id) ?? 0) > 0,
    shipping_destination: summarizeShippingDestination(row.shipping_address),
    shipping_carrier: row.shipping_carrier,
    tracking_number: row.tracking_number,
    tracking_url: row.tracking_url,
    shipped_at: row.shipped_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  const nextCursor = rows.length > options.limit ? items[items.length - 1]?.created_at ?? null : null;

  return {
    items,
    nextCursor
  };
}

export async function getAdminOrderDetail(
  supabase: SupabaseClient,
  orderId: string
): Promise<AdminOrderDetail | null> {
  const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (orderError) {
    throw new Error(safeErrorMessage(orderError, "Failed to load order"));
  }

  if (!order) {
    return null;
  }

  const [{ data: items, error: itemsError }, { data: payments, error: paymentsError }, { data: statusHistory, error: statusHistoryError }] =
    await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
      supabase.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: false })
    ]);

  if (itemsError) {
    throw new Error(safeErrorMessage(itemsError, "Failed to load order items"));
  }
  if (paymentsError) {
    throw new Error(safeErrorMessage(paymentsError, "Failed to load payments"));
  }
  if (statusHistoryError) {
    throw new Error(safeErrorMessage(statusHistoryError, "Failed to load order status history"));
  }

  const itemRows = (items ?? []) as OrderItemRow[];
  const signRequestsByBucket = new Map<string, Set<string>>();
  const customizationInfoByItemId = new Map<
    string,
    {
      notes: string | null;
      uploadBucket: string | null;
      uploadPath: string | null;
      uploadFilename: string | null;
    }
  >();

  for (const item of itemRows) {
    const info = extractCustomizationInfo(item.customization_json);
    customizationInfoByItemId.set(item.id, info);

    if (!info.uploadBucket || !info.uploadPath) {
      continue;
    }

    const normalizedPath = normalizeStoragePathForBucket(
      info.uploadPath,
      info.uploadBucket
    );
    const currentPaths = signRequestsByBucket.get(info.uploadBucket) ?? new Set();
    currentPaths.add(normalizedPath);
    signRequestsByBucket.set(info.uploadBucket, currentPaths);
  }

  const signedUrlByBucketAndPath = new Map<string, string>();
  for (const [bucket, pathsSet] of signRequestsByBucket.entries()) {
    const paths = Array.from(pathsSet);
    if (paths.length === 0) {
      continue;
    }

    const { data: signedRows, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, 60 * 60);

    if (signedError) {
      continue;
    }

    for (const row of signedRows ?? []) {
      if (!row.path || !row.signedUrl || row.error) {
        continue;
      }
      signedUrlByBucketAndPath.set(`${bucket}:${row.path}`, row.signedUrl);
    }
  }

  const adminItems: AdminOrderItem[] = itemRows.map((item) => {
    const info = customizationInfoByItemId.get(item.id) ?? {
      notes: null,
      uploadBucket: null,
      uploadPath: null,
      uploadFilename: null
    };

    let customizationDownloadUrl: string | null = null;
    if (info.uploadBucket && info.uploadPath) {
      const normalizedPath = normalizeStoragePathForBucket(
        info.uploadPath,
        info.uploadBucket
      );
      customizationDownloadUrl =
        signedUrlByBucketAndPath.get(`${info.uploadBucket}:${normalizedPath}`) ?? null;
    }

    return {
      ...item,
      customization_download_url: customizationDownloadUrl,
      customization_upload_filename: info.uploadFilename,
      customization_notes: info.notes
    };
  });

  return {
    ...(order as OrderRow),
    items: adminItems,
    payments: (payments ?? []) as PaymentRow[],
    status_history: (statusHistory ?? []) as OrderStatusHistoryRow[]
  };
}
