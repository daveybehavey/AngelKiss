import { assertAdminFromRequest } from "@/lib/auth/admin";
import {
  getAdminShippingSettings,
  updateAdminShippingSettings
} from "@/lib/admin/shipping";
import { validateShippingOriginInput } from "@/lib/admin/shipping-validation";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getRequestMeta } from "@/lib/http/request-meta";
import { logError, logWarn } from "@/lib/observability/log";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const originSchema = z.object({
  country_code: z.string().trim().length(2),
  province_code: z.string().trim().min(1).max(32),
  city: z.string().trim().min(1).max(120),
  postal_code: z.string().trim().min(1).max(32)
});

const patchBodySchema = z
  .object({
    free_shipping_enabled: z.boolean().optional(),
    free_shipping_threshold_cents: z.number().int().nonnegative().optional(),
    origin: originSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const supabase = getSupabaseAdminClient();
    const settings = await getAdminShippingSettings(supabase);
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error loading shipping settings",
      error instanceof Error ? error.message : error
    );
  }
}

export async function PATCH(request: Request) {
  const requestMeta = getRequestMeta(request);

  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      logWarn("admin.shipping_settings.invalid_body", {
        ...requestMeta,
        issues: parsed.error.issues.length
      });
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const patch = parsed.data;
    let normalizedPatch = patch;
    if (patch.origin) {
      const originValidation = validateShippingOriginInput(patch.origin);
      if (!originValidation.ok) {
        logWarn("admin.shipping_settings.invalid_origin", {
          ...requestMeta,
          errors: originValidation.errors
        });
        return badRequest("Invalid shipping origin fields", {
          origin: originValidation.errors
        });
      }
      normalizedPatch = {
        ...patch,
        origin: originValidation.normalized
      };
    }

    const supabase = getSupabaseAdminClient();
    const settings = await updateAdminShippingSettings(supabase, normalizedPatch);
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    logError("admin.shipping_settings.unhandled", error, requestMeta);
    return serverError(
      "Unexpected error updating shipping settings",
      error instanceof Error ? error.message : error
    );
  }
}
