import { deleteProductVariant, updateProductVariant } from "@/lib/admin/product-variants";
import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(80)
      .optional(),
    price_cents: z.number().int().positive().nullable().optional(),
    sort_order: z.number().int().optional(),
    is_available: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { variantId } = await context.params;
    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const variant = await updateProductVariant(supabase, variantId, parsed.data);
    return NextResponse.json({ variant }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate") || message.includes("unique")) {
      return badRequest(message);
    }
    return serverError("Unexpected error updating product variant", message);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { variantId } = await context.params;
    const supabase = getSupabaseAdminClient();
    await deleteProductVariant(supabase, variantId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error deleting product variant",
      error instanceof Error ? error.message : error
    );
  }
}
