import { assertAdminFromRequest } from "@/lib/auth/admin";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.enum([
    "pending_payment",
    "paid",
    "in_production",
    "ready_to_ship",
    "shipped",
    "delivered",
    "canceled",
    "refunded",
    "payment_failed"
  ]),
  note: z.string().optional(),
  shipment: z
    .object({
      carrier: z.string().trim().min(1).max(120),
      trackingNumber: z.string().trim().min(1).max(120),
      trackingUrl: z.string().trim().max(500).optional()
    })
    .optional()
});

export async function PATCH(
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

    const { data: existing, error: fetchError } = await supabase
      .from("orders")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return badRequest(fetchError.message);
    }

    if (!existing) {
      return notFound("Order not found");
    }

    const fromStatus = existing.status;
    const toStatus = parsed.data.status;
    const shipment = parsed.data.shipment;

    if (toStatus === "shipped" && !shipment) {
      return badRequest("Carrier and tracking number are required when marking an order as shipped");
    }

    if (toStatus !== "shipped" && shipment) {
      return badRequest("Shipment details are only allowed when status is shipped");
    }

    const orderUpdate: Record<string, unknown> = {
      status: toStatus
    };

    if (toStatus === "shipped" && shipment) {
      orderUpdate.shipping_carrier = shipment.carrier;
      orderUpdate.tracking_number = shipment.trackingNumber;
      orderUpdate.tracking_url = shipment.trackingUrl?.trim() || null;

      if (fromStatus !== "shipped") {
        orderUpdate.shipped_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await supabase.from("orders").update(orderUpdate).eq("id", id);
    if (updateError) {
      const updateMessage = updateError.message || "";
      const hasMissingShippingColumns =
        toStatus === "shipped" &&
        (updateMessage.includes("shipping_carrier") ||
          updateMessage.includes("tracking_number") ||
          updateMessage.includes("tracking_url") ||
          updateMessage.includes("shipped_at"));

      if (!hasMissingShippingColumns) {
        return badRequest(updateError.message);
      }

      // Backward-compatible fallback if tracking columns are not migrated yet.
      const { error: fallbackUpdateError } = await supabase
        .from("orders")
        .update({ status: toStatus })
        .eq("id", id);
      if (fallbackUpdateError) {
        return badRequest(fallbackUpdateError.message);
      }
    }

    let note = parsed.data.note?.trim() || null;
    if (toStatus === "shipped" && shipment) {
      const shipmentSummary = `Carrier: ${shipment.carrier}; Tracking: ${shipment.trackingNumber}${
        shipment.trackingUrl ? `; URL: ${shipment.trackingUrl}` : ""
      }`;
      note = note ? `${note} | ${shipmentSummary}` : shipmentSummary;
    }

    const { error: historyError } = await supabase.from("order_status_history").insert({
      order_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: adminUserId,
      note
    });

    if (historyError) {
      return serverError("Order status changed but failed to write history", historyError.message);
    }

    return NextResponse.json({ id, status: toStatus }, { status: 200 });
  } catch (error) {
    return serverError("Unexpected error updating order status", error instanceof Error ? error.message : error);
  }
}
