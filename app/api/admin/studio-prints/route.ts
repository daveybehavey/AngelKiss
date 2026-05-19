import { assertAdminFromRequest } from "@/lib/auth/admin";
import { STUDIO_GALLERY_STORAGE_PREFIX } from "@/lib/admin/images";
import { ensureCatalogGridVariantInR2 } from "@/lib/server/catalog-grid-variant";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { formatSearchTagsForStorage } from "@/lib/storefront/parse-studio-print-search-tags";
import { listStudioPrintsAdmin } from "@/lib/storefront/studio-prints";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(300).nullable().optional(),
    storage_path: z.string().trim().min(1).max(512),
    alt_text: z.string().trim().max(300).nullable().optional(),
    sort_order: z.number().int().optional().default(0),
    primary_cta_slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(120)
      .nullable()
      .optional(),
    is_active: z.boolean().optional().default(true),
    image_width: z.number().int().positive().max(32000).optional(),
    image_height: z.number().int().positive().max(32000).optional(),
    search_tags: z.string().trim().max(500).nullable().optional()
  })
  .refine(
    (d) =>
      (d.image_width === undefined && d.image_height === undefined) ||
      (d.image_width !== undefined && d.image_height !== undefined),
    { message: "image_width and image_height must both be provided or both omitted" }
  );

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const supabase = getSupabaseAdminClient();
    const prints = await listStudioPrintsAdmin(supabase);

    return NextResponse.json({ prints }, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error listing studio prints",
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

    const body = parsed.data;
    if (!body.storage_path.trim().startsWith(STUDIO_GALLERY_STORAGE_PREFIX)) {
      return badRequest(`storage_path must start with ${STUDIO_GALLERY_STORAGE_PREFIX}`);
    }

    const supabase = getSupabaseAdminClient();
    const insertRow: Record<string, unknown> = {
      title: body.title,
      subtitle: body.subtitle ?? null,
      storage_path: body.storage_path.trim(),
      alt_text: body.alt_text ?? null,
      sort_order: body.sort_order,
      primary_cta_slug: body.primary_cta_slug ?? null,
      is_active: body.is_active,
      search_tags: formatSearchTagsForStorage(body.search_tags ?? null)
    };
    if (body.image_width !== undefined && body.image_height !== undefined) {
      insertRow.image_width = body.image_width;
      insertRow.image_height = body.image_height;
    }

    const { data, error } = await supabase
      .from("sublimation_studio_prints")
      .insert(insertRow)
      .select(
        "id,title,subtitle,storage_path,alt_text,sort_order,is_active,primary_cta_slug,image_width,image_height,search_tags,created_at,updated_at"
      )
      .single();

    if (error || !data) {
      return badRequest(error?.message ?? "Failed to create studio print");
    }

    void ensureCatalogGridVariantInR2(body.storage_path.trim()).catch(() => {
      /* best-effort */
    });

    return NextResponse.json({ print: data }, { status: 201 });
  } catch (error) {
    return serverError(
      "Unexpected error creating studio print",
      error instanceof Error ? error.message : error
    );
  }
}
