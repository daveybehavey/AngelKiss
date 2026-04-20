import { badRequest, serverError } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logWarn } from "@/lib/observability/log";
import { normalizeNewsletterEmail } from "@/lib/newsletter/normalize-email";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    email: z.string().min(1).max(320),
    /** Honeypot — must be empty (bots often fill hidden fields) */
    company: z.string().max(200).optional()
  })
  .strict();

export async function POST(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    const json: unknown = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return badRequest("Invalid request", parsed.error.flatten());
    }

    if (parsed.data.company && parsed.data.company.trim().length > 0) {
      logWarn("newsletter.subscribe.honeypot", { ...requestMeta });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const email = normalizeNewsletterEmail(parsed.data.email);
    if (!email) {
      return badRequest("Please enter a valid email address");
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email,
      source: "footer"
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: true, duplicate: true, message: "You are already on the list. Thank you!" },
          { status: 200 }
        );
      }
      logWarn("newsletter.subscribe.insert_failed", { ...requestMeta, message: error.message });
      return serverError("Could not save your signup right now");
    }

    return NextResponse.json(
      {
        ok: true,
        duplicate: false,
        message: "You are on the list! Watch your inbox for restocks and news."
      },
      { status: 201 }
    );
  } catch (error) {
    return serverError(
      "Unexpected error",
      error instanceof Error ? error.message : error
    );
  }
}
