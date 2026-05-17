import { loadCachedActiveStudioPrints } from "@/lib/server/storefront-data-cache";
import { serverError } from "@/lib/http/json";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public: active studio prints for homepage + PDP gallery picker (signed image URLs). */
export async function GET() {
  try {
    const prints = await loadCachedActiveStudioPrints();
    return NextResponse.json(
      { prints },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600"
        }
      }
    );
  } catch (error) {
    return serverError(
      "Failed to load studio prints",
      error instanceof Error ? error.message : error
    );
  }
}
