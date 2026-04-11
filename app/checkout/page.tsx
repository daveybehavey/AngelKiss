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
import { lineTotalCents, type CheckoutShippingAddress } from "@/lib/storefront/cart";
import { useCallback, useMemo, useState } from "react";

type CheckoutResult = {
  checkoutSessionId: string;
  status: string;
  expiresAt: string;
  totals: {
    subtotal_cents: number;
    shipping_cents: number;
    total_cents: number;
    shipping_zone: string;
    free_shipping_applied: boolean;
  };
};

type CountryCode = "CA" | "US";
type RegionOption = { code: string; label: string };

const COUNTRY_OPTIONS: Array<{ code: CountryCode; label: string }> = [
  { code: "CA", label: "Canada" },
  { code: "US", label: "United States" }
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
  ],
  US: [
    { code: "AL", label: "Alabama" },
    { code: "AK", label: "Alaska" },
    { code: "AZ", label: "Arizona" },
    { code: "AR", label: "Arkansas" },
    { code: "CA", label: "California" },
    { code: "CO", label: "Colorado" },
    { code: "CT", label: "Connecticut" },
    { code: "DE", label: "Delaware" },
    { code: "FL", label: "Florida" },
    { code: "GA", label: "Georgia" },
    { code: "HI", label: "Hawaii" },
    { code: "ID", label: "Idaho" },
    { code: "IL", label: "Illinois" },
    { code: "IN", label: "Indiana" },
    { code: "IA", label: "Iowa" },
    { code: "KS", label: "Kansas" },
    { code: "KY", label: "Kentucky" },
    { code: "LA", label: "Louisiana" },
    { code: "ME", label: "Maine" },
    { code: "MD", label: "Maryland" },
    { code: "MA", label: "Massachusetts" },
    { code: "MI", label: "Michigan" },
    { code: "MN", label: "Minnesota" },
    { code: "MS", label: "Mississippi" },
    { code: "MO", label: "Missouri" },
    { code: "MT", label: "Montana" },
    { code: "NE", label: "Nebraska" },
    { code: "NV", label: "Nevada" },
    { code: "NH", label: "New Hampshire" },
    { code: "NJ", label: "New Jersey" },
    { code: "NM", label: "New Mexico" },
    { code: "NY", label: "New York" },
    { code: "NC", label: "North Carolina" },
    { code: "ND", label: "North Dakota" },
    { code: "OH", label: "Ohio" },
    { code: "OK", label: "Oklahoma" },
    { code: "OR", label: "Oregon" },
    { code: "PA", label: "Pennsylvania" },
    { code: "RI", label: "Rhode Island" },
    { code: "SC", label: "South Carolina" },
    { code: "SD", label: "South Dakota" },
    { code: "TN", label: "Tennessee" },
    { code: "TX", label: "Texas" },
    { code: "UT", label: "Utah" },
    { code: "VT", label: "Vermont" },
    { code: "VA", label: "Virginia" },
    { code: "WA", label: "Washington" },
    { code: "WV", label: "West Virginia" },
    { code: "WI", label: "Wisconsin" },
    { code: "WY", label: "Wyoming" },
    { code: "DC", label: "District of Columbia" }
  ]
};

function normalizeCountryCode(value: string): CountryCode {
  return normalizeCode(value) === "US" ? "US" : "CA";
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

  const normalizedCountryCode = normalizeCountryCode(shippingAddress.country_code);
  const regionOptions = REGION_OPTIONS[normalizedCountryCode];

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
    setResult(null);
    setPaymentResult(null);

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
          }))
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

      setResult(payload as CheckoutResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected checkout error");
    } finally {
      setBusy(false);
    }
  }

  const handlePaymentSuccess = useCallback(
    (payload: PayPalCaptureSuccess) => {
      setPaymentResult(payload);
      clearCart();
    },
    [clearCart]
  );

  return (
    <main className="page-main checkout-page">
      <section className="panel page-intro">
        <h1 className="page-title">Checkout</h1>
        <p className="page-lead">
          Add your shipping details, review your order, then pay securely with PayPal.
        </p>
        <p className="page-link-row">
          <a href="/shop">Shop</a>
          <a href="/cart">Cart</a>
        </p>
      </section>

      <section className="panel checkout-summary">
        <h2>Your Order at a Glance</h2>
        <p className="checkout-helper-note">Shipping to: {shippingAddressSummary}</p>
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
        <p className="summary-line">
          <span>Cart subtotal</span>
          <strong>{formatMoney(subtotalCents, currency)}</strong>
        </p>
        <ul className="checkout-item-list" aria-label="Items in checkout">
          {items.map((item) => (
            <li key={item.cart_item_id} className="checkout-item-row">
              <span>
                {item.name} x {item.quantity}
              </span>
              <strong>{formatMoney(lineTotalCents(item), item.currency)}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel checkout-form-panel">
        <h2>Contact + Shipping</h2>
        <form onSubmit={handleCreateCheckoutSession} className="checkout-form-grid">
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
                  country_code: normalizeCountryCode(event.target.value),
                  province_code: REGION_OPTIONS[normalizeCountryCode(event.target.value)][0]?.code ?? "",
                  postal_code: normalizePostalCodeInput(
                    normalizeCountryCode(event.target.value),
                    current.postal_code
                  )
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
            Province / State
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
            Postal/ZIP code
            <input
              className="field-control"
              required
              autoComplete="postal-code"
              enterKeyHint="next"
              value={shippingAddress.postal_code}
              onChange={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  postal_code: normalizePostalCodeInput(
                    normalizeCountryCode(current.country_code),
                    event.target.value
                  )
                }))
              }
              onBlur={(event) =>
                setShippingAddress((current) => ({
                  ...current,
                  postal_code: normalizePostalCodeInput(
                    normalizeCountryCode(current.country_code),
                    event.target.value
                  )
                }))
              }
              disabled={busy}
            />
            <span className="form-hint">
              {normalizedCountryCode === "CA"
                ? "Canadian format: A1A 1A1"
                : "US format: 12345 or 12345-6789"}
            </span>
          </label>

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

          <button type="submit" className="btn btn-primary checkout-submit" disabled={!canSubmit || busy}>
            {busy ? "Preparing checkout..." : "Continue to payment"}
          </button>
        </form>
        <p className="checkout-helper-note">
          By continuing, you accept our{" "}
          <a href="/shipping">Shipping Policy</a> and{" "}
          <a href="/returns">Returns &amp; Refunds</a>.
        </p>
      </section>

      {error ? <p className="checkout-error">{error}</p> : null}

      {result ? (
        <section className="panel checkout-result-panel">
          <h2>Almost Done: Secure Payment</h2>
          <p className="checkout-helper-note">
            Complete payment below. Do not close this page until confirmation appears.
          </p>
          <p className="checkout-session-id">Checkout ref: {result.checkoutSessionId}</p>
          <p className="summary-line">
            <span>Status</span>
            <strong>{result.status}</strong>
          </p>
          <p className="summary-line">
            <span>Subtotal</span>
            <strong>{formatMoney(result.totals.subtotal_cents, currency)}</strong>
          </p>
          <p className="summary-line">
            <span>Shipping</span>
            <strong>{formatMoney(result.totals.shipping_cents, currency)}</strong>
          </p>
          <p className="summary-line">
            <span>Total</span>
            <strong>{formatMoney(result.totals.total_cents, currency)}</strong>
          </p>
          <p className="summary-line">
            <span>Shipping zone</span>
            <strong>{result.totals.shipping_zone}</strong>
          </p>
          {result.totals.free_shipping_applied ? (
            <p className="checkout-free-shipping">Great news: free shipping was applied.</p>
          ) : null}

          {!paymentResult ? (
            <PayPalButton
              checkoutSessionId={result.checkoutSessionId}
              onSuccess={handlePaymentSuccess}
            />
          ) : null}

          {paymentResult ? (
            <section className="checkout-payment-success">
              <h3>You&apos;re All Set</h3>
              <p>PayPal Order: {paymentResult.paypalOrderId}</p>
              <p>Order ID: {paymentResult.orderId ?? "Pending"}</p>
              <p>{paymentResult.message ?? "Order processed."}</p>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
