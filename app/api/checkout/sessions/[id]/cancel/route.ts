import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    status: z.enum(["failed", "expired"]).optional()
  })
  .optional();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestMeta = getRequestMeta(request);

  try {
    const { id } = await context.params;
    const parsedBody = bodySchema.safeParse(await request.json().catch(() => undefined));
    if (!parsedBody.success) {
      logWarn("checkout.session.cancel.invalid_body", {
        ...requestMeta,
        checkoutSessionId: id,
        issues: parsedBody.error.issues.length
      });
      return badRequest("Invalid request body", parsedBody.error.flatten());
    }

    const targetStatus = parsedBody.data?.status ?? "failed";

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("cancel_checkout_session", {
      p_checkout_session_id: id,
      p_mark_status: targetStatus
    });

    if (error) {
      logWarn("checkout.session.cancel.rejected", {
        ...requestMeta,
        checkoutSessionId: id,
        message: error.message
      });
      return badRequest(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      logError(
        "checkout.session.cancel.empty_result",
        new Error("No cancel_checkout_session result row"),
        {
          ...requestMeta,
          checkoutSessionId: id
        }
      );
      return serverError("Cancel checkout returned no result");
    }

    return NextResponse.json(
      {
        id: row.id,
        status: row.status
      },
      { status: 200 }
    );
  } catch (error) {
    logError("checkout.session.cancel.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error canceling checkout session",
      error instanceof Error ? error.message : error
    );
  }
}
