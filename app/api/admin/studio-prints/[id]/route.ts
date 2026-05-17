import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { formatSearchTagsForStorage } from "@/lib/storefront/parse-studio-print-search-tags";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const idParamSchema = z.string().uuid();

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().trim().max(300).nullable().optional(),
    alt_text: z.string().trim().max(300).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
    primary_cta_slug: z
      .union([
        z.string().trim().regex(/^[a-z0-9-]+$/).max(120),
        z.literal(""),
        z.null()
      ])
      .optional(),
    search_tags: z.string().trim().max(500).nullable().optional()
  })
  .strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id: rawId } = await context.params;
    const idParsed = idParamSchema.safeParse(rawId);
    if (!idParsed.success) {
      return badRequest("Invalid print id");
    }
    const id = idParsed.data;

    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const body = parsed.data;
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      updates.title = body.title;
    }
    if (body.subtitle !== undefined) {
      updates.subtitle = body.subtitle;
    }
    if (body.alt_text !== undefined) {
      updates.alt_text = body.alt_text;
    }
    if (body.sort_order !== undefined) {
      updates.sort_order = body.sort_order;
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
    }
    if (body.primary_cta_slug !== undefined) {
      updates.primary_cta_slug =
        body.primary_cta_slug === "" || body.primary_cta_slug === null
          ? null
          : body.primary_cta_slug;
    }
    if (body.search_tags !== undefined) {
      updates.search_tags = formatSearchTagsForStorage(body.search_tags);
    }

    if (Object.keys(updates).length === 0) {
      return badRequest("No fields to update");
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("sublimation_studio_prints")
      .update(updates)
      .eq("id", id)
      .select(
        "id,title,subtitle,storage_path,alt_text,sort_order,is_active,primary_cta_slug,image_width,image_height,search_tags,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      return badRequest(error.message);
    }
    if (!data) {
      return badRequest("Studio print not found");
    }

    return NextResponse.json({ print: data }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error updating studio print",
      error instanceof Error ? error.message : error
    );
  }
}
