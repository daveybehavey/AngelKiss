import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getAdminProductDetail, listAdminProducts } from "@/lib/admin/products";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const customDetailsSchema = z.object({
  template_image_path: z.string().min(1),
  default_blank_color: z.string().min(1).default("white"),
  safe_area_x: z.number().int().nonnegative(),
  safe_area_y: z.number().int().nonnegative(),
  safe_area_width: z.number().int().positive(),
  safe_area_height: z.number().int().positive(),
  max_upload_mb: z.number().int().positive().default(20),
  allow_image_upload: z.boolean().default(true),
  allow_text_overlay: z.boolean().default(true),
  max_text_layers: z.number().int().nonnegative().default(3),
  allowed_fonts: z.array(z.string().min(1)).default(["Arial", "Montserrat", "Playfair Display"])
});

const handmadeDetailsSchema = z.object({
  material: z.string().min(1),
  care_instructions: z.string().optional(),
  lead_time_days: z.number().int().nonnegative().default(7),
  personalization_available: z.boolean().default(false)
});

const bodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(["custom_sublimation", "handmade_crochet_knit"]),
  short_description: z.string().optional(),
  long_description: z.string().optional(),
  base_price_cents: z.number().int().positive(),
  currency: z.string().length(3).default("USD"),
  inventory_mode: z.enum(["finite", "made_to_order"]),
  stock_quantity: z.number().int().nonnegative().nullable().optional(),
  low_stock_threshold: z.number().int().nonnegative().default(2),
  is_available: z.boolean().default(true),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
  custom_sublimation_details: customDetailsSchema.optional(),
  handmade_details: handmadeDetailsSchema.optional()
});

const querySchema = z.object({
  category: z.enum(["custom_sublimation", "handmade_crochet_knit"]).optional(),
  status: z.enum(["draft", "published", "unpublished"]).optional(),
  inventory_filter: z.enum(["all", "low_stock", "out_of_stock"]).optional().default("all"),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional()
});

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return badRequest("Invalid query params", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const result = await listAdminProducts(supabase, {
      category: parsed.data.category,
      status: parsed.data.status,
      inventoryFilter: parsed.data.inventory_filter,
      q: parsed.data.q,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });

    return NextResponse.json(result);
  } catch (error) {
    return serverError("Unexpected error listing products", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const payload = await request.json();
    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const body = parsed.data;

    if (body.category === "custom_sublimation" && !body.custom_sublimation_details) {
      return badRequest("custom_sublimation_details is required for custom_sublimation products");
    }

    if (body.category === "handmade_crochet_knit" && !body.handmade_details) {
      return badRequest("handmade_details is required for handmade_crochet_knit products");
    }

    if (body.inventory_mode === "made_to_order" && body.stock_quantity !== null && body.stock_quantity !== undefined) {
      return badRequest("stock_quantity must be null/omitted for made_to_order products");
    }

    if (body.inventory_mode === "finite" && (body.stock_quantity === null || body.stock_quantity === undefined)) {
      return badRequest("stock_quantity is required for finite products");
    }

    const supabase = getSupabaseAdminClient();

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        name: body.name,
        slug: body.slug,
        category: body.category,
        short_description: body.short_description ?? null,
        long_description: body.long_description ?? null,
        base_price_cents: body.base_price_cents,
        currency: body.currency.toUpperCase(),
        inventory_mode: body.inventory_mode,
        stock_quantity: body.inventory_mode === "finite" ? body.stock_quantity : null,
        low_stock_threshold: body.low_stock_threshold,
        is_available: body.is_available,
        status: body.status
      })
      .select("id")
      .single();

    if (productError || !product) {
      return badRequest(productError?.message ?? "Failed to create product");
    }

    if (body.category === "custom_sublimation") {
      const details = body.custom_sublimation_details!;
      const { error: detailsError } = await supabase.from("custom_sublimation_products").insert({
        product_id: product.id,
        template_image_path: details.template_image_path,
        default_blank_color: details.default_blank_color,
        safe_area_x: details.safe_area_x,
        safe_area_y: details.safe_area_y,
        safe_area_width: details.safe_area_width,
        safe_area_height: details.safe_area_height,
        max_upload_mb: details.max_upload_mb,
        allow_image_upload: details.allow_image_upload,
        allow_text_overlay: details.allow_text_overlay,
        max_text_layers: details.max_text_layers,
        allowed_fonts: details.allowed_fonts
      });

      if (detailsError) {
        await supabase.from("products").delete().eq("id", product.id);
        return badRequest(detailsError.message);
      }
    }

    if (body.category === "handmade_crochet_knit") {
      const details = body.handmade_details!;
      const { error: detailsError } = await supabase.from("handmade_products").insert({
        product_id: product.id,
        material: details.material,
        care_instructions: details.care_instructions ?? null,
        lead_time_days: details.lead_time_days,
        personalization_available: details.personalization_available
      });

      if (detailsError) {
        await supabase.from("products").delete().eq("id", product.id);
        return badRequest(detailsError.message);
      }
    }

    const detail = await getAdminProductDetail(supabase, product.id);
    if (!detail) {
      return serverError("Product created but could not be reloaded");
    }

    return NextResponse.json({ product: detail }, { status: 201 });
  } catch (error) {
    return serverError("Unexpected error creating product", error instanceof Error ? error.message : error);
  }
}
