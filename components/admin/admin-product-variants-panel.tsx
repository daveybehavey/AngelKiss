"use client";

import type { AdminToastKind } from "@/components/admin/toast-stack";
import { slugifyLabel } from "@/lib/slugify-label";
import type { PublicProductVariant } from "@/lib/storefront/product-variants";
import { useCallback, useEffect, useState } from "react";

type VariantsResponse = { variants: PublicProductVariant[] };

export type AdminProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  signed_url: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  variant_id: string | null;
  created_at: string;
};

type AdminProductVariantsPanelProps = {
  productId: string;
  basePriceCents: number;
  currency: string;
  callAdmin: (path: string, init?: RequestInit) => Promise<unknown>;
  disabled?: boolean;
  onNotify?: (kind: AdminToastKind, message: string) => void;
  images?: AdminProductImageRow[];
  onImageVariantChange?: () => void;
};

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n * 100);
}

type VariantDraft = {
  label: string;
  slug: string;
  priceDollars: string;
  useCustomPrice: boolean;
  sortOrder: string;
  isAvailable: boolean;
};

function emptyDraft(): VariantDraft {
  return {
    label: "",
    slug: "",
    priceDollars: "",
    useCustomPrice: false,
    sortOrder: "0",
    isAvailable: true
  };
}

function draftFromVariant(variant: PublicProductVariant): VariantDraft {
  return {
    label: variant.label,
    slug: variant.slug,
    priceDollars:
      variant.price_cents != null && variant.price_cents > 0
        ? centsToDollars(variant.price_cents)
        : "",
    useCustomPrice: variant.price_cents != null && variant.price_cents > 0,
    sortOrder: String(variant.sort_order),
    isAvailable: variant.is_available
  };
}

export function AdminProductVariantsPanel({
  productId,
  basePriceCents,
  currency,
  callAdmin,
  disabled = false,
  onNotify,
  images = [],
  onImageVariantChange
}: AdminProductVariantsPanelProps) {
  const [variants, setVariants] = useState<PublicProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [newDraft, setNewDraft] = useState<VariantDraft>(() => emptyDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<VariantDraft>(() => emptyDraft());

  const loadVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await callAdmin(`/api/admin/products/${productId}/variants`)) as VariantsResponse;
      setVariants(res.variants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load color options");
    } finally {
      setLoading(false);
    }
  }, [callAdmin, productId]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  function notify(kind: AdminToastKind, message: string) {
    onNotify?.(kind, message);
  }

  function parseDraft(draft: VariantDraft, forCreate: boolean) {
    if (!draft.label.trim()) {
      throw new Error("Option name is required (e.g. Pink, Navy).");
    }
    const slug = (draft.slug.trim() || slugifyLabel(draft.label)).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error("URL slug may only use lowercase letters, numbers, and hyphens.");
    }
    const sortOrder = Number.parseInt(draft.sortOrder.trim(), 10);
    if (!Number.isFinite(sortOrder)) {
      throw new Error("Sort order must be a whole number.");
    }
    let price_cents: number | null = null;
    if (draft.useCustomPrice) {
      const cents = dollarsToCents(draft.priceDollars);
      if (cents == null) {
        throw new Error("Enter a valid custom price or turn off custom pricing.");
      }
      price_cents = cents;
    }
    return {
      label: draft.label.trim(),
      slug,
      price_cents,
      sort_order: sortOrder,
      is_available: draft.isAvailable,
      forCreate
    };
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = parseDraft(newDraft, true);
      await callAdmin(`/api/admin/products/${productId}/variants`, {
        method: "POST",
        body: JSON.stringify({
          label: payload.label,
          slug: payload.slug,
          price_cents: payload.price_cents,
          sort_order: payload.sort_order,
          is_available: payload.is_available
        })
      });
      setNewDraft(emptyDraft());
      setSlugTouched(false);
      await loadVariants();
      notify("success", `Added “${payload.label}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add option");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(variant: PublicProductVariant) {
    setEditId(variant.id);
    setEditDraft(draftFromVariant(variant));
    setError(null);
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = parseDraft(editDraft, false);
      await callAdmin(`/api/admin/products/${productId}/variants/${editId}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: payload.label,
          slug: payload.slug,
          price_cents: payload.price_cents,
          sort_order: payload.sort_order,
          is_available: payload.is_available
        })
      });
      const savedLabel = payload.label;
      setEditId(null);
      await loadVariants();
      notify("success", `Saved “${savedLabel}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save option");
    } finally {
      setBusy(false);
    }
  }

  async function removeVariant(variantId: string, label: string) {
    if (!window.confirm(`Remove “${label}”? Photos linked to this color become “all colors”.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/admin/products/${productId}/variants/${variantId}`, {
        method: "DELETE"
      });
      if (editId === variantId) {
        setEditId(null);
      }
      await loadVariants();
      onImageVariantChange?.();
      notify("success", `Removed “${label}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove option");
    } finally {
      setBusy(false);
    }
  }

  async function assignImageVariant(imageId: string, variantId: string | null) {
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/admin/products/${productId}/images/${imageId}`, {
        method: "PATCH",
        body: JSON.stringify({ variant_id: variantId })
      });
      onImageVariantChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update photo");
    } finally {
      setBusy(false);
    }
  }

  const basePriceLabel = `${centsToDollars(basePriceCents)} ${currency}`;

  return (
    <div className="admin-product-variants panel">
      <p className="admin-item-line">
        <strong>Color / style options</strong>
      </p>
      <p className="admin-note-tight">
        One listing, multiple colors (e.g. mug in Pink or Blue). Stock is shared for the whole
        product. Leave blank if this item only comes in one look. Shoppers must pick an option
        before adding to cart.
      </p>
      <p className="admin-subtle">
        Base price: {basePriceLabel}. Custom prices override only for that color.
      </p>

      {error ? <p className="admin-inline-error">{error}</p> : null}
      {loading ? <p className="admin-note-tight">Loading options…</p> : null}

      <form onSubmit={(e) => void handleCreate(e)} className="admin-variant-create-form">
        <p className="admin-subtle admin-theme-suggestions-label">Quick add:</p>
        <ul className="admin-theme-suggestions">
          {["Pink", "Blue", "Black", "White", "Rose gold", "Navy"].map((name) => (
            <li key={name}>
              <button
                type="button"
                className="admin-theme-suggestion-chip"
                disabled={busy || disabled}
                onClick={() => {
                  setNewDraft((d) => ({
                    ...d,
                    label: name,
                    slug: slugTouched ? d.slug : slugifyLabel(name)
                  }));
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-variant-create-fields">
          <label className="compactLabel">
            Option name
            <input
              value={newDraft.label}
              onChange={(e) => {
                const label = e.target.value;
                setNewDraft((d) => ({
                  ...d,
                  label,
                  slug: slugTouched ? d.slug : slugifyLabel(label)
                }));
              }}
              placeholder="e.g. Pink"
              disabled={busy || disabled}
            />
          </label>
          <label className="compactLabel">
            URL slug
            <input
              value={newDraft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setNewDraft((d) => ({ ...d, slug: e.target.value }));
              }}
              placeholder="pink"
              disabled={busy || disabled}
            />
          </label>
          <label className="compactLabel">
            Sort order
            <input
              inputMode="numeric"
              value={newDraft.sortOrder}
              onChange={(e) => setNewDraft((d) => ({ ...d, sortOrder: e.target.value }))}
              disabled={busy || disabled}
            />
            <span className="admin-subtle">Higher shows first.</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={newDraft.useCustomPrice}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, useCustomPrice: e.target.checked }))
              }
              disabled={busy || disabled}
            />
            Custom price for this color
          </label>
          {newDraft.useCustomPrice ? (
            <label className="compactLabel">
              Price ({currency})
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newDraft.priceDollars}
                onChange={(e) => setNewDraft((d) => ({ ...d, priceDollars: e.target.value }))}
                disabled={busy || disabled}
              />
            </label>
          ) : null}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={newDraft.isAvailable}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, isAvailable: e.target.checked }))
              }
              disabled={busy || disabled}
            />
            Shoppers can select this color
          </label>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || disabled}>
          Add color option
        </button>
      </form>

      {variants.length > 0 ? (
        <ul className="admin-variant-list">
          {variants.map((variant) => {
            const isEditing = editId === variant.id;
            const linkedPhotos = images.filter((img) => img.variant_id === variant.id).length;
            return (
              <li key={variant.id} className={`admin-variant-row ${isEditing ? "is-editing" : ""}`}>
                {isEditing ? (
                  <div className="admin-variant-edit">
                    <label className="compactLabel">
                      Name
                      <input
                        value={editDraft.label}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, label: e.target.value }))
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="compactLabel">
                      Slug
                      <input
                        value={editDraft.slug}
                        onChange={(e) => setEditDraft((d) => ({ ...d, slug: e.target.value }))}
                        disabled={busy}
                      />
                    </label>
                    <label className="compactLabel">
                      Sort order
                      <input
                        inputMode="numeric"
                        value={editDraft.sortOrder}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, sortOrder: e.target.value }))
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editDraft.useCustomPrice}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, useCustomPrice: e.target.checked }))
                        }
                        disabled={busy}
                      />
                      Custom price
                    </label>
                    {editDraft.useCustomPrice ? (
                      <label className="compactLabel">
                        Price ({currency})
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={editDraft.priceDollars}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...d, priceDollars: e.target.value }))
                          }
                          disabled={busy}
                        />
                      </label>
                    ) : null}
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editDraft.isAvailable}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, isAvailable: e.target.checked }))
                        }
                        disabled={busy}
                      />
                      Available on shop
                    </label>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        onClick={() => setEditId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="admin-variant-summary">
                      <strong>{variant.label}</strong>
                      <span className="admin-muted"> /{variant.slug}</span>
                      {!variant.is_available ? (
                        <span className="admin-studio-print-badge"> Hidden</span>
                      ) : null}
                    </p>
                    <p className="admin-subtle">
                      {variant.price_cents != null && variant.price_cents > 0
                        ? `${centsToDollars(variant.price_cents)} ${currency}`
                        : `Uses base price (${basePriceLabel})`}
                      {" · "}
                      {linkedPhotos} photo{linkedPhotos === 1 ? "" : "s"} for this color
                    </p>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy || disabled}
                        onClick={() => startEdit(variant)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy || disabled}
                        onClick={() => void removeVariant(variant.id, variant.label)}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : !loading ? (
        <p className="admin-note-tight">No color options yet — add one above for mugs, tumblers, etc.</p>
      ) : null}

      {variants.length > 0 && images.length > 0 ? (
        <div className="admin-variant-photo-links">
          <p className="admin-subtle">
            <strong>Link photos to a color</strong> (optional). “All colors” shows for every option.
          </p>
          <ul className="admin-stack-list">
            {images.map((image) => (
              <li key={image.id} className="admin-variant-photo-row">
                {image.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="admin-image-thumb"
                    src={image.signed_url}
                    alt=""
                    width={48}
                    height={48}
                  />
                ) : (
                  <span className="admin-image-thumb admin-image-thumb-empty">—</span>
                )}
                <label className="compactLabel admin-variant-photo-select">
                  Applies to
                  <select
                    value={image.variant_id ?? ""}
                    disabled={busy || disabled}
                    onChange={(e) => {
                      const value = e.target.value;
                      void assignImageVariant(image.id, value.length > 0 ? value : null);
                    }}
                  >
                    <option value="">All colors</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
