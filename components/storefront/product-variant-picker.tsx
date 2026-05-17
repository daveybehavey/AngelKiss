"use client";

import { formatStorefrontMoney } from "@/lib/storefront/product-display";
import { resolveVariantUnitPriceCents, type PublicProductVariant } from "@/lib/storefront/product-variants";
import { useMemo } from "react";

type ProductVariantPickerProps = {
  variants: PublicProductVariant[];
  basePriceCents: number;
  currency: string;
  selectedVariantId: string | null;
  onSelect: (variant: PublicProductVariant) => void;
  disabled?: boolean;
};

export function ProductVariantPicker({
  variants,
  basePriceCents,
  currency,
  selectedVariantId,
  onSelect,
  disabled = false
}: ProductVariantPickerProps) {
  const selected = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId]
  );

  if (variants.length === 0) {
    return null;
  }

  const displayPrice = selected
    ? resolveVariantUnitPriceCents(basePriceCents, selected)
    : basePriceCents;

  return (
    <section className="product-variant-picker" aria-label="Color or style options">
      <h2 className="product-variant-picker-title">Color / style</h2>
      <div className="product-variant-swatches" role="list">
        {variants.map((variant) => {
          const active = variant.id === (selectedVariantId ?? variants[0]?.id);
          const price = resolveVariantUnitPriceCents(basePriceCents, variant);
          return (
            <button
              key={variant.id}
              type="button"
              role="listitem"
              className={`product-variant-swatch ${active ? "is-active" : ""}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(variant)}
            >
              <span className="product-variant-swatch-label">{variant.label}</span>
              {price !== basePriceCents ? (
                <span className="product-variant-swatch-price">
                  {formatStorefrontMoney(price, currency)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {selected ? (
        <p className="product-variant-picker-note" aria-live="polite">
          Selected: <strong>{selected.label}</strong>
          {" · "}
          {formatStorefrontMoney(displayPrice, currency)}
        </p>
      ) : null}
    </section>
  );
}
