import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  paypalOrderId: z.string().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestMeta = getRequestMeta(request);

  try {
    const { id } = await context.params;
    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      logWarn("checkout.paypal_order.attach.invalid_body", {
        ...requestMeta,
        checkoutSessionId: id,
        issues: parsedBody.error.issues.length
      });
      return badRequest("Invalid request body", parsedBody.error.flatten());
    }

    const supabase = getSupabaseAdminClient();
    const { paypalOrderId } = parsedBody.data;

    const { data: existingSession, error: fetchError } = await supabase
      .from("checkout_sessions")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      logWarn("checkout.paypal_order.attach.fetch_failed", {
        ...requestMeta,
        checkoutSessionId: id,
        message: fetchError.message
      });
      return badRequest(fetchError.message);
    }

    if (!existingSession) {
      logWarn("checkout.paypal_order.attach.not_found", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("Checkout session not found");
    }

    if (existingSession.status === "completed") {
      logWarn("checkout.paypal_order.attach.already_completed", {
        ...requestMeta,
        checkoutSessionId: id
      });
      return badRequest("Checkout session already completed");
    }

    const { error: updateError } = await supabase
      .from("checkout_sessions")
      .update({
        paypal_order_id: paypalOrderId,
        status: "paypal_order_created"
      })
      .eq("id", id);

    if (updateError) {
      logWarn("checkout.paypal_order.attach.update_failed", {
        ...requestMeta,
        checkoutSessionId: id,
        message: updateError.message
      });
      return badRequest(updateError.message);
    }

    return NextResponse.json(
      {
        checkoutSessionId: id,
        paypalOrderId
      },
      { status: 200 }
    );
  } catch (error) {
    logError("checkout.paypal_order.attach.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error attaching PayPal order",
      error instanceof Error ? error.message : error
    );
  }
}
