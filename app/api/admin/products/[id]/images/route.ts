import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getAdminProductRow } from "@/lib/admin/products";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { ensureCatalogGridVariantInR2 } from "@/lib/server/catalog-grid-variant";
import { resolveStorefrontProductImageReadUrls } from "@/lib/storefront/storefront-media-url";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  storage_path: z.string().min(1),
  alt_text: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional().default(0),
  is_primary: z.boolean().optional().default(false),
  variant_id: z.string().uuid().nullable().optional()
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
    const signedUrlByPath = await resolveStorefrontProductImageReadUrls(
      supabase,
      images.map((image) => image.storage_path),
      { signedUrlTtlSec: 3600 }
    );

    const imagesWithSignedUrls = images.map((image) => ({
      ...image,
      signed_url: signedUrlByPath[image.storage_path] ?? null
    }));

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

    if (parsed.data.variant_id) {
      const { data: variantRow, error: variantError } = await supabase
        .from("product_variants")
        .select("id")
        .eq("id", parsed.data.variant_id)
        .eq("product_id", id)
        .maybeSingle();
      if (variantError) {
        return badRequest(variantError.message);
      }
      if (!variantRow) {
        return badRequest("variant_id does not belong to this product");
      }
    }

    const { data, error } = await supabase
      .from("product_images")
      .insert({
        product_id: id,
        storage_path: storagePath,
        alt_text: parsed.data.alt_text ?? null,
        sort_order: parsed.data.sort_order,
        is_primary: parsed.data.is_primary,
        variant_id: parsed.data.variant_id ?? null
      })
      .select("*")
      .single();

    if (error || !data) {
      return badRequest(error?.message ?? "Failed to create product image");
    }

    void ensureCatalogGridVariantInR2(storagePath).catch(() => {
      /* grid variant is best-effort; storefront falls back to master URL */
    });

    return NextResponse.json({ image: data }, { status: 201 });
  } catch (error) {
    return serverError("Unexpected error creating product image", error instanceof Error ? error.message : error);
  }
}
