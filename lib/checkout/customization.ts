import { getCustomerUploadsBucket } from "@/lib/admin/images";
import { z } from "zod";

export type CheckoutProductRow = {
  id: string;
  category: "custom_sublimation" | "handmade_crochet_knit";
  status: "draft" | "published" | "unpublished";
  is_available: boolean;
  deleted_at: string | null;
};

export type CustomSublimationCheckoutDetails = {
  product_id: string;
  allow_image_upload: boolean;
  max_upload_mb: number;
};

export type ItemValidationOutcome =
  | { ok: true; customization: Record<string, unknown> }
  | { ok: false; message: string; details?: unknown };

const customerUploadPayloadSchema = z
  .object({
    upload: z
      .object({
        bucket: z.string().trim().min(1).max(120),
        storage_path: z.string().trim().min(1).max(512),
        original_filename: z.string().trim().min(1).max(255).optional(),
        content_type: z.string().trim().min(1).max(120).optional(),
        size_bytes: z.number().int().positive().optional(),
        uploaded_at: z.string().datetime().optional()
      })
      .strict(),
    rights_acknowledged: z.literal(true),
    customer_notes: z.string().trim().max(500).optional()
  })
  .strict();

const preDesignedPayloadSchema = z
  .object({
    customer_notes: z.string().trim().max(500).optional()
  })
  .strict();

export function normalizeCustomizationForCheckout(
  customizationInput: Record<string, unknown> | undefined,
  product: CheckoutProductRow,
  customDetailsByProductId: Map<string, CustomSublimationCheckoutDetails>
): ItemValidationOutcome {
  const rawCustomization = customizationInput ?? {};

  if (product.category !== "custom_sublimation") {
    return { ok: true, customization: {} };
  }

  const details = customDetailsByProductId.get(product.id);
  if (!details) {
    return {
      ok: false,
      message: "Product customization settings are missing for a sublimation item"
    };
  }

  if (details.allow_image_upload) {
    const parsed = customerUploadPayloadSchema.safeParse(rawCustomization);
    if (!parsed.success) {
      return {
        ok: false,
        message: "This custom product requires an uploaded image and rights confirmation",
        details: parsed.error.flatten()
      };
    }

    const customization = parsed.data;
    const expectedBucket = getCustomerUploadsBucket();
    const expectedPathPrefix = `customizations/${product.id}/`;

    if (customization.upload.bucket !== expectedBucket) {
      return {
        ok: false,
        message: "Uploaded image bucket is invalid for this product"
      };
    }

    if (!customization.upload.storage_path.startsWith(expectedPathPrefix)) {
      return {
        ok: false,
        message: "Uploaded image path is invalid for this product"
      };
    }

    if (
      typeof customization.upload.content_type === "string" &&
      !customization.upload.content_type.toLowerCase().startsWith("image/")
    ) {
      return {
        ok: false,
        message: "Uploaded customization file must be an image"
      };
    }

    if (
      typeof customization.upload.size_bytes === "number" &&
      customization.upload.size_bytes > details.max_upload_mb * 1024 * 1024
    ) {
      return {
        ok: false,
        message: `Uploaded image exceeds max size (${details.max_upload_mb} MB)`
      };
    }

    return {
      ok: true,
      customization: {
        upload: customization.upload,
        rights_acknowledged: true,
        ...(customization.customer_notes
          ? { customer_notes: customization.customer_notes }
          : {})
      }
    };
  }

  const parsed = preDesignedPayloadSchema.safeParse(rawCustomization);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "This sublimation item is pre-designed and does not accept customer image uploads",
      details: parsed.error.flatten()
    };
  }

  return {
    ok: true,
    customization: parsed.data.customer_notes
      ? { customer_notes: parsed.data.customer_notes }
      : {}
  };
}
