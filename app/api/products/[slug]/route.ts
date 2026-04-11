import { notFound, serverError } from "@/lib/http/json";
import { getPublicProductBySlug } from "@/lib/storefront/products";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) {
      return notFound("Product not found");
    }

    const supabase = getSupabaseAdminClient();
    const product = await getPublicProductBySlug(supabase, normalizedSlug);
    if (!product) {
      return notFound("Product not found");
    }

    return NextResponse.json({ product }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error loading public product", error instanceof Error ? error.message : error);
  }
}
