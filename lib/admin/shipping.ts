import type { SupabaseClient } from "@supabase/supabase-js";

export type ShippingZone = "local" | "regional" | "national" | "usa";

type StoreSettingsRow = {
  id: boolean;
  free_shipping_enabled: boolean;
  free_shipping_threshold_cents: number;
};

type StoreShippingOriginRow = {
  id: boolean;
  country_code: string;
  province_code: string;
  city: string;
  postal_code: string;
};

type ShippingRateRuleRow = {
  id: string;
  zone: ShippingZone;
  shipping_cents: number;
  is_active: boolean;
  label: string;
  sort_order: number;
};

export type ShippingSettingsOrigin = {
  country_code: string;
  province_code: string;
  city: string;
  postal_code: string;
};

export type ShippingSettingsResponse = {
  free_shipping_enabled: boolean;
  free_shipping_threshold_cents: number;
  origin: ShippingSettingsOrigin;
};

export type ShippingRateRule = {
  id: string;
  zone: ShippingZone;
  shipping_cents: number;
  is_active: boolean;
  label: string;
  sort_order: number;
};

export type ShippingRateRulesResponse = {
  rules: ShippingRateRule[];
};

export type ShippingSettingsPatch = {
  free_shipping_enabled?: boolean;
  free_shipping_threshold_cents?: number;
  origin?: ShippingSettingsOrigin;
};

export type ShippingRateRulePatch = {
  id?: string;
  zone: ShippingZone;
  shipping_cents: number;
  is_active?: boolean;
  label?: string;
  sort_order?: number;
};

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function normalizeOriginInput(origin: ShippingSettingsOrigin): ShippingSettingsOrigin {
  return {
    country_code: origin.country_code.trim().toUpperCase(),
    province_code: origin.province_code.trim().toUpperCase(),
    city: origin.city.trim(),
    postal_code: origin.postal_code.trim().toUpperCase()
  };
}

function mapShippingRule(row: ShippingRateRuleRow): ShippingRateRule {
  return {
    id: row.id,
    zone: row.zone,
    shipping_cents: row.shipping_cents,
    is_active: row.is_active,
    label: row.label,
    sort_order: row.sort_order
  };
}

function defaultLabelForZone(zone: ShippingZone): string {
  if (zone === "local") return "Local shipping";
  if (zone === "regional") return "Regional shipping";
  if (zone === "national") return "Across Canada shipping";
  return "USA tracked shipping";
}

function defaultSortOrderForZone(zone: ShippingZone): number {
  if (zone === "local") return 10;
  if (zone === "regional") return 20;
  if (zone === "national") return 30;
  return 40;
}

async function ensureStoreSettingsRow(supabase: SupabaseClient): Promise<StoreSettingsRow> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("id,free_shipping_enabled,free_shipping_threshold_cents")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to load store settings"));
  }

  if (data) {
    return data as StoreSettingsRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("store_settings")
    .upsert({ id: true }, { onConflict: "id" })
    .select("id,free_shipping_enabled,free_shipping_threshold_cents")
    .single();

  if (insertError || !inserted) {
    throw new Error(safeErrorMessage(insertError, "Failed to initialize store settings"));
  }

  return inserted as StoreSettingsRow;
}

async function ensureStoreShippingOriginRow(
  supabase: SupabaseClient
): Promise<StoreShippingOriginRow> {
  const { data, error } = await supabase
    .from("store_shipping_origin")
    .select("id,country_code,province_code,city,postal_code")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to load shipping origin"));
  }

  if (data) {
    return data as StoreShippingOriginRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("store_shipping_origin")
    .upsert({ id: true }, { onConflict: "id" })
    .select("id,country_code,province_code,city,postal_code")
    .single();

  if (insertError || !inserted) {
    throw new Error(safeErrorMessage(insertError, "Failed to initialize shipping origin"));
  }

  return inserted as StoreShippingOriginRow;
}

export async function getAdminShippingSettings(
  supabase: SupabaseClient
): Promise<ShippingSettingsResponse> {
  const [settings, origin] = await Promise.all([
    ensureStoreSettingsRow(supabase),
    ensureStoreShippingOriginRow(supabase)
  ]);

  return {
    free_shipping_enabled: settings.free_shipping_enabled,
    free_shipping_threshold_cents: settings.free_shipping_threshold_cents,
    origin: {
      country_code: origin.country_code,
      province_code: origin.province_code,
      city: origin.city,
      postal_code: origin.postal_code
    }
  };
}

export async function updateAdminShippingSettings(
  supabase: SupabaseClient,
  patch: ShippingSettingsPatch
): Promise<ShippingSettingsResponse> {
  await Promise.all([ensureStoreSettingsRow(supabase), ensureStoreShippingOriginRow(supabase)]);

  if (patch.free_shipping_enabled !== undefined || patch.free_shipping_threshold_cents !== undefined) {
    const settingsUpdate: Record<string, unknown> = {};
    if (patch.free_shipping_enabled !== undefined) {
      settingsUpdate.free_shipping_enabled = patch.free_shipping_enabled;
    }
    if (patch.free_shipping_threshold_cents !== undefined) {
      settingsUpdate.free_shipping_threshold_cents = patch.free_shipping_threshold_cents;
    }

    const { error: updateSettingsError } = await supabase
      .from("store_settings")
      .update(settingsUpdate)
      .eq("id", true);

    if (updateSettingsError) {
      throw new Error(safeErrorMessage(updateSettingsError, "Failed to update store settings"));
    }
  }

  if (patch.origin) {
    const normalizedOrigin = normalizeOriginInput(patch.origin);
    const { error: updateOriginError } = await supabase
      .from("store_shipping_origin")
      .update(normalizedOrigin)
      .eq("id", true);

    if (updateOriginError) {
      throw new Error(safeErrorMessage(updateOriginError, "Failed to update shipping origin"));
    }
  }

  return getAdminShippingSettings(supabase);
}

export async function listAdminShippingRateRules(
  supabase: SupabaseClient
): Promise<ShippingRateRulesResponse> {
  const { data, error } = await supabase
    .from("shipping_rate_rules")
    .select("id,zone,shipping_cents,is_active,label,sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(safeErrorMessage(error, "Failed to list shipping rate rules"));
  }

  const rows = (data ?? []) as ShippingRateRuleRow[];
  return {
    rules: rows.map(mapShippingRule)
  };
}

export async function updateAdminShippingRateRules(
  supabase: SupabaseClient,
  rules: ShippingRateRulePatch[]
): Promise<ShippingRateRulesResponse> {
  const { data: currentData, error: currentError } = await supabase
    .from("shipping_rate_rules")
    .select("id,zone,shipping_cents,is_active,label,sort_order");

  if (currentError) {
    throw new Error(safeErrorMessage(currentError, "Failed to load shipping rate rules"));
  }

  const currentRows = (currentData ?? []) as ShippingRateRuleRow[];
  const currentByZone = new Map<ShippingZone, ShippingRateRuleRow>(
    currentRows.map((row) => [row.zone, row])
  );

  for (const rule of rules) {
    const existing = currentByZone.get(rule.zone);
    if (rule.id && existing && rule.id !== existing.id) {
      throw new Error(`Rule id does not match existing rule for zone ${rule.zone}`);
    }
  }

  const upsertPayload = rules.map((rule) => {
    const existing = currentByZone.get(rule.zone);
    return {
      zone: rule.zone,
      shipping_cents: rule.shipping_cents,
      is_active: rule.is_active ?? existing?.is_active ?? true,
      label: rule.label ?? existing?.label ?? defaultLabelForZone(rule.zone),
      sort_order: rule.sort_order ?? existing?.sort_order ?? defaultSortOrderForZone(rule.zone)
    };
  });

  const { error: upsertError } = await supabase
    .from("shipping_rate_rules")
    .upsert(upsertPayload, { onConflict: "zone" });

  if (upsertError) {
    throw new Error(safeErrorMessage(upsertError, "Failed to update shipping rate rules"));
  }

  return listAdminShippingRateRules(supabase);
}
