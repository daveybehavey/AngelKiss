"use client";

import { useCart } from "@/components/storefront/cart-provider";
import { lineTotalCents } from "@/lib/storefront/cart";
import { formatShopperProductTitle } from "@/lib/storefront/product-display";
import Image from "next/image";
import Link from "next/link";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function getStudioPrintLabel(customization: Record<string, unknown> | undefined): string | null {
  if (!customization || typeof customization !== "object" || Array.isArray(customization)) {
    return null;
  }
  const sp = customization.studio_print;
  if (!sp || typeof sp !== "object" || Array.isArray(sp)) {
    return null;
  }
  const title = (sp as Record<string, unknown>).title;
  if (typeof title === "string" && title.trim().length > 0) {
    return title.trim();
  }
  return "Studio gallery print";
}

function getCustomizationUploadFilename(customization: Record<string, unknown> | undefined): string | null {
  if (!customization || typeof customization !== "object" || Array.isArray(customization)) {
    return null;
  }

  const upload = customization.upload;
  if (!upload || typeof upload !== "object" || Array.isArray(upload)) {
    return null;
  }

  const originalFilename = (upload as Record<string, unknown>).original_filename;
  return typeof originalFilename === "string" && originalFilename.trim().length > 0
    ? originalFilename.trim()
    : null;
}

export default function CartPage() {
  const { items, itemCount, subtotalCents, currency, setItemQuantity, removeItem, clearCart } = useCart();

  return (
    <main className="page-main cart-page">
      <section className="panel page-intro">
        <h1 className="page-title">Your Cart</h1>
        <p className="page-lead">A quick review before checkout.</p>
        <p className="page-note-tight">
          Shipping is calculated after you enter your address at checkout.
        </p>
        <p className="page-link-row">
          <Link href="/shop">Continue shopping</Link>
          <Link href="/checkout">Checkout</Link>
        </p>
      </section>

      {items.length === 0 ? (
        <section className="panel cart-empty">
          <p>Your cart is empty for now.</p>
          <Link href="/shop" className="btn btn-primary">
            Browse products
          </Link>
        </section>
      ) : (
        <>
          <ul className="cart-list">
            {items.map((item) => {
              const displayTitle = formatShopperProductTitle(item.name);
              const customizationUploadFilename = getCustomizationUploadFilename(
                item.customization
              );
              const studioPrintLabel = getStudioPrintLabel(item.customization);
              const thumbAlt = (item.image_alt?.trim() || displayTitle).slice(0, 200);

              return (
                <li key={item.cart_item_id} className="panel cart-item">
                  <div className="cart-item-main">
                    <div className="cart-item-thumb">
                      {item.image_url ? (
                        <Link
                          href={`/shop/${item.slug}`}
                          className="cart-item-thumb-link"
                          aria-label={`View product: ${displayTitle}`}
                        >
                          <Image
                            src={item.image_url}
                            alt={thumbAlt}
                            width={96}
                            height={96}
                            className="cart-item-thumb-img"
                            sizes="96px"
                          />
                        </Link>
                      ) : (
                        <span className="cart-item-thumb-placeholder" aria-hidden="true">
                          Photo soon
                        </span>
                      )}
                    </div>
                    <div className="cart-item-details">
                    <p className="cart-item-name">
                      <Link href={`/shop/${item.slug}`}>{displayTitle}</Link>
                    </p>
                    <p className="cart-item-meta">
                      Unit: {formatMoney(item.unit_price_cents, item.currency)}
                    </p>
                    {item.category === "custom_sublimation" ? (
                      <p className="cart-item-custom-note">
                        Custom print included
                        {typeof item.customization?.customer_notes === "string" &&
                        item.customization.customer_notes.trim().length > 0
                          ? ` | Notes: ${item.customization.customer_notes}`
                          : ""}
                      </p>
                    ) : null}
                    {customizationUploadFilename ? (
                      <p className="cart-item-custom-note">
                        Photo uploaded: {customizationUploadFilename}
                      </p>
                    ) : null}
                    {studioPrintLabel ? (
                      <p className="cart-item-custom-note">Studio print: {studioPrintLabel}</p>
                    ) : null}
                    <p className="cart-item-meta">
                      Line total: {formatMoney(lineTotalCents(item), item.currency)}
                    </p>
                    </div>
                  </div>

                  <div className="cart-item-controls">
                    <label className="form-field quantity-field cart-qty-field">
                      Quantity
                      <input
                        className="field-control"
                        type="number"
                        min={1}
                        step={1}
                        value={String(item.quantity)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next)) {
                            return;
                          }
                          setItemQuantity(item.cart_item_id, next);
                        }}
                        inputMode="numeric"
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn-outline cart-remove-btn"
                      onClick={() => removeItem(item.cart_item_id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="panel cart-summary">
            <p className="summary-line">
              <span>Items</span>
              <strong>{itemCount}</strong>
            </p>
            <p className="summary-line">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotalCents, currency)}</strong>
            </p>
            <div className="cart-summary-actions">
              <Link href="/checkout" className="btn btn-primary">
                Continue to secure checkout
              </Link>
              <button type="button" className="btn btn-outline" onClick={clearCart}>
                Clear cart
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
