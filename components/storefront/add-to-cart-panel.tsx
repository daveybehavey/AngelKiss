"use client";

import { useCart } from "@/components/storefront/cart-provider";
import type { ProductCategory } from "@/lib/admin/products";
import { clampCartQuantity } from "@/lib/storefront/cart";
import { useState } from "react";

type AddToCartPanelProps = {
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
    } | null;
  };
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

export function AddToCartPanel({ product }: AddToCartPanelProps) {
  const { addItem, itemCount } = useCart();
  const [quantityInput, setQuantityInput] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const maxForFinite =
    product.inventory_mode === "finite"
      ? Math.max(product.available_quantity ?? 0, 0)
      : null;

  const isSublimation = product.category === "custom_sublimation";
  const allowImageUpload = product.customization?.allow_image_upload === true;
  const isCustomerUploadProduct = isSublimation && allowImageUpload;
  const maxUploadMb = product.customization?.max_upload_mb ?? 20;
  const notesLength = notes.length;
  const availabilityNote =
    product.inventory_mode === "made_to_order"
      ? "Made to order with care. Production begins after payment is confirmed."
      : product.can_purchase
        ? `${maxForFinite ?? 0} available right now.`
        : "Sold out for now.";

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

      if (isCustomerUploadProduct) {
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

      addItem(
        {
          product_id: product.id,
          slug: product.slug,
          name: product.name,
          category: product.category,
          unit_price_cents: product.base_price_cents,
          currency: product.currency,
          image_url: product.primary_image_url,
          image_alt: product.primary_image_alt,
          customization: Object.keys(customization).length > 0 ? customization : undefined
        },
        safeQuantity
      );

      if (isCustomerUploadProduct) {
        setNotes("");
        setDesignFile(null);
        setRightsConfirmed(false);
        setFileInputKey((value) => value + 1);
      }

      setMessage("Added to cart.");
    } catch (addError) {
      setMessage(
        addError instanceof Error
          ? addError.message
          : "Failed to add item to cart."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="add-to-cart-panel">
      <h2>Add to cart</h2>
      <p className={`add-to-cart-note ${product.can_purchase ? "" : "is-warning"}`}>
        {availabilityNote}
      </p>

      {isCustomerUploadProduct ? (
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

      {isSublimation && !isCustomerUploadProduct ? (
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
