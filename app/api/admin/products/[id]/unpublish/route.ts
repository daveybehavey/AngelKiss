import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getAdminProductRow } from "@/lib/admin/products";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
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

    const product = await getAdminProductRow(supabase, id);
    if (!product) {
      return notFound("Product not found");
    }

    const { error } = await supabase.from("products").update({ status: "unpublished" }).eq("id", id);
    if (error) {
      return badRequest(error.message);
    }

    return NextResponse.json({ id, status: "unpublished" }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error unpublishing product", error instanceof Error ? error.message : error);
  }
}
