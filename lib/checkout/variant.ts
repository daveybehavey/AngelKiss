import type { PublicProductVariant } from "@/lib/storefront/product-variants";
import { z } from "zod";

const variantPayloadSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(80),
    slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(80)
  })
  .strict();

export function appendVariantToCustomization(
  customization: Record<string, unknown>,
  variantCustomization: Record<string, unknown>
): Record<string, unknown> {
  if (
    variantCustomization.variant !== undefined &&
    variantCustomization.variant !== null &&
    typeof variantCustomization.variant === "object"
  ) {
    return { ...customization, variant: variantCustomization.variant };
  }
  return customization;
}

export function mergeVariantIntoCustomization(
  customization: Record<string, unknown>,
  variant: { id: string; label: string; slug: string } | null
): Record<string, unknown> {
  if (!variant) {
    const { variant: _removed, ...rest } = customization;
    return rest;
  }
  return { ...customization, variant };
}

export function validateProductVariantSelection(
  customizationInput: Record<string, unknown> | undefined,
  variants: PublicProductVariant[]
): { ok: true; customization: Record<string, unknown> } | { ok: false; message: string } {
  const raw = customizationInput ?? {};
  const hasVariantKey = raw.variant !== undefined && raw.variant !== null;

  if (variants.length === 0) {
    if (hasVariantKey) {
      return { ok: false, message: "This product does not offer color options" };
    }
    return { ok: true, customization: {} };
  }

  if (!hasVariantKey) {
    return { ok: false, message: "Please choose a color option" };
  }

  const parsed = variantPayloadSchema.safeParse(raw.variant);
  if (!parsed.success) {
    return { ok: false, message: "Invalid color option" };
  }

  const allowed = variants.find((v) => v.id === parsed.data.id);
  if (!allowed || allowed.slug !== parsed.data.slug) {
    return { ok: false, message: "Selected color is not available" };
  }

  return {
    ok: true,
    customization: mergeVariantIntoCustomization(raw as Record<string, unknown>, {
      id: allowed.id,
      label: allowed.label,
      slug: allowed.slug
    })
  };
}
