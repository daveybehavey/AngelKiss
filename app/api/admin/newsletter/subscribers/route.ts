import { serverError, unauthorized } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError } from "@/lib/observability/log";
import { assertAdminFromRequest } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    await assertAdminFromRequest(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(500, Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 100 : 100));

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("email, created_at, source")
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logError("admin.newsletter.list_failed", error, requestMeta);
      return serverError("Failed to load subscribers", error.message);
    }

    const rows = (data ?? []) as Array<{ email: string; created_at: string; source: string }>;

    return NextResponse.json({
      count: rows.length,
      items: rows
    });
  } catch (error) {
    return serverError(
      "Unexpected error",
      error instanceof Error ? error.message : error
    );
  }
}
