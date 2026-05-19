"use client";

import {
  PayPalButton,
  type PayPalCaptureSuccess
} from "@/components/storefront/paypal-button";
import { useCart } from "@/components/storefront/cart-provider";
import {
  normalizePostalCodeInput,
  validateShippingOriginInput
} from "@/lib/admin/shipping-validation";
import { cancelCheckoutSession } from "@/lib/checkout/cancel-session";
import { normalizePromoCodeInput } from "@/lib/checkout/promo";
import { lineTotalCents, type CheckoutShippingAddress } from "@/lib/storefront/cart";
import { formatShopperProductTitle } from "@/lib/storefront/product-display";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CheckoutResult = {
  checkoutSessionId: string;
  status: string;
  expiresAt: string;
  totals: {
    subtotal_cents: number;
    shipping_cents: number;
    discount_cents?: number;
    promo_code?: string | null;
    total_cents: number;
    shipping_zone: string;
    free_shipping_applied: boolean;
  };
};

type CountryCode = "CA";
type RegionOption = { code: string; label: string };

const COUNTRY_OPTIONS: Array<{ code: CountryCode; label: string }> = [
  { code: "CA", label: "Canada" }
];

const REGION_OPTIONS: Record<CountryCode, RegionOption[]> = {
  CA: [
    { code: "AB", label: "Alberta" },
    { code: "BC", label: "British Columbia" },
    { code: "MB", label: "Manitoba" },
    { code: "NB", label: "New Brunswick" },
    { code: "NL", label: "Newfoundland and Labrador" },
    { code: "NS", label: "Nova Scotia" },
    { code: "NT", label: "Northwest Territories" },
    { code: "NU", label: "Nunavut" },
    { code: "ON", label: "Ontario" },
    { code: "PE", label: "Prince Edward Island" },
    { code: "QC", label: "Quebec" },
    { code: "SK", label: "Saskatchewan" },
    { code: "YT", label: "Yukon" }
  ]
};

function normalizeCountryCode(_value: string): CountryCode {
  return "CA";
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export default function CheckoutPage() {
  const { items, itemCount, subtotalCents, currency, clearCart } = useCart();

  const [email, setEmail] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [shippingAddress, setShippingAddress] = useState<CheckoutShippingAddress>({
    full_name: "",
    address_line1: "",
    address_line2: "",
    country_code: "CA",
    province_code: "BC",
    city: "",
    postal_code: "",
    phone: ""
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [paymentResult, setPaymentResult] = useState<PayPalCaptureSuccess | null>(null);
  const activeCheckoutSessionRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);

  useEffect(() => {
    return () => {
      const sessionId = activeCheckoutSessionRef.current;
      if (sessionId && !paymentCompletedRef.current) {
        void cancelCheckoutSession(sessionId, "failed");
      }
    };
  }, []);

  const normalizedCountryCode = normalizeCountryCode(shippingAddress.country_code);
  const regionOptions = REGION_OPTIONS.CA;

  const canSubmit = useMemo(() => {
    if (items.length === 0) {
      return false;
    }
    return true;
  }, [items.length]);

  const customPrintItemCount = useMemo(() => {
    return items.filter((item) => item.category === "custom_sublimation").length;
  }, [items]);

  const shippingAddressSummary = useMemo(() => {
    const parts = [
      shippingAddress.city.trim(),
      normalizeCode(shippingAddress.province_code),
      normalizeCountryCode(shippingAddress.country_code)
    ].filter((value) => value.length > 0);
    return parts.length > 0 ? parts.join(", ") : "Enter shipping address";
  }, [shippingAddress.city, shippingAddress.country_code, shippingAddress.province_code]);

  async function handleCreateCheckoutSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setBusy(true);
    setError(null);
    setPaymentResult(null);

    const previousSessionId = activeCheckoutSessionRef.current;
    if (previousSessionId) {
      void cancelCheckoutSession(previousSessionId, "failed");
      activeCheckoutSessionRef.current = null;
    }

    setResult(null);

    try {
      const shippingValidation = validateShippingOriginInput({
        country_code: normalizeCountryCode(shippingAddress.country_code),
        province_code: normalizeCode(shippingAddress.province_code),
        city: shippingAddress.city,
        postal_code: shippingAddress.postal_code
      });

      if (!shippingValidation.ok) {
        const firstError =
          shippingValidation.errors.postal_code ??
          shippingValidation.errors.city ??
          shippingValidation.errors.province_code ??
          shippingValidation.errors.country_code ??
          "Please check your shipping address.";
        setError(firstError);
        return;
      }

      const normalizedShipping = shippingValidation.normalized;
      setShippingAddress((current) => ({
        ...current,
        country_code: normalizedShipping.country_code,
        province_code: normalizedShipping.province_code,
        city: normalizedShipping.city,
        postal_code: normalizedShipping.postal_code
      }));

      const response = await fetch("/api/checkout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_email: email.trim(),
          shipping_address: {
            full_name: shippingAddress.full_name.trim(),
            address_line1: shippingAddress.address_line1.trim(),
            address_line2: shippingAddress.address_line2.trim(),
            country_code: normalizedShipping.country_code,
            province_code: normalizedShipping.province_code,
            city: normalizedShipping.city,
            postal_code: normalizedShipping.postal_code,
            phone: shippingAddress.phone.trim()
          },
          items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            customization: item.customization ?? {}
          })),
          ...(promoCode.trim()
            ? { promo_code: normalizePromoCodeInput(promoCode) }
            : {})
        })
      });

      const payload = (await response.json().catch(() => ({}))) as
        | CheckoutResult
        | { error?: string; details?: unknown };

      if (!response.ok) {
        const message = "error" in payload && typeof payload.error === "string" ? payload.error : "Failed to create checkout session";
        setError(message);
        return;
      }

      const checkout = payload as CheckoutResult;
      activeCheckoutSessionRef.current = checkout.checkoutSessionId;
      setResult(checkout);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected checkout error");
    } finally {
      setBusy(false);
    }
  }

  const handlePaymentSuccess = useCallback(
    (payload: PayPalCaptureSuccess) => {
      paymentCompletedRef.current = true;
      activeCheckoutSessionRef.current = null;
      setPaymentResult(payload);
      clearCart();
    },
    [clearCart]
  );

  const handlePaymentCancel = useCallback(() => {
    const sessionId = activeCheckoutSessionRef.current;
    if (sessionId) {
      void cancelCheckoutSession(sessionId, "failed");
    }
    setResult(null);
    activeCheckoutSessionRef.current = null;
  }, []);

  const onPaymentStep = Boolean(result);
  const checkoutComplete = Boolean(paymentResult);
  const cartIsEmpty = items.length === 0;

  return (
    <main className="page-main checkout-page">
      <section className="panel page-intro checkout-intro">
        <h1 className="page-title">Checkout</h1>
        <p className="page-lead">
          Review your order, enter a Canadian shipping address, then pay securely with PayPal.
        </p>
        <ul className="checkout-trust-strip" aria-label="Checkout assurances">
          <li>Secure PayPal checkout</li>
          <li>Ships within Canada</li>
          <li>Handmade &amp; custom orders welcome</li>
        </ul>
        {!cartIsEmpty ? (
          <ol className="checkout-steps" aria-label="Checkout progress">
            <li className="checkout-step checkout-step--done">
              <span className="checkout-step-marker" aria-hidden="true">
                1
              </span>
              <span className="checkout-step-label">Order</span>
            </li>
            <li
              className={
                onPaymentStep
                  ? "checkout-step checkout-step--done"
                  : "checkout-step checkout-step--current"
              }
            >
              <span className="checkout-step-marker" aria-hidden="true">
                2
              </span>
              <span className="checkout-step-label">Shipping</span>
            </li>
            <li
              className={
                checkoutComplete
                  ? "checkout-step checkout-step--done"
                  : onPaymentStep
                    ? "checkout-step checkout-step--current"
                    : "checkout-step"
              }
            >
              <span className="checkout-step-marker" aria-hidden="true">
                3
              </span>
              <span className="checkout-step-label">Payment</span>
            </li>
          </ol>
        ) : null}
        <p className="page-link-row">
          <Link href="/shop">Shop</Link>
          <Link href="/cart">Cart</Link>
        </p>
      </section>

      {cartIsEmpty ? (
        <section className="panel checkout-empty" aria-labelledby="checkout-empty-heading">
          <h2 id="checkout-empty-heading" className="checkout-section-title">
            Your cart is empty
          </h2>
          <p className="checkout-helper-note">
            Add something from the shop first—we&apos;ll bring you back here when you&apos;re ready
            to pay.
          </p>
          <p className="checkout-empty-actions">
            <Link href="/shop" className="btn btn-primary">
              Browse products
            </Link>
            <Link href="/cart">View cart</Link>
          </p>
        </section>
      ) : (
        <div className="checkout-layout">
          <aside className="checkout-aside" aria-label="Order summary">
            <section className="panel checkout-summary">
              <h2 className="checkout-section-title">Order summary</h2>
              <p className="checkout-helper-note">Shipping to: {shippingAddressSummary}</p>
              <div className="checkout-totals-card">
                <p className="summary-line">
                  <span>Items</span>
                  <strong>{itemCount}</strong>
                </p>
                {customPrintItemCount > 0 ? (
                  <p className="summary-line">
                    <span>Custom print items</span>
                    <strong>{customPrintItemCount}</strong>
                  </p>
                ) : null}
                <p className="summary-line checkout-summary-total">
                  <span>Cart subtotal</span>
                  <strong>{formatMoney(subtotalCents, currency)}</strong>
                </p>
              </div>
              <p className="checkout-helper-note checkout-summary-note">
                Shipping and any promo discount are calculated when you continue to payment.
              </p>
              <ul className="checkout-item-list" aria-label="Items in checkout">
                {items.map((item) => (
                  <li key={item.cart_item_id} className="checkout-item-row">
                    <span>
                      {formatShopperProductTitle(item.name)} × {item.quantity}
                    </span>
                    <strong>{formatMoney(lineTotalCents(item), item.currency)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <div className="checkout-main">
            {!result && !paymentResult ? (
              <section className="panel checkout-form-panel" aria-labelledby="checkout-shipping-heading">
                <h2 id="checkout-shipping-heading" className="checkout-section-title">
                  Contact &amp; shipping
                </h2>
                <p className="checkout-helper-note">
                  We ship to Canadian addresses only. Fields marked below are required.
                </p>
                <form onSubmit={handleCreateCheckoutSession} className="checkout-form-grid" noValidate>
                  <fieldset className="checkout-fieldset">
                    <legend>Contact</legend>
                    <label className="form-field">
                      Email
                      <input
                        className="field-control"
                        type="email"
                        required
                        autoComplete="email"
                        enterKeyHint="next"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                  </fieldset>

                  <fieldset className="checkout-fieldset">
                    <legend>Delivery address</legend>
                    <label className="form-field">
                      Full name
            <input
              className="field-control"
              required
              autoComplete="name"
              enterKeyHint="next"
              value={shippingAddress.full_name}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  full_name: event.target.value
                }))
              }
              disabled={busy}
            />
          </label>

          <label className="form-field">
            Address line 1
            <input
              className="field-control"
              required
              autoComplete="address-line1"
              enterKeyHint="next"
              value={shippingAddress.address_line1}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  address_line1: event.target.value
                }))
              }
              disabled={busy}
            />
          </label>

          <label className="form-field">
            Address line 2 (optional)
            <input
              className="field-control"
              autoComplete="address-line2"
              enterKeyHint="next"
              value={shippingAddress.address_line2}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  address_line2: event.target.value
                }))
              }
              disabled={busy}
            />
                    </label>

                    <div className="checkout-form-row">
                      <label className="form-field">
                        Country
                        <select
              className="field-control"
              required
              autoComplete="country-name"
              value={normalizedCountryCode}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  country_code: "CA",
                  province_code: REGION_OPTIONS.CA[0]?.code ?? "",
                  postal_code: normalizePostalCodeInput("CA", current.postal_code)
                }))
              }
              disabled={busy}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
                        </select>
                      </label>

                      <label className="form-field">
                        Province / Territory
                        <select
              className="field-control"
              required
              autoComplete="address-level1"
              value={normalizeCode(shippingAddress.province_code)}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  province_code: normalizeCode(event.target.value)
                }))
              }
              disabled={busy}
            >
              {regionOptions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label} ({region.code})
                </option>
              ))}
                        </select>
                      </label>
                    </div>

                    <div className="checkout-form-row">
                      <label className="form-field">
                        City
                        <input
                          className="field-control"
                          required
                          autoComplete="address-level2"
                          enterKeyHint="next"
                          value={shippingAddress.city}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              city: event.target.value
                            }))
                          }
                          disabled={busy}
                        />
                      </label>

                      <label className="form-field">
                        Postal code
                        <input
                          className="field-control"
                          required
                          autoComplete="postal-code"
                          enterKeyHint="next"
                          value={shippingAddress.postal_code}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              postal_code: normalizePostalCodeInput("CA", event.target.value)
                            }))
                          }
                          onBlur={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              postal_code: normalizePostalCodeInput("CA", event.target.value)
                            }))
                          }
                          disabled={busy}
                        />
                        <span className="form-hint">Canadian format: A1A 1A1</span>
                      </label>
                    </div>

                    <label className="form-field">
                      Phone (optional)
                      <input
                        className="field-control"
                        autoComplete="tel"
                        inputMode="tel"
                        enterKeyHint="done"
                        value={shippingAddress.phone}
                        onChange={(event) =>
                          setShippingAddress((current) => ({
                            ...current,
                            phone: event.target.value
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                  </fieldset>

                  <fieldset className="checkout-fieldset checkout-fieldset--promo">
                    <legend>Promo code</legend>
                    <label className="form-field">
                      <span className="sr-only">Promo code (optional)</span>
                      <input
                        className="field-control"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        enterKeyHint="done"
                        value={promoCode}
                        onChange={(event) => setPromoCode(event.target.value)}
                        onBlur={() => setPromoCode((current) => normalizePromoCodeInput(current))}
                        disabled={busy}
                        placeholder="e.g. ANGELTEST"
                      />
                    </label>
                  </fieldset>

                  <div className="checkout-form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary checkout-submit"
                      disabled={!canSubmit || busy}
                      aria-busy={busy ? true : undefined}
                    >
                      {busy ? "Preparing checkout..." : "Continue to payment"}
                    </button>
                    <p className="checkout-helper-note checkout-policy-note">
                      By continuing, you accept our{" "}
                      <Link href="/shipping">Shipping Policy</Link>,{" "}
                      <Link href="/returns">Returns &amp; Refunds</Link>, and{" "}
                      <Link href="/privacy">Privacy Policy</Link>.
                    </p>
                  </div>
                </form>
              </section>
            ) : null}

            {error ? (
              <p className="checkout-error" role="alert">
                {error}
              </p>
            ) : null}

            {result ? (
              <section
                className="panel checkout-result-panel"
                aria-labelledby="checkout-payment-heading"
              >
                <h2 id="checkout-payment-heading" className="checkout-section-title">
                  Secure payment
                </h2>
                <p className="checkout-helper-note">
                  Complete payment with PayPal below. Keep this page open until you see confirmation.
                </p>
                <p className="checkout-trust-inline">
                  PayPal protects your payment details—we never store your card number.
                </p>
                <details className="checkout-session-meta">
                  <summary>Checkout reference</summary>
                  <p className="checkout-session-id">{result.checkoutSessionId}</p>
                </details>
                <div className="checkout-totals-card checkout-totals-card--final">
                  <p className="summary-line">
                    <span>Subtotal</span>
                    <strong>{formatMoney(result.totals.subtotal_cents, currency)}</strong>
                  </p>
                  <p className="summary-line">
                    <span>Shipping</span>
                    <strong>{formatMoney(result.totals.shipping_cents, currency)}</strong>
                  </p>
                  {(result.totals.discount_cents ?? 0) > 0 ? (
                    <p className="summary-line">
                      <span>
                        Discount
                        {result.totals.promo_code ? ` (${result.totals.promo_code})` : ""}
                      </span>
                      <strong>-{formatMoney(result.totals.discount_cents ?? 0, currency)}</strong>
                    </p>
                  ) : null}
                  <p className="summary-line checkout-summary-total">
                    <span>Total due</span>
                    <strong>{formatMoney(result.totals.total_cents, currency)}</strong>
                  </p>
                  <p className="summary-line checkout-summary-meta">
                    <span>Shipping zone</span>
                    <strong>{result.totals.shipping_zone}</strong>
                  </p>
                </div>
                {result.totals.free_shipping_applied ? (
                  <p className="checkout-free-shipping">Free shipping applied to this order.</p>
                ) : null}

                {!paymentResult ? (
                  <PayPalButton
                    checkoutSessionId={result.checkoutSessionId}
                    onSuccess={handlePaymentSuccess}
                    onCancel={handlePaymentCancel}
                  />
                ) : null}

                {paymentResult ? (
            <section className="checkout-payment-success" aria-live="polite">
              <p className="checkout-success-eyebrow">Thank you</p>
              <h3 className="checkout-success-title">
                {shippingAddress.full_name.trim()
                  ? `You're all set, ${shippingAddress.full_name.trim().split(/\s+/)[0]}!`
                  : "You're all set!"}
              </h3>
              {paymentResult.orderNumber ? (
                <p className="checkout-order-number">
                  <span className="checkout-order-label">Your order number</span>
                  <span className="checkout-order-value">#{paymentResult.orderNumber}</span>
                </p>
              ) : null}
              {!paymentResult.finalized ? (
                <p className="checkout-success-warn">
                  Payment went through, but our system is still finalizing your order. If you
                  don&apos;t see a confirmation email within 24 hours, email us with the references
                  below.
                </p>
              ) : null}
              <p className="checkout-success-body">
                {paymentResult.message?.trim() ||
                  "Your order is confirmed. We'll prepare it with care and send updates if anything is unclear."}
              </p>
              <ol className="checkout-success-steps">
                <li>Your payment was processed securely with PayPal.</li>
                <li>
                  We may contact you at{" "}
                  <strong>{email.trim() || "the email address you used at checkout"}</strong> if we
                  have a question about personalization or shipping.
                </li>
                <li>
                  Need help? Email{" "}
                  <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>
                  {paymentResult.orderNumber ? (
                    <>
                      {" "}
                      and include order <strong>#{paymentResult.orderNumber}</strong>
                    </>
                  ) : null}
                  .
                </li>
              </ol>
              <p className="page-link-row checkout-success-actions">
                <Link href="/shop" className="btn btn-primary">
                  Continue shopping
                </Link>
                <Link href="/">Back to home</Link>
              </p>
              <details className="checkout-success-meta">
                <summary>Payment details (for support)</summary>
                <p>Checkout reference: {result.checkoutSessionId}</p>
                {paymentResult.paypalOrderId ? (
                  <p>PayPal order: {paymentResult.paypalOrderId}</p>
                ) : null}
                {paymentResult.orderId && !paymentResult.orderNumber ? (
                  <p>Order reference: {paymentResult.orderId}</p>
                ) : null}
              </details>
                </section>
              ) : null}
              </section>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
