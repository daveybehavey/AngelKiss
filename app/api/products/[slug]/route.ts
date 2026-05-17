import { notFound, serverError } from "@/lib/http/json";
import { loadCachedPublicProductBySlug } from "@/lib/server/storefront-data-cache";
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

    const product = await loadCachedPublicProductBySlug(normalizedSlug);
    if (!product) {
      return notFound("Product not found");
    }

    return NextResponse.json(
      { product },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600"
        }
      }
    );
  } catch (error) {
    return serverError("Unexpected error loading public product", error instanceof Error ? error.message : error);
  }
}
