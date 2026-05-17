import { badRequest, serverError } from "@/lib/http/json";
import { loadCachedListPublicProductsForApi } from "@/lib/server/storefront-data-cache";
import { type ProductCategory } from "@/lib/admin/products";
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

    const result = await loadCachedListPublicProductsForApi({
      category: parsed.data.category as ProductCategory | undefined,
      sublimation_mode: parsed.data.sublimation_mode,
      q: parsed.data.q,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600"
      }
    });
  } catch (error) {
    return serverError("Unexpected error listing public products", error instanceof Error ? error.message : error);
  }
}
