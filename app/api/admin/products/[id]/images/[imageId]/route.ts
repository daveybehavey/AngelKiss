import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getAdminProductRow } from "@/lib/admin/products";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { deleteCatalogMediaObject } from "@/lib/server/catalog-media-storage";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchBodySchema = z
  .object({
    alt_text: z.string().nullable().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    is_primary: z.boolean().optional(),
    variant_id: z.string().uuid().nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id, imageId } = await context.params;
    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const product = await getAdminProductRow(supabase, id);
    if (!product) {
      return notFound("Product not found");
    }

    const { data: currentImage, error: currentImageError } = await supabase
      .from("product_images")
      .select("id")
      .eq("id", imageId)
      .eq("product_id", id)
      .maybeSingle();

    if (currentImageError) {
      return badRequest(currentImageError.message);
    }

    if (!currentImage) {
      return notFound("Image not found for this product");
    }

    if (parsed.data.is_primary === true) {
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

    const updates: Record<string, unknown> = {};
    if (parsed.data.alt_text !== undefined) updates.alt_text = parsed.data.alt_text;
    if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order;
    if (parsed.data.is_primary !== undefined) updates.is_primary = parsed.data.is_primary;
    if (parsed.data.variant_id !== undefined) updates.variant_id = parsed.data.variant_id;

    const { data, error } = await supabase
      .from("product_images")
      .update(updates)
      .eq("id", imageId)
      .eq("product_id", id)
      .select("*")
      .single();

    if (error || !data) {
      return badRequest(error?.message ?? "Failed to update product image");
    }

    return NextResponse.json({ image: data }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error updating product image", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id, imageId } = await context.params;
    const supabase = getSupabaseAdminClient();

    const product = await getAdminProductRow(supabase, id);
    if (!product) {
      return notFound("Product not found");
    }

    const { data: image, error: imageFetchError } = await supabase
      .from("product_images")
      .select("id,storage_path")
      .eq("id", imageId)
      .eq("product_id", id)
      .maybeSingle();

    if (imageFetchError) {
      return badRequest(imageFetchError.message);
    }

    if (!image) {
      return notFound("Image not found for this product");
    }

    const { error: deleteError } = await supabase
      .from("product_images")
      .delete()
      .eq("id", imageId)
      .eq("product_id", id);

    if (deleteError) {
      return badRequest(deleteError.message);
    }

    await deleteCatalogMediaObject(supabase, image.storage_path);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError("Unexpected error deleting product image", error instanceof Error ? error.message : error);
  }
}
