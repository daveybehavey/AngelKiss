import { badRequest, serverError } from "@/lib/http/json";
import { type ProductCategory } from "@/lib/admin/products";
import { listPublicProducts } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  category: z.enum(["custom_sublimation", "handmade_crochet_knit"]).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      category: searchParams.get("category") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined
    });

    if (!parsed.success) {
      return badRequest("Invalid query", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const result = await listPublicProducts(supabase, {
      category: parsed.data.category as ProductCategory | undefined,
      q: parsed.data.q,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error listing public products", error instanceof Error ? error.message : error);
  }
}
