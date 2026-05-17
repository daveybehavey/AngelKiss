import { resolveStorefrontProductImageReadUrls } from "@/lib/storefront/storefront-media-url";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StudioPrintRow = {
  id: string;
  title: string;
  subtitle: string | null;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_active: boolean;
  primary_cta_slug: string | null;
  /** Stored asset dimensions (px); both set or both null. Used for homepage aspect ratio. */
  image_width?: number | null;
  image_height?: number | null;
  /** Comma-separated; used for /gallery search only, not shown on tiles. */
  search_tags?: string | null;
  created_at: string;
  updated_at: string;
};

/** Public listing: includes `storage_path` so cart/checkout can round-trip the chosen asset (validated server-side). */
export type PublicStudioPrint = StudioPrintRow & {
  image_url: string | null;
};

/** Admin: every row (including inactive) with URLs for thumbnails. */
export async function listStudioPrintsAdmin(supabase: SupabaseClient): Promise<PublicStudioPrint[]> {
  const { data, error } = await supabase
    .from("sublimation_studio_prints")
    .select(
      "id,title,subtitle,storage_path,alt_text,sort_order,is_active,primary_cta_slug,image_width,image_height,search_tags,created_at,updated_at"
    )
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load studio prints");
  }

  const rows = (data ?? []) as StudioPrintRow[];
  const signed = await resolveStorefrontProductImageReadUrls(
    supabase,
    rows.map((r) => r.storage_path),
    { signedUrlTtlSec: 3600 }
  );

  return rows.map((row) => ({
    ...row,
    image_url: signed[row.storage_path] ?? null
  }));
}

export async function listActiveStudioPrints(supabase: SupabaseClient): Promise<PublicStudioPrint[]> {
  const { data, error } = await supabase
    .from("sublimation_studio_prints")
    .select(
      "id,title,subtitle,storage_path,alt_text,sort_order,is_active,primary_cta_slug,image_width,image_height,search_tags,created_at,updated_at"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load studio prints");
  }

  const activeRows = (data ?? []) as StudioPrintRow[];
  const signedActive = await resolveStorefrontProductImageReadUrls(
    supabase,
    activeRows.map((r) => r.storage_path)
  );

  return activeRows.map((row) => ({
    ...row,
    image_url: signedActive[row.storage_path] ?? null
  }));
}

export async function getActiveStudioPrintById(
  supabase: SupabaseClient,
  id: string
): Promise<PublicStudioPrint | null> {
  const { data, error } = await supabase
    .from("sublimation_studio_prints")
    .select(
      "id,title,subtitle,storage_path,alt_text,sort_order,is_active,primary_cta_slug,image_width,image_height,search_tags,created_at,updated_at"
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as StudioPrintRow;
  const signed = await resolveStorefrontProductImageReadUrls(supabase, [row.storage_path]);
  return {
    ...row,
    image_url: signed[row.storage_path] ?? null
  };
}

/** Checkout: verify id + path match an active row (call with service role). */
export async function assertStudioPrintCheckoutSelection(
  supabase: SupabaseClient,
  id: string,
  storagePath: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("sublimation_studio_prints")
    .select("id")
    .eq("id", id)
    .eq("storage_path", storagePath.trim())
    .eq("is_active", true)
    .maybeSingle();

  return !error && Boolean(data);
}
