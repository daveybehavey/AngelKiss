import { createStudioPrintGroup } from "@/lib/admin/studio-print-groups";
import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { listStudioPrintGroupsAdmin } from "@/lib/storefront/studio-print-groups";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(80)
    .optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sort_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
  print_ids: z.array(z.string().uuid()).optional().default([])
});

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const supabase = getSupabaseAdminClient();
    const groups = await listStudioPrintGroupsAdmin(supabase);
    return NextResponse.json({ groups }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error listing studio print groups",
      error instanceof Error ? error.message : error
    );
  }
}

export async function POST(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const parsed = createBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const group = await createStudioPrintGroup(supabase, parsed.data);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate") || message.includes("unique")) {
      return badRequest(message);
    }
    return serverError("Unexpected error creating studio print group", message);
  }
}
