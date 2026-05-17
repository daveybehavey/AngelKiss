import {
  createProductVariant,
  listVariantsForProductAdmin
} from "@/lib/admin/product-variants";
import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createBodySchema = z.object({
  label: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  price_cents: z.number().int().positive().nullable().optional(),
  sort_order: z.number().int().optional().default(0),
  is_available: z.boolean().optional().default(true)
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
    const variants = await listVariantsForProductAdmin(supabase, id);
    return NextResponse.json({ variants }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error listing product variants",
      error instanceof Error ? error.message : error
    );
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
    const parsed = createBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const variant = await createProductVariant(supabase, id, parsed.data);
    return NextResponse.json({ variant }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate") || message.includes("unique")) {
      return badRequest(message);
    }
    return serverError("Unexpected error creating product variant", message);
  }
}
