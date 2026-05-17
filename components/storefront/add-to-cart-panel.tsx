"use client";

import { useCart } from "@/components/storefront/cart-provider";
import type { ProductCategory } from "@/lib/admin/products";
import { mergeVariantIntoCustomization } from "@/lib/checkout/variant";
import { clampCartQuantity } from "@/lib/storefront/cart";
import { ProductVariantPicker } from "@/components/storefront/product-variant-picker";
import {
  resolveVariantUnitPriceCents,
  type PublicProductVariant
} from "@/lib/storefront/product-variants";
import {
  STUDIO_PRINT_SESSION_STORAGE_KEY,
  shopHrefForStudioPrint,
  studioPrintImageSrcForNextImage,
  studioPrintImageUnoptimized
} from "@/lib/storefront/studio-print-client";
import { sortStudioPrintsWithSelectedFirst } from "@/lib/storefront/sort-studio-prints";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** Initial chunk of studio prints on product page; "Show more" loads the rest in pages. */
const STUDIO_PRINT_PAGE_SIZE = 24;

export type AddToCartPanelProps = {
  product: {
    id: string;
    slug: string;
    name: string;
    category: ProductCategory;
    base_price_cents: number;
    currency: string;
    can_purchase: boolean;
    inventory_mode: "finite" | "made_to_order";
    available_quantity: number | null;
    primary_image_url: string | null;
    primary_image_alt: string | null;
    customization?: {
      allow_image_upload: boolean;
      max_upload_mb: number;
      allow_gallery_selection?: boolean;
    } | null;
  };
  variants?: PublicProductVariant[];
  initialStudioPrintId?: string;
  /** Controlled color/style selection (syncs gallery photos on the PDP). */
  selectedVariantId?: string | null;
  onVariantSelect?: (variant: PublicProductVariant) => void;
};

type CustomUploadUrlResponse = {
  uploadUrl: string;
  storagePath: string;
  bucket: string;
  expiresAt: string;
  maxUploadMb: number;
  token?: string;
};

function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/");
}

type DesignSource = "upload" | "gallery";

export function AddToCartPanel({
  product,
  variants = [],
  initialStudioPrintId,
  selectedVariantId: selectedVariantIdProp,
  onVariantSelect
}: AddToCartPanelProps) {
  const { addItem, itemCount } = useCart();
  const [quantityInput, setQuantityInput] = useState("1");
  const [internalVariantId, setInternalVariantId] = useState<string | null>(
    variants[0]?.id ?? null
  );
  const selectedVariantId = selectedVariantIdProp ?? internalVariantId;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [studioPrints, setStudioPrints] = useState<PublicStudioPrint[]>([]);
  const [selectedStudioPrint, setSelectedStudioPrint] = useState<PublicStudioPrint | null>(null);
  const [designSource, setDesignSource] = useState<DesignSource>("upload");
  const [visiblePrintCount, setVisiblePrintCount] = useState(STUDIO_PRINT_PAGE_SIZE);

  const maxForFinite =
    product.inventory_mode === "finite"
      ? Math.max(product.available_quantity ?? 0, 0)
      : null;

  const isSublimation = product.category === "custom_sublimation";
  const allowImageUpload = product.customization?.allow_image_upload === true;
  const allowGalleryFromDb = product.customization?.allow_gallery_selection === true;
  /** Any custom photo product can use the studio gallery instead of uploading. */
  const allowGallerySelection = allowGalleryFromDb || allowImageUpload;
  const isCustomerUploadProduct = isSublimation && allowImageUpload;
  const galleryOnly = isSublimation && !allowImageUpload && allowGallerySelection;
  const uploadAndGallery = isSublimation && allowImageUpload && allowGallerySelection;
  const maxUploadMb = product.customization?.max_upload_mb ?? 20;
  const notesLength = notes.length;
  const availabilityNote =
    product.inventory_mode === "made_to_order"
      ? "Made to order with care. Production begins after payment is confirmed."
      : product.can_purchase
        ? `${maxForFinite ?? 0} available right now.`
        : "Sold out for now.";

  useEffect(() => {
    if (!allowGallerySelection) {
      return;
    }
    let cancelled = false;
    void fetch("/api/gallery/prints")
      .then((res) => res.json())
      .then((body: { prints?: PublicStudioPrint[] }) => {
        if (cancelled || !Array.isArray(body.prints)) {
          return;
        }
        setStudioPrints(body.prints);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [allowGallerySelection]);

  useEffect(() => {
    setVisiblePrintCount(STUDIO_PRINT_PAGE_SIZE);
  }, [product.id]);

  useEffect(() => {
    if (selectedVariantIdProp === undefined) {
      setInternalVariantId(variants[0]?.id ?? null);
    }
  }, [product.id, variants, selectedVariantIdProp]);

  function selectVariant(variant: PublicProductVariant) {
    if (selectedVariantIdProp === undefined) {
      setInternalVariantId(variant.id);
    }
    onVariantSelect?.(variant);
    setMessage(null);
  }

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId]
  );

  const unitPriceCents = useMemo(
    () => resolveVariantUnitPriceCents(product.base_price_cents, selectedVariant),
    [product.base_price_cents, selectedVariant]
  );

  useEffect(() => {
    if (galleryOnly) {
      setDesignSource("gallery");
    }
  }, [galleryOnly]);

  useEffect(() => {
    if (!allowGallerySelection || studioPrints.length === 0) {
      return;
    }
    const fromUrl = initialStudioPrintId?.trim();
    let fromSession: string | undefined;
    try {
      fromSession = window.sessionStorage.getItem(STUDIO_PRINT_SESSION_STORAGE_KEY)?.trim() || undefined;
    } catch {
      fromSession = undefined;
    }
    const target = fromUrl || fromSession;
    if (!target) {
      return;
    }
      const idx = studioPrints.findIndex((p) => p.id === target);
      const match = idx >= 0 ? studioPrints[idx] : undefined;
      if (match) {
        setDesignSource("gallery");
        setSelectedStudioPrint(match);
        setVisiblePrintCount((c) =>
          Math.min(studioPrints.length, Math.max(c, STUDIO_PRINT_PAGE_SIZE))
        );
    } else if (fromUrl) {
      setMessage("That studio print link is not available right now.");
    }
  }, [allowGallerySelection, studioPrints, initialStudioPrintId]);

  const orderedStudioPrints = useMemo(
    () =>
      sortStudioPrintsWithSelectedFirst(
        studioPrints,
        selectedStudioPrint?.id ?? initialStudioPrintId
      ),
    [studioPrints, selectedStudioPrint?.id, initialStudioPrintId]
  );

  const visibleStudioPrints = useMemo(
    () => orderedStudioPrints.slice(0, visiblePrintCount),
    [orderedStudioPrints, visiblePrintCount]
  );
  const studioPrintsRemaining = Math.max(0, studioPrints.length - visiblePrintCount);

  async function uploadCustomizationImage(
    file: File
  ): Promise<{
    bucket: string;
    storage_path: string;
    original_filename: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
  }> {
    const createUrlResponse = await fetch(
      `/api/products/${product.slug}/customization/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          file_size_bytes: file.size
        })
      }
    );

    const createUrlPayload = (await createUrlResponse
      .json()
      .catch(() => ({}))) as
      | CustomUploadUrlResponse
      | { error?: string; details?: unknown };

    if (!createUrlResponse.ok) {
      const errorMessage =
        "error" in createUrlPayload && typeof createUrlPayload.error === "string"
          ? createUrlPayload.error
          : "Failed to prepare upload";
      throw new Error(errorMessage);
    }

    const uploadData = createUrlPayload as CustomUploadUrlResponse;
    const uploadResponse = await fetch(uploadData.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error(`Image upload failed (${uploadResponse.status})`);
    }

    return {
      bucket: uploadData.bucket,
      storage_path: uploadData.storagePath,
      original_filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      uploaded_at: new Date().toISOString()
    };
  }

  async function handleAddToCart() {
    if (!product.can_purchase) {
      setMessage("This item is currently sold out.");
      return;
    }

    const parsedQuantity = Number(quantityInput);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setMessage("Quantity must be a positive whole number.");
      return;
    }

    if (maxForFinite !== null && parsedQuantity > maxForFinite) {
      setMessage(`Only ${maxForFinite} in stock right now.`);
      return;
    }

    const safeQuantity = clampCartQuantity(parsedQuantity);

    try {
      setBusy(true);
      setMessage(null);

      let customization: Record<string, unknown> = {};

      if (galleryOnly) {
        if (!selectedStudioPrint) {
          setMessage("Please choose one of our studio prints.");
          return;
        }
        const trimmedNotes = notes.trim();
        customization.studio_print = {
          id: selectedStudioPrint.id,
          storage_path: selectedStudioPrint.storage_path,
          ...(selectedStudioPrint.title.trim()
            ? { title: selectedStudioPrint.title.trim() }
            : {})
        };
        if (trimmedNotes.length > 0) {
          customization.customer_notes = trimmedNotes;
        }
      } else if (uploadAndGallery) {
        if (designSource === "gallery") {
          if (!selectedStudioPrint) {
            setMessage("Please pick a studio print, or switch to your own photo.");
            return;
          }
          const trimmedNotes = notes.trim();
          customization.studio_print = {
            id: selectedStudioPrint.id,
            storage_path: selectedStudioPrint.storage_path,
            ...(selectedStudioPrint.title.trim()
              ? { title: selectedStudioPrint.title.trim() }
              : {})
          };
          if (trimmedNotes.length > 0) {
            customization.customer_notes = trimmedNotes;
          }
        } else {
          if (!rightsConfirmed) {
            setMessage("Please confirm image rights before adding to cart.");
            return;
          }

          const trimmedNotes = notes.trim();
          customization.rights_acknowledged = true;
          if (trimmedNotes.length > 0) {
            customization.customer_notes = trimmedNotes;
          }

          if (!designFile) {
            setMessage("Please upload an image, or choose a studio print instead.");
            return;
          }

          if (!isImageFile(designFile)) {
            setMessage("Only image files are allowed (JPG/PNG/WebP).");
            return;
          }

          const maxBytes = maxUploadMb * 1024 * 1024;
          if (designFile.size > maxBytes) {
            setMessage(`Image is too large. Maximum is ${maxUploadMb} MB.`);
            return;
          }

          const upload = await uploadCustomizationImage(designFile);
          customization.upload = upload;
        }
      } else if (isCustomerUploadProduct) {
        if (!rightsConfirmed) {
          setMessage("Please confirm image rights before adding to cart.");
          return;
        }

        const trimmedNotes = notes.trim();
        customization.rights_acknowledged = true;
        if (trimmedNotes.length > 0) {
          customization.customer_notes = trimmedNotes;
        }

        if (!designFile) {
          setMessage("Please upload an image for this custom item.");
          return;
        }

        if (!isImageFile(designFile)) {
          setMessage("Only image files are allowed (JPG/PNG/WebP).");
          return;
        }

        const maxBytes = maxUploadMb * 1024 * 1024;
        if (designFile.size > maxBytes) {
          setMessage(`Image is too large. Maximum is ${maxUploadMb} MB.`);
          return;
        }

        const upload = await uploadCustomizationImage(designFile);
        customization.upload = upload;
      }

      if (variants.length > 0 && !selectedVariant) {
        setMessage("Please choose a color option.");
        return;
      }

      const customizationWithVariant =
        variants.length > 0 && selectedVariant
          ? mergeVariantIntoCustomization(customization, {
              id: selectedVariant.id,
              label: selectedVariant.label,
              slug: selectedVariant.slug
            })
          : customization;

      addItem(
        {
          product_id: product.id,
          slug: product.slug,
          name: product.name,
          category: product.category,
          unit_price_cents: unitPriceCents,
          currency: product.currency,
          image_url: product.primary_image_url,
          image_alt: product.primary_image_alt,
          customization:
            Object.keys(customizationWithVariant).length > 0
              ? customizationWithVariant
              : undefined
        },
        safeQuantity
      );

      if (isCustomerUploadProduct || galleryOnly || uploadAndGallery) {
        setNotes("");
        setDesignFile(null);
        setRightsConfirmed(false);
        setFileInputKey((value) => value + 1);
        if (designSource === "gallery" || galleryOnly) {
          try {
            window.sessionStorage.removeItem(STUDIO_PRINT_SESSION_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
      }

      setMessage("Added to cart.");
    } catch (addError) {
      setMessage(
        addError instanceof Error ? addError.message : "Failed to add item to cart."
      );
    } finally {
      setBusy(false);
    }
  }

  function selectPrint(print: PublicStudioPrint) {
    setSelectedStudioPrint(print);
    try {
      window.sessionStorage.setItem(STUDIO_PRINT_SESSION_STORAGE_KEY, print.id);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="add-to-cart-panel">
      <h2>Add to cart</h2>
      <p className={`add-to-cart-note ${product.can_purchase ? "" : "is-warning"}`}>
        {availabilityNote}
      </p>

      {variants.length > 0 ? (
        <ProductVariantPicker
          variants={variants}
          basePriceCents={product.base_price_cents}
          currency={product.currency}
          selectedVariantId={selectedVariantId}
          onSelect={selectVariant}
          disabled={!product.can_purchase || busy}
        />
      ) : null}

      {uploadAndGallery ? (
        <div className="add-to-cart-source-tabs" role="group" aria-label="Design source">
          <button
            type="button"
            aria-pressed={designSource === "upload"}
            className={`add-to-cart-source-tab ${designSource === "upload" ? "is-active" : ""}`}
            onClick={() => {
              setDesignSource("upload");
              setSelectedStudioPrint(null);
              setMessage(null);
            }}
          >
            Your photo
          </button>
          <button
            type="button"
            aria-pressed={designSource === "gallery"}
            className={`add-to-cart-source-tab ${designSource === "gallery" ? "is-active" : ""}`}
            onClick={() => {
              setDesignSource("gallery");
              setDesignFile(null);
              setRightsConfirmed(false);
              setFileInputKey((k) => k + 1);
              setMessage(null);
            }}
          >
            Studio gallery
          </button>
        </div>
      ) : null}

      {galleryOnly || (uploadAndGallery && designSource === "gallery") ? (
        <section className="add-to-cart-customization">
          <h3>Choose a studio print</h3>
          <p className="add-to-cart-note add-to-cart-note-secondary">
            Tap a design below. We will sublimate this artwork onto your blank.{" "}
            <Link href="/gallery" className="text-link">
              Browse the full gallery
            </Link>
          </p>
          {selectedStudioPrint ? (
            <div className="add-to-cart-studio-selected panel" role="status">
              <p className="add-to-cart-studio-selected-kicker">Selected studio print</p>
              <p className="add-to-cart-studio-selected-title">{selectedStudioPrint.title}</p>
              <p className="add-to-cart-studio-selected-hint">
                Your choice is pinned at the top of the list below.
              </p>
              <Link
                href={shopHrefForStudioPrint(selectedStudioPrint)}
                className="btn btn-outline btn-sm"
              >
                View on this product
              </Link>
            </div>
          ) : null}
          {studioPrints.length === 0 ? (
            <p className="add-to-cart-note">Loading gallery…</p>
          ) : (
            <>
              {studioPrints.length > STUDIO_PRINT_PAGE_SIZE ? (
                <p className="add-to-cart-studio-summary" aria-live="polite">
                  Showing {visibleStudioPrints.length} of {studioPrints.length} prints
                  {studioPrintsRemaining > 0 ? " — scroll down and use Show more for the rest." : "."}
                </p>
              ) : null}
              <ul className="add-to-cart-studio-grid" aria-label="Studio print thumbnails">
                {visibleStudioPrints.map((print) => {
                  const selected = selectedStudioPrint?.id === print.id;
                  const thumbSrc = studioPrintImageSrcForNextImage(print.image_url);
                  return (
                    <li key={print.id}>
                      <button
                        type="button"
                        className={`add-to-cart-studio-tile ${selected ? "is-selected" : ""}`}
                        onClick={() => selectPrint(print)}
                        aria-pressed={selected}
                      >
                        <span className="add-to-cart-studio-thumb">
                          <Image
                            src={thumbSrc}
                            alt={print.title}
                            width={120}
                            height={120}
                            className="add-to-cart-studio-thumb-img"
                            sizes="120px"
                            unoptimized={studioPrintImageUnoptimized(thumbSrc)}
                          />
                        </span>
                        <span className="add-to-cart-studio-tile-label">{print.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {studioPrintsRemaining > 0 ? (
                <div className="add-to-cart-studio-more-wrap">
                  <button
                    type="button"
                    className="btn btn-outline add-to-cart-studio-more"
                    onClick={() =>
                      setVisiblePrintCount((n) =>
                        Math.min(n + STUDIO_PRINT_PAGE_SIZE, studioPrints.length)
                      )
                    }
                  >
                    Show more prints ({studioPrintsRemaining} left)
                  </button>
                </div>
              ) : null}
            </>
          )}

          <label className="form-field">
            Notes for seller (optional)
            <textarea
              className="field-control"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={busy || !product.can_purchase}
              placeholder="Placement, text, or color preferences"
            />
            <span className="form-hint form-hint-right">{notesLength}/500</span>
          </label>
        </section>
      ) : null}

      {isCustomerUploadProduct && (!uploadAndGallery || designSource === "upload") ? (
        <section className="add-to-cart-customization">
          <h3>Your Photo + Special Notes</h3>
          <p className="add-to-cart-note add-to-cart-note-secondary">
            Upload one image, share any notes, and confirm you have image rights.
          </p>

          <label className="form-field">
            Upload your photo
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              onChange={(event) => setDesignFile(event.target.files?.[0] ?? null)}
              disabled={busy || !product.can_purchase}
            />
            <span className="form-hint">
              Accepted formats: JPG, PNG, WebP. Max file size: {maxUploadMb} MB.
            </span>
          </label>

          {designFile ? (
            <p className="add-to-cart-note">Selected file: {designFile.name}</p>
          ) : null}

          <label className="form-field">
            Notes for seller (optional)
            <textarea
              className="field-control"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={busy || !product.can_purchase}
              placeholder="Example: center photo, no text, full wrap"
            />
            <span className="form-hint form-hint-right">{notesLength}/500</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              disabled={busy || !product.can_purchase}
            />
            I confirm I have permission to use this image.
          </label>
        </section>
      ) : null}

      {isSublimation && !isCustomerUploadProduct && !galleryOnly ? (
        <p className="add-to-cart-note add-to-cart-note-secondary">
          This is one of our ready-made designs. No image upload needed.
        </p>
      ) : null}

      <label className="form-field quantity-field">
        Quantity
        <input
          type="number"
          className="field-control"
          value={quantityInput}
          onChange={(event) => setQuantityInput(event.target.value)}
          min={1}
          step={1}
          max={maxForFinite ?? undefined}
          inputMode="numeric"
          disabled={!product.can_purchase || busy}
        />
      </label>

      <div className="add-to-cart-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleAddToCart()}
          disabled={!product.can_purchase || busy}
        >
          {busy ? "Adding..." : product.can_purchase ? "Add to cart" : "Sold out"}
        </button>
        {itemCount > 0 ? (
          <>
            <a href="/cart" className="btn btn-outline">
              View cart ({itemCount})
            </a>
            <a href="/checkout" className="btn btn-outline">
              Checkout
            </a>
          </>
        ) : null}
      </div>

      {message ? (
        <p className="add-to-cart-message">
          {message === "Added to cart." ? "Added to your cart." : message}
        </p>
      ) : null}
    </section>
  );
}
