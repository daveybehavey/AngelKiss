"use client";

import { useCart } from "@/components/storefront/cart-provider";
import { lineTotalCents } from "@/lib/storefront/cart";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
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
        <p className="admin-note-tight">
          Shipping is calculated after you enter your address at checkout.
        </p>
        <p className="page-link-row">
          <a href="/shop">Continue shopping</a>
          <a href="/checkout">Checkout</a>
        </p>
      </section>

      {items.length === 0 ? (
        <section className="panel cart-empty">
          <p>Your cart is empty for now.</p>
          <a href="/shop" className="btn btn-primary">
            Browse products
          </a>
        </section>
      ) : (
        <>
          <ul className="cart-list">
            {items.map((item) => {
              const customizationUploadFilename = getCustomizationUploadFilename(
                item.customization
              );

              return (
                <li key={item.cart_item_id} className="panel cart-item">
                  <div className="cart-item-details">
                    <p className="cart-item-name">
                      <a href={`/shop/${item.slug}`}>{item.name}</a>
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
                    <p className="cart-item-meta">
                      Line total: {formatMoney(lineTotalCents(item), item.currency)}
                    </p>
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
              <a href="/checkout" className="btn btn-primary">
                Continue to secure checkout
              </a>
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
