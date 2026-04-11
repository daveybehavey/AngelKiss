import {
  getCustomerUploadsBucket,
  getStoragePathForCustomizationUpload
} from "@/lib/admin/images";
import { badRequest, notFound, serverError } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  file_size_bytes: z.number().int().positive().optional()
});

const SIGNED_UPLOAD_TTL_MS = 30 * 60 * 1000;

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    if (!parsed.data.content_type.toLowerCase().startsWith("image/")) {
      return badRequest("content_type must be an image MIME type");
    }

    const { slug } = await context.params;
    const supabase = getSupabaseAdminClient();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id,category,status,is_available,deleted_at")
      .eq("slug", slug)
      .maybeSingle();

    if (productError) {
      return badRequest(productError.message);
    }

    if (!product || product.deleted_at !== null) {
      return notFound("Product not found");
    }

    if (
      product.category !== "custom_sublimation" ||
      product.status !== "published" ||
      product.is_available !== true
    ) {
      return badRequest("Image upload is only available for live custom sublimation products");
    }

    const { data: details, error: detailsError } = await supabase
      .from("custom_sublimation_products")
      .select("max_upload_mb,allow_image_upload")
      .eq("product_id", product.id)
      .maybeSingle();

    if (detailsError) {
      return badRequest(detailsError.message);
    }

    if (!details || !details.allow_image_upload) {
      return badRequest("Image uploads are not enabled for this product");
    }

    if (
      parsed.data.file_size_bytes &&
      parsed.data.file_size_bytes > details.max_upload_mb * 1024 * 1024
    ) {
      return badRequest(`Image is too large. Maximum is ${details.max_upload_mb} MB`);
    }

    const bucket = getCustomerUploadsBucket();
    const storagePath = getStoragePathForCustomizationUpload(
      product.id,
      parsed.data.filename
    );

    const { data: buckets, error: bucketsError } =
      await supabase.storage.listBuckets();
    if (bucketsError) {
      return badRequest(bucketsError.message);
    }

    const bucketExists = (buckets ?? []).some((existingBucket) => {
      return existingBucket.id === bucket || existingBucket.name === bucket;
    });

    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket(
        bucket,
        {
          public: false
        }
      );

      if (createBucketError) {
        return badRequest(createBucketError.message);
      }
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      return badRequest(
        signedError?.message ?? "Failed to create signed upload URL"
      );
    }

    return NextResponse.json(
      {
        uploadUrl: signedData.signedUrl,
        storagePath,
        bucket,
        expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
        maxUploadMb: details.max_upload_mb,
        token: signedData.token
      },
      { status: 200 }
    );
  } catch (error) {
    return serverError(
      "Unexpected error creating customization upload URL",
      error instanceof Error ? error.message : error
    );
  }
}
