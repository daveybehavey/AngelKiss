import { deleteStudioPrintGroup, updateStudioPrintGroup } from "@/lib/admin/studio-print-groups";
import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(80)
      .optional(),
    description: z.string().trim().max(500).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
    print_ids: z.array(z.string().uuid()).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

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

    const supabase = getSupabaseAdminClient();
    const group = await updateStudioPrintGroup(supabase, id, parsed.data);
    return NextResponse.json({ group }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate") || message.includes("unique")) {
      return badRequest(message);
    }
    return serverError("Unexpected error updating studio print group", message);
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
    await deleteStudioPrintGroup(supabase, id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error deleting studio print group",
      error instanceof Error ? error.message : error
    );
  }
}
