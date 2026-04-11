import { assertAdminFromRequest } from "@/lib/auth/admin";
import {
  categoryDetailsExist,
  getAdminProductDetail,
  getAdminProductRow
} from "@/lib/admin/products";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const customDetailsPatchSchema = z
  .object({
    template_image_path: z.string().min(1).optional(),
    default_blank_color: z.string().min(1).optional(),
    safe_area_x: z.number().int().nonnegative().optional(),
    safe_area_y: z.number().int().nonnegative().optional(),
    safe_area_width: z.number().int().positive().optional(),
    safe_area_height: z.number().int().positive().optional(),
    max_upload_mb: z.number().int().positive().optional(),
    allow_image_upload: z.boolean().optional(),
    allow_text_overlay: z.boolean().optional(),
    max_text_layers: z.number().int().nonnegative().optional(),
    allowed_fonts: z.array(z.string().min(1)).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "custom_sublimation_details must include at least one field"
  });

const handmadeDetailsPatchSchema = z
  .object({
    material: z.string().min(1).optional(),
    care_instructions: z.string().nullable().optional(),
    lead_time_days: z.number().int().nonnegative().optional(),
    personalization_available: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "handmade_details must include at least one field"
  });

const patchBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    short_description: z.string().nullable().optional(),
    long_description: z.string().nullable().optional(),
    base_price_cents: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    inventory_mode: z.enum(["finite", "made_to_order"]).optional(),
    stock_quantity: z.number().int().nonnegative().nullable().optional(),
    low_stock_threshold: z.number().int().nonnegative().optional(),
    is_available: z.boolean().optional(),
    status: z.enum(["draft", "published", "unpublished"]).optional(),
    custom_sublimation_details: customDetailsPatchSchema.optional(),
    handmade_details: handmadeDetailsPatchSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
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
    const product = await getAdminProductDetail(supabase, id);

    if (!product) {
      return notFound("Product not found");
    }

    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error loading product", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(
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
    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const body = parsed.data;
    const supabase = getSupabaseAdminClient();
    const current = await getAdminProductRow(supabase, id);

    if (!current) {
      return notFound("Product not found");
    }

    if (current.category === "custom_sublimation" && body.handmade_details) {
      return badRequest("handmade_details cannot be updated for custom_sublimation products");
    }

    if (current.category === "handmade_crochet_knit" && body.custom_sublimation_details) {
      return badRequest("custom_sublimation_details cannot be updated for handmade_crochet_knit products");
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.short_description !== undefined) updates.short_description = body.short_description;
    if (body.long_description !== undefined) updates.long_description = body.long_description;
    if (body.base_price_cents !== undefined) updates.base_price_cents = body.base_price_cents;
    if (body.currency !== undefined) updates.currency = body.currency.toUpperCase();
    if (body.low_stock_threshold !== undefined) updates.low_stock_threshold = body.low_stock_threshold;
    if (body.is_available !== undefined) updates.is_available = body.is_available;
    if (body.status !== undefined) updates.status = body.status;

    const effectiveInventoryMode = body.inventory_mode ?? current.inventory_mode;
    if (effectiveInventoryMode === "made_to_order") {
      if (body.stock_quantity !== undefined && body.stock_quantity !== null) {
        return badRequest("stock_quantity must be null/omitted for made_to_order products");
      }

      if (current.inventory_mode !== "made_to_order" || body.inventory_mode === "made_to_order") {
        updates.inventory_mode = "made_to_order";
        updates.stock_quantity = null;
        updates.reserved_quantity = 0;
      }
    } else {
      let nextStock = current.stock_quantity;

      if (body.stock_quantity !== undefined) {
        if (body.stock_quantity === null) {
          return badRequest("stock_quantity cannot be null for finite products");
        }
        nextStock = body.stock_quantity;
      }

      if (nextStock === null) {
        return badRequest("stock_quantity is required for finite products");
      }

      if (nextStock < current.reserved_quantity) {
        return badRequest("stock_quantity cannot be lower than reserved_quantity");
      }

      if (body.inventory_mode === "finite") {
        updates.inventory_mode = "finite";
      }

      if (body.stock_quantity !== undefined || current.inventory_mode !== "finite") {
        updates.stock_quantity = nextStock;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from("products").update(updates).eq("id", id);

      if (updateError) {
        return badRequest(updateError.message);
      }
    }

    if (body.custom_sublimation_details) {
      const hasDetails = await categoryDetailsExist(supabase, id, "custom_sublimation");
      if (!hasDetails) {
        return badRequest("custom_sublimation_details row is missing for this product");
      }

      const { error: detailsError } = await supabase
        .from("custom_sublimation_products")
        .update(body.custom_sublimation_details)
        .eq("product_id", id);

      if (detailsError) {
        return badRequest(detailsError.message);
      }
    }

    if (body.handmade_details) {
      const hasDetails = await categoryDetailsExist(supabase, id, "handmade_crochet_knit");
      if (!hasDetails) {
        return badRequest("handmade_details row is missing for this product");
      }

      const { error: detailsError } = await supabase
        .from("handmade_products")
        .update(body.handmade_details)
        .eq("product_id", id);

      if (detailsError) {
        return badRequest(detailsError.message);
      }
    }

    const product = await getAdminProductDetail(supabase, id);
    if (!product) {
      return notFound("Product not found after update");
    }

    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error updating product", error instanceof Error ? error.message : error);
  }
}

export async function DELETE(
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

    const { data, error } = await supabase
      .from("products")
      .update({
        deleted_at: new Date().toISOString(),
        status: "unpublished",
        is_available: false
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return badRequest(error.message);
    }

    if (!data) {
      return notFound("Product not found");
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError("Unexpected error deleting product", error instanceof Error ? error.message : error);
  }
}
