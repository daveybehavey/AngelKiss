import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getProductImagesBucket, normalizeStoragePathForBucket } from "@/lib/admin/images";
import { getAdminProductRow } from "@/lib/admin/products";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  storage_path: z.string().min(1),
  alt_text: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional().default(0),
  is_primary: z.boolean().optional().default(false)
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const product = await getAdminProductRow(supabase, id);
    if (!product) {
      return notFound("Product not found");
    }

    const { data, error } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return badRequest(error.message);
    }

    const images = data ?? [];
    const bucket = getProductImagesBucket();
    const normalizedPaths = images
      .map((image) => normalizeStoragePathForBucket(image.storage_path, bucket))
      .filter((path) => path.length > 0);

    const signedUrlByPath = new Map<string, string>();
    if (normalizedPaths.length > 0) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrls(normalizedPaths, 60 * 60);

      if (signedError) {
        return badRequest(signedError.message);
      }

      for (const row of signedData ?? []) {
        if (row.path && row.signedUrl) {
          signedUrlByPath.set(row.path, row.signedUrl);
        }
      }
    }

    const imagesWithSignedUrls = images.map((image) => {
      const normalizedPath = normalizeStoragePathForBucket(image.storage_path, bucket);
      return {
        ...image,
        signed_url: signedUrlByPath.get(normalizedPath) ?? null
      };
    });

    return NextResponse.json({ images: imagesWithSignedUrls }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error loading product images", error instanceof Error ? error.message : error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const storagePath = parsed.data.storage_path.trim();
    if (!storagePath) {
      return badRequest("storage_path is required");
    }

    const supabase = getSupabaseAdminClient();
    const product = await getAdminProductRow(supabase, id);
    if (!product) {
      return notFound("Product not found");
    }

    if (parsed.data.is_primary) {
      const { error: clearPrimaryError } = await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", id)
        .eq("is_primary", true);

      if (clearPrimaryError) {
        return badRequest(clearPrimaryError.message);
      }
    }

    const { data, error } = await supabase
      .from("product_images")
      .insert({
        product_id: id,
        storage_path: storagePath,
        alt_text: parsed.data.alt_text ?? null,
        sort_order: parsed.data.sort_order,
        is_primary: parsed.data.is_primary
      })
      .select("*")
      .single();

    if (error || !data) {
      return badRequest(error?.message ?? "Failed to create product image");
    }

    return NextResponse.json({ image: data }, { status: 201 });
  } catch (error) {
    return serverError("Unexpected error creating product image", error instanceof Error ? error.message : error);
  }
}
