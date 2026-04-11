import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getAdminOrderDetail } from "@/lib/admin/orders";
import { notFound, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
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

    const order = await getAdminOrderDetail(supabase, id);
    if (!order) {
      return notFound("Order not found");
    }

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error loading order", error instanceof Error ? error.message : error);
  }
}
