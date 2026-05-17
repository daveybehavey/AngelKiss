import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductVariantRow = {
  id: string;
  product_id: string;
  label: string;
  slug: string;
  price_cents: number | null;
  sort_order: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicProductVariant = ProductVariantRow;

export async function listVariantsForProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<PublicProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id,product_id,label,slug,price_cents,sort_order,is_available,created_at,updated_at")
    .eq("product_id", productId)
    .eq("is_available", true)
    .order("sort_order", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load product variants");
  }

  return (data ?? []) as PublicProductVariant[];
}

export async function listVariantsForProducts(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, PublicProductVariant[]>> {
  const map = new Map<string, PublicProductVariant[]>();
  if (productIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("product_variants")
    .select("id,product_id,label,slug,price_cents,sort_order,is_available,created_at,updated_at")
    .in("product_id", productIds)
    .eq("is_available", true)
    .order("sort_order", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load product variants");
  }

  for (const row of (data ?? []) as PublicProductVariant[]) {
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
  }

  return map;
}

export function resolveVariantUnitPriceCents(
  basePriceCents: number,
  variant: PublicProductVariant | null | undefined
): number {
  if (variant?.price_cents != null && variant.price_cents > 0) {
    return variant.price_cents;
  }
  return basePriceCents;
}
