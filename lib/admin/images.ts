import { randomUUID } from "node:crypto";

const DEFAULT_PRODUCT_IMAGES_BUCKET = "product-images";
const DEFAULT_CUSTOM_UPLOADS_BUCKET = "customer-design-uploads";

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const noPath = trimmed.split("/").pop()?.split("\\").pop() ?? "upload.bin";
  const normalized = noPath
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!normalized) {
    return "upload.bin";
  }

  return normalized.slice(0, 120);
}

export function getProductImagesBucket(): string {
  const configured = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET?.trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_PRODUCT_IMAGES_BUCKET;
}

export function getCustomerUploadsBucket(): string {
  const configured = process.env.SUPABASE_CUSTOM_UPLOADS_BUCKET?.trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_CUSTOM_UPLOADS_BUCKET;
}

export function getStoragePathForProductImage(productId: string, filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  const random = randomUUID().replace(/-/g, "").slice(0, 12);
  return `products/${productId}/${Date.now()}-${random}-${safeFilename}`;
}

export function getStoragePathForCustomizationUpload(productId: string, filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  const random = randomUUID().replace(/-/g, "").slice(0, 12);
  return `customizations/${productId}/${Date.now()}-${random}-${safeFilename}`;
}

export function normalizeStoragePathForBucket(storagePath: string, bucket: string): string {
  const value = storagePath.trim();
  const prefix = `${bucket}/`;
  if (value.startsWith(prefix)) {
    return value.slice(prefix.length);
  }
  return value;
}
