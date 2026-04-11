import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  delta: z.number().int().refine((value) => value !== 0, {
    message: "delta must not be 0"
  }),
  reason: z.enum(["manual_adjustment", "restock", "correction"]),
  note: z.string().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let adminUserId: string;

    try {
      const auth = await assertAdminFromRequest(request);
      adminUserId = auth.userId;
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("adjust_product_inventory", {
      p_product_id: id,
      p_delta: parsed.data.delta,
      p_reason: parsed.data.reason,
      p_note: parsed.data.note ?? null,
      p_created_by: adminUserId
    });

    if (error) {
      return badRequest(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return serverError("Inventory adjustment returned no result");
    }

    return NextResponse.json(
      {
        id: row.product_id,
        inventory_mode: "finite",
        stock_quantity: row.stock_quantity,
        reserved_quantity: row.reserved_quantity,
        available_quantity: row.available_quantity
      },
      { status: 200 }
    );
  } catch (error) {
    return serverError(
      "Unexpected error adjusting inventory",
      error instanceof Error ? error.message : error
    );
  }
}
