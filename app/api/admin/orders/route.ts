import { assertAdminFromRequest } from "@/lib/auth/admin";
import { listAdminOrders } from "@/lib/admin/orders";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum([
      "pending_payment",
      "paid",
      "in_production",
      "ready_to_ship",
      "shipped",
      "delivered",
      "canceled",
      "refunded",
      "payment_failed"
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(250).optional().default(20),
  cursor: z.string().optional()
});

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return badRequest("Invalid query params", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const result = await listAdminOrders(supabase, {
      status: parsed.data.status,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error listing orders", error instanceof Error ? error.message : error);
  }
}
