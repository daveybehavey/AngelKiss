import { badRequest, serverError } from "@/lib/http/json";
import { type ProductCategory } from "@/lib/admin/products";
import { listPublicProducts } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  category: z.enum(["custom_sublimation", "handmade_crochet_knit"]).optional(),
  sublimation_mode: z.enum(["customer_upload", "ready_made_design"]).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      category: searchParams.get("category") ?? undefined,
      sublimation_mode: searchParams.get("sublimation_mode") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined
    });

    if (!parsed.success) {
      return badRequest("Invalid query", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const category = parsed.data.category as ProductCategory | undefined;
    const sublimationMode =
      category === "custom_sublimation" ||
      (category === undefined && parsed.data.sublimation_mode !== undefined)
        ? parsed.data.sublimation_mode
        : undefined;
    const result = await listPublicProducts(supabase, {
      category: category ?? (sublimationMode ? "custom_sublimation" : undefined),
      sublimationMode,
      q: parsed.data.q,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
      }
    });
  } catch (error) {
    return serverError("Unexpected error listing public products", error instanceof Error ? error.message : error);
  }
}
