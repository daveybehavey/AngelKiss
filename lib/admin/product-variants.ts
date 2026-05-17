import type { PublicProductVariant } from "@/lib/storefront/product-variants";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function listVariantsForProductAdmin(
  supabase: SupabaseClient,
  productId: string
): Promise<PublicProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id,product_id,label,slug,price_cents,sort_order,is_available,created_at,updated_at")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load product variants");
  }

  return (data ?? []) as PublicProductVariant[];
}

export async function createProductVariant(
  supabase: SupabaseClient,
  productId: string,
  input: {
    label: string;
    slug: string;
    price_cents?: number | null;
    sort_order?: number;
    is_available?: boolean;
  }
): Promise<PublicProductVariant> {
  const { data, error } = await supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      label: input.label.trim(),
      slug: input.slug.trim().toLowerCase(),
      price_cents: input.price_cents ?? null,
      sort_order: input.sort_order ?? 0,
      is_available: input.is_available ?? true
    })
    .select("id,product_id,label,slug,price_cents,sort_order,is_available,created_at,updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create product variant");
  }

  return data as PublicProductVariant;
}

export async function updateProductVariant(
  supabase: SupabaseClient,
  variantId: string,
  patch: {
    label?: string;
    slug?: string;
    price_cents?: number | null;
    sort_order?: number;
    is_available?: boolean;
  }
): Promise<PublicProductVariant> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    row.label = patch.label.trim();
  }
  if (patch.slug !== undefined) {
    row.slug = patch.slug.trim().toLowerCase();
  }
  if (patch.price_cents !== undefined) {
    row.price_cents = patch.price_cents;
  }
  if (patch.sort_order !== undefined) {
    row.sort_order = patch.sort_order;
  }
  if (patch.is_available !== undefined) {
    row.is_available = patch.is_available;
  }

  const { data, error } = await supabase
    .from("product_variants")
    .update(row)
    .eq("id", variantId)
    .select("id,product_id,label,slug,price_cents,sort_order,is_available,created_at,updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to update product variant");
  }

  return data as PublicProductVariant;
}

export async function deleteProductVariant(
  supabase: SupabaseClient,
  variantId: string
): Promise<void> {
  const { error } = await supabase.from("product_variants").delete().eq("id", variantId);
  if (error) {
    throw new Error(error.message || "Failed to delete product variant");
  }
}
