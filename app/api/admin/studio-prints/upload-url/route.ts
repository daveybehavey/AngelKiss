import { assertAdminFromRequest } from "@/lib/auth/admin";
import {
  getProductImagesBucket,
  getStoragePathForStudioGalleryPrint,
  normalizeStoragePathForBucket
} from "@/lib/admin/images";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import {
  catalogMediaUsesR2Uploads,
  getCatalogMediaUploadBlockReason
} from "@/lib/server/catalog-media-storage";
import { createR2PresignedPutForCatalogObject } from "@/lib/server/r2-product-media";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1)
});

const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    if (!parsed.data.content_type.toLowerCase().startsWith("image/")) {
      return badRequest("content_type must be an image MIME type");
    }

    const uploadBlock = getCatalogMediaUploadBlockReason();
    if (uploadBlock) {
      return badRequest(uploadBlock);
    }

    const supabase = getSupabaseAdminClient();
    const bucket = getProductImagesBucket();
    const storagePath = getStoragePathForStudioGalleryPrint(parsed.data.filename);

    if (catalogMediaUsesR2Uploads()) {
      const objectKey = normalizeStoragePathForBucket(storagePath, bucket);
      const uploadUrl = await createR2PresignedPutForCatalogObject({
        objectKey,
        contentType: parsed.data.content_type
      });
      return NextResponse.json(
        {
          uploadUrl,
          storagePath,
          bucket,
          expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
          provider: "r2" as const
        },
        { status: 200 }
      );
    }

    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      return badRequest(bucketsError.message);
    }

    const bucketExists = (buckets ?? []).some((existingBucket) => {
      return existingBucket.id === bucket || existingBucket.name === bucket;
    });

    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
        public: false
      });

      if (createBucketError) {
        return badRequest(createBucketError.message);
      }
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
    if (error || !data) {
      return badRequest(error?.message ?? "Failed to create signed upload URL");
    }

    return NextResponse.json(
      {
        uploadUrl: data.signedUrl,
        storagePath,
        bucket,
        expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
        token: data.token,
        provider: "supabase" as const
      },
      { status: 200 }
    );
  } catch (error) {
    return serverError(
      "Unexpected error creating studio print upload URL",
      error instanceof Error ? error.message : error
    );
  }
}
