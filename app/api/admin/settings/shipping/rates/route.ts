import { assertAdminFromRequest } from "@/lib/auth/admin";
import {
  listAdminShippingRateRules,
  type ShippingZone,
  updateAdminShippingRateRules
} from "@/lib/admin/shipping";
import { badRequest, serverError, unauthorized } from "@/lib/http/json";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const shippingZoneSchema = z.enum(["local", "regional", "national", "usa"]);

const patchRuleSchema = z.object({
  id: z.string().uuid().optional(),
  zone: shippingZoneSchema,
  shipping_cents: z.number().int().nonnegative(),
  is_active: z.boolean().optional(),
  label: z.string().trim().min(1).max(120).optional(),
  sort_order: z.number().int().optional()
});

const patchBodySchema = z.object({
  rules: z.array(patchRuleSchema).min(1)
});

function hasDuplicateZones(zones: ShippingZone[]): boolean {
  return new Set(zones).size !== zones.length;
}

export async function GET(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const supabase = getSupabaseAdminClient();
    const result = await listAdminShippingRateRules(supabase);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serverError(
      "Unexpected error listing shipping rate rules",
      error instanceof Error ? error.message : error
    );
  }
}

export async function PATCH(request: Request) {
  try {
    try {
      await assertAdminFromRequest(request);
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : "Unauthorized");
    }

    const parsed = patchBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid request body", parsed.error.flatten());
    }

    const zones = parsed.data.rules.map((rule) => rule.zone);
    if (hasDuplicateZones(zones)) {
      return badRequest("Each zone may appear at most once per request");
    }

    const supabase = getSupabaseAdminClient();
    const result = await updateAdminShippingRateRules(supabase, parsed.data.rules);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Rule id does not match existing rule")) {
      return badRequest(error.message);
    }

    return serverError(
      "Unexpected error updating shipping rate rules",
      error instanceof Error ? error.message : error
    );
  }
}
