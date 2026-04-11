"use client";

import {
  AdminToastStack,
  type AdminToast,
  type AdminToastKind
} from "@/components/admin/toast-stack";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type OrderStatus =
  | "pending_payment"
  | "paid"
  | "in_production"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "canceled"
  | "refunded"
  | "payment_failed";

type OrderSummary = {
  id: string;
  order_number: number;
  status: OrderStatus;
  customer_email: string;
  total_cents: number;
  currency: string;
  item_count: number;
  customization_item_count: number;
  has_customization_upload: boolean;
  shipping_destination: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItem = {
  id: string;
  quantity: number;
  line_total_cents: number;
  product_snapshot: Record<string, unknown>;
  customization_download_url: string | null;
  customization_upload_filename: string | null;
  customization_notes: string | null;
};

type OrderDetail = {
  id: string;
  order_number: number;
  status: OrderStatus;
  customer_email: string;
  customer_name: string | null;
  shipping_address: Record<string, unknown>;
  total_cents: number;
  currency: string;
  notes: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  items: OrderItem[];
};

type OrdersResponse = {
  items: OrderSummary[];
  nextCursor: string | null;
};

const ACTIONABLE_STATUSES: OrderStatus[] = [
  "ready_to_ship",
  "paid",
  "in_production"
];

const ACTIONABLE_PRIORITY: Record<OrderStatus, number> = {
  ready_to_ship: 0,
  paid: 1,
  in_production: 2,
  pending_payment: 10,
  shipped: 11,
  delivered: 12,
  canceled: 13,
  refunded: 14,
  payment_failed: 15
};

const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "in_production",
  in_production: "ready_to_ship",
  ready_to_ship: "shipped",
  shipped: "delivered"
};

const supabase = getSupabaseBrowserClient();

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatStatus(status: OrderStatus): string {
  return status
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_ORDER_STATUS[status] ?? null;
}

function getOrderStatusBadgeTone(status: OrderStatus): "is-warning" | "is-info" | "is-positive" | "is-danger" {
  if (status === "pending_payment") {
    return "is-warning";
  }
  if (status === "paid" || status === "in_production" || status === "ready_to_ship") {
    return "is-info";
  }
  if (status === "shipped" || status === "delivered") {
    return "is-positive";
  }
  return "is-danger";
}

function getOrderActionHint(status: OrderStatus, hasCustomizationUpload: boolean): string {
  if (status === "paid") {
    return hasCustomizationUpload
      ? "Open details, download the photo, then move to In Production."
      : "Start making the order, then move to In Production.";
  }
  if (status === "in_production") {
    return "When it is finished, move to Ready to Ship.";
  }
  if (status === "ready_to_ship") {
    return "Add carrier and tracking, then mark shipped.";
  }
  return "No action needed right now.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readSnapshotName(snapshot: Record<string, unknown>): string {
  const rawName = snapshot.name;
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    return rawName.trim();
  }
  return "Item";
}

function buildPackingSlipHtml(order: OrderSummary, detail: OrderDetail): string {
  const shipping = normalizeShippingAddress(detail.shipping_address);
  const addressLines = [
    shipping.fullName ?? detail.customer_name ?? "Recipient name missing",
    shipping.addressLine1 ?? "Address line 1 missing",
    shipping.addressLine2,
    [shipping.city, shipping.provinceOrState, shipping.postalCode].filter(Boolean).join(", "),
    shipping.countryCode,
    shipping.phone ? `Phone: ${shipping.phone}` : null
  ].filter((line): line is string => Boolean(line && line.trim().length > 0));

  const itemsHtml =
    detail.items.length > 0
      ? detail.items
          .map((item) => {
            const name = readSnapshotName(item.product_snapshot);
            const notes =
              typeof item.customization_notes === "string" &&
              item.customization_notes.trim().length > 0
                ? `<p class="meta">Notes: ${escapeHtml(item.customization_notes.trim())}</p>`
                : "";
            const upload =
              typeof item.customization_upload_filename === "string" &&
              item.customization_upload_filename.trim().length > 0
                ? `<p class="meta">Print file: ${escapeHtml(item.customization_upload_filename.trim())}</p>`
                : "";

            return `
              <li>
                <p><strong>${escapeHtml(name)}</strong> x ${item.quantity}</p>
                <p class="meta">Line total: ${escapeHtml(formatMoney(item.line_total_cents, detail.currency))}</p>
                ${upload}
                ${notes}
              </li>
            `;
          })
          .join("")
      : "<li><p>No items found for this order.</p></li>";

  const orderNote =
    typeof detail.notes === "string" && detail.notes.trim().length > 0
      ? `<section><h2>Order Note</h2><p>${escapeHtml(detail.notes.trim())}</p></section>`
      : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Packing Slip - Order #${order.order_number}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
        color: #111827;
        background: #ffffff;
      }
      .wrap {
        max-width: 760px;
        margin: 0 auto;
        padding: 20px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 2px solid #dbe2f2;
        padding-bottom: 12px;
        margin-bottom: 14px;
      }
      h1 { margin: 0; font-size: 22px; color: #1a2458; }
      h2 { margin: 0 0 8px; font-size: 14px; color: #1a2458; text-transform: uppercase; letter-spacing: 0.04em; }
      p { margin: 0 0 6px; }
      .muted { color: #4b5563; font-size: 13px; }
      section {
        border: 1px solid #dbe2f2;
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 10px;
      }
      ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
      li { break-inside: avoid; }
      .meta { color: #4b5563; font-size: 13px; }
      .totals {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        font-weight: 700;
      }
      @media print {
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div>
          <h1>AnglKiss Creations</h1>
          <p class="muted">Packing Slip</p>
        </div>
        <div>
          <p><strong>Order #${order.order_number}</strong></p>
          <p class="muted">Placed: ${escapeHtml(formatDateTime(order.created_at))}</p>
          <p class="muted">Status: ${escapeHtml(formatStatus(order.status))}</p>
        </div>
      </header>

      <section>
        <h2>Ship To</h2>
        ${addressLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        <p class="meta">Email: ${escapeHtml(order.customer_email)}</p>
      </section>

      <section>
        <h2>Items</h2>
        <ul>${itemsHtml}</ul>
      </section>

      <section>
        <div class="totals">
          <span>Total</span>
          <span>${escapeHtml(formatMoney(order.total_cents, order.currency))}</span>
        </div>
      </section>
      ${orderNote}
    </div>
  </body>
</html>`;
}

function readShippingValue(shippingAddress: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = shippingAddress[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

type NormalizedShippingAddress = {
  fullName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  provinceOrState: string | null;
  postalCode: string | null;
  countryCode: string | null;
  phone: string | null;
};

function normalizeShippingAddress(shippingAddress: Record<string, unknown>): NormalizedShippingAddress {
  return {
    fullName: readShippingValue(shippingAddress, [
      "full_name",
      "fullName",
      "recipient_name",
      "recipientName",
      "name"
    ]),
    addressLine1: readShippingValue(shippingAddress, [
      "address_line1",
      "addressLine1",
      "line1",
      "street1",
      "address1"
    ]),
    addressLine2: readShippingValue(shippingAddress, [
      "address_line2",
      "addressLine2",
      "line2",
      "street2",
      "address2"
    ]),
    city: readShippingValue(shippingAddress, ["city", "locality", "town"]),
    provinceOrState: readShippingValue(shippingAddress, [
      "province_code",
      "provinceCode",
      "province",
      "state_code",
      "state",
      "region"
    ]),
    postalCode: readShippingValue(shippingAddress, [
      "postal_code",
      "postalCode",
      "zip",
      "zip_code"
    ]),
    countryCode: readShippingValue(shippingAddress, [
      "country_code",
      "countryCode",
      "country"
    ]),
    phone: readShippingValue(shippingAddress, ["phone", "phone_number", "phoneNumber"])
  };
}

export default function AdminOrdersPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail | null>>({});
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  const [shipCarrierDraft, setShipCarrierDraft] = useState<Record<string, string>>({});
  const [shipTrackingNumberDraft, setShipTrackingNumberDraft] = useState<Record<string, string>>({});

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const nextToastId = useRef(1);

  const pushToast = useCallback((kind: AdminToastKind, text: string) => {
    const toast: AdminToast = {
      id: nextToastId.current++,
      kind,
      message: text
    };
    setToasts((current) => [...current, toast]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  async function callAdmin(path: string, init?: RequestInit): Promise<unknown> {
    if (!token) {
      throw new Error("Not logged in");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, {
      ...init,
      headers
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new Error((json.error as string | undefined) ?? `Request failed (${response.status})`);
    }

    return json;
  }

  async function loadOrders() {
    if (!token) {
      setOrders([]);
      setOrderDetails({});
      return;
    }

    setLoadingOrders(true);
    setError(null);

    try {
      const response = (await callAdmin("/api/admin/orders?limit=100")) as OrdersResponse;
      setOrders(response.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load orders");
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadOrderDetail(orderId: string): Promise<OrderDetail | null> {
    try {
      const response = (await callAdmin(`/api/admin/orders/${orderId}`)) as { order: OrderDetail };
      setOrderDetails((current) => ({
        ...current,
        [orderId]: response.order
      }));

      const order = response.order;
      setShipCarrierDraft((current) => {
        if ((current[orderId] ?? "").trim().length > 0) {
          return current;
        }
        return {
          ...current,
          [orderId]: order.shipping_carrier ?? ""
        };
      });
      setShipTrackingNumberDraft((current) => {
        if ((current[orderId] ?? "").trim().length > 0) {
          return current;
        }
        return {
          ...current,
          [orderId]: order.tracking_number ?? ""
        };
      });

      return order;
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Failed to load order detail");
      return null;
    }
  }

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }
      setToken(data.session?.access_token ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!error) {
      return;
    }
    pushToast("error", error);
    setError(null);
  }, [error, pushToast]);

  useEffect(() => {
    if (!message) {
      return;
    }
    pushToast("success", message);
    setMessage(null);
  }, [message, pushToast]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError(null);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        throw signInError;
      }

      setPassword("");
      setMessage("Signed in.");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Failed to sign in");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setMessage(null);
    await supabase.auth.signOut();
    setOrders([]);
    setOrderDetails({});
    setMessage("Signed out.");
  }

  async function toggleOrderExpanded(orderId: string) {
    const nextExpanded = !(expandedOrderIds[orderId] ?? false);
    setExpandedOrderIds((current) => ({
      ...current,
      [orderId]: nextExpanded
    }));

    if (nextExpanded && !orderDetails[orderId]) {
      await loadOrderDetail(orderId);
    }
  }

  async function updateOrderStatusTo(
    order: OrderSummary,
    nextStatus: OrderStatus,
    options?: {
      shipment?: {
        carrier: string;
        trackingNumber: string;
      };
    }
  ): Promise<boolean> {
    setBusyOrderId(order.id);
    setError(null);
    setMessage(null);

    try {
      await callAdmin(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          shipment: options?.shipment
        })
      });

      setMessage(`Order #${order.order_number} updated.`);
      await loadOrders();
      await loadOrderDetail(order.id);
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update order status");
      return false;
    } finally {
      setBusyOrderId(null);
    }
  }

  async function advanceOrder(order: OrderSummary) {
    const nextStatus = getNextOrderStatus(order.status);
    if (!nextStatus || nextStatus === "shipped") {
      return;
    }
    await updateOrderStatusTo(order, nextStatus);
  }

  async function markOrderShipped(order: OrderSummary) {
    const carrier = (shipCarrierDraft[order.id] ?? "").trim();
    const trackingNumber = (shipTrackingNumberDraft[order.id] ?? "").trim();

    if (!carrier) {
      setError("Carrier is required.");
      return;
    }
    if (!trackingNumber) {
      setError("Tracking number is required.");
      return;
    }

    await updateOrderStatusTo(order, "shipped", {
      shipment: {
        carrier,
        trackingNumber
      }
    });
  }

  async function removeOrderFromQueue(order: OrderSummary) {
    const confirmed = window.confirm(
      `Remove Order #${order.order_number} from the active queue?\n\nThis marks it as Canceled (it is not permanently deleted).`
    );
    if (!confirmed) {
      return;
    }

    await updateOrderStatusTo(order, "canceled");
  }

  async function printOrderPackingSlip(order: OrderSummary) {
    const detail = orderDetails[order.id] ?? (await loadOrderDetail(order.id));
    if (!detail) {
      return;
    }

    const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=900");
    if (!popup) {
      setError("Your browser blocked the print window. Please allow pop-ups and try again.");
      return;
    }

    popup.document.open();
    popup.document.write(buildPackingSlipHtml(order, detail));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  const actionableOrders = useMemo(() => {
    return [...orders]
      .filter((order) => ACTIONABLE_STATUSES.includes(order.status))
      .sort((left, right) => {
        const priorityDelta = ACTIONABLE_PRIORITY[left.status] - ACTIONABLE_PRIORITY[right.status];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      });
  }, [orders]);

  const queueCounts = useMemo(() => {
    return actionableOrders.reduce(
      (counts, order) => {
        if (order.status === "paid") {
          counts.paid += 1;
        } else if (order.status === "in_production") {
          counts.inProduction += 1;
        } else if (order.status === "ready_to_ship") {
          counts.readyToShip += 1;
        }
        return counts;
      },
      {
        paid: 0,
        inProduction: 0,
        readyToShip: 0
      }
    );
  }, [actionableOrders]);

  return (
    <main className="page-main admin-page">
      <h1>Orders</h1>
      <p className="admin-lead">Start at the top and move each order to the next step.</p>
      <p className="admin-link-row">
        <a href="/admin">Back to item manager</a>
      </p>

      <AdminToastStack toasts={toasts} onDismiss={dismissToast} />

      {!token ? (
        <section className="sectionCard">
          <h2>Sign In</h2>
          <form onSubmit={handleSignIn} className="formGrid authForm">
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="sectionCard">
            <div className="toolbar">
              <button type="button" onClick={handleSignOut}>
                Sign out
              </button>
              <button type="button" onClick={() => void loadOrders()} disabled={loadingOrders}>
                {loadingOrders ? "Refreshing..." : "Refresh list"}
              </button>
              <a href="/admin" className="toolbarLink">
                Back to items
              </a>
            </div>
          </section>

          <section className="sectionCard">
            <h2>Pack &amp; Print Queue</h2>
            <p className="admin-note-tight">
              Showing only <strong>Paid</strong>, <strong>In Production</strong>, and{" "}
              <strong>Ready to Ship</strong>.
            </p>
            <p className="admin-note-tight">
              {actionableOrders.length} order(s) need your attention right now.
            </p>
            <div className="admin-orders-stats" role="status" aria-label="Queue summary">
              <p className="admin-orders-stat">
                <strong>{queueCounts.paid}</strong>
                <span>Paid</span>
              </p>
              <p className="admin-orders-stat">
                <strong>{queueCounts.inProduction}</strong>
                <span>In Production</span>
              </p>
              <p className="admin-orders-stat">
                <strong>{queueCounts.readyToShip}</strong>
                <span>Ready to Ship</span>
              </p>
            </div>
            {loadingOrders ? <p className="admin-note-tight">Loading queue...</p> : null}

            <ul className="admin-card-list">
              {actionableOrders.map((order) => {
                const detail = orderDetails[order.id];
                const expanded = expandedOrderIds[order.id] ?? false;
                const nextStatus = getNextOrderStatus(order.status);
                const hasPrimaryMoveAction =
                  nextStatus !== null && nextStatus !== "shipped" && order.status !== "ready_to_ship";
                const createdDateLabel = formatDateTime(order.created_at);

                return (
                  <li key={order.id} className="itemCard">
                    <div className="admin-order-head">
                      <p className="admin-item-title">
                        <strong>Order #{order.order_number}</strong>
                      </p>
                      <span className={`admin-badge ${getOrderStatusBadgeTone(order.status)}`}>
                        {formatStatus(order.status)}
                      </span>
                    </div>
                    <p className="admin-order-meta">{order.customer_email}</p>
                    <a className="admin-quick-link" href={`mailto:${order.customer_email}`}>
                      Email customer
                    </a>
                    <p className="admin-order-meta">
                      {formatMoney(order.total_cents, order.currency)} • {order.item_count} item(s) • Placed{" "}
                      {createdDateLabel}
                    </p>
                    <p className="admin-item-line-muted">
                      Ship to: {order.shipping_destination ?? "Open details to view destination"}
                    </p>
                    {order.customization_item_count > 0 ? (
                      <p className="admin-item-line-muted">
                        Custom print work: {order.customization_item_count} item(s)
                        {order.has_customization_upload ? " with uploaded file(s)." : "."}
                      </p>
                    ) : null}
                    {order.shipping_carrier && order.tracking_number ? (
                      <p className="admin-item-line-muted">
                        Tracking: {order.shipping_carrier} • {order.tracking_number}
                      </p>
                    ) : null}
                    <p className="admin-item-line-muted">
                      Next step: {getOrderActionHint(order.status, order.has_customization_upload)}
                    </p>

                    {order.status === "ready_to_ship" ? (
                      <div className="admin-divider-top">
                        <div className="actionGrid is-center actionGridTight">
                          <label className="compactLabel">
                            Carrier
                            <input
                              placeholder="Canada Post"
                              value={shipCarrierDraft[order.id] ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setShipCarrierDraft((current) => ({
                                  ...current,
                                  [order.id]: value
                                }));
                              }}
                            />
                          </label>
                          <label className="compactLabel">
                            Tracking number
                            <input
                              placeholder="Tracking code"
                              value={shipTrackingNumberDraft[order.id] ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setShipTrackingNumberDraft((current) => ({
                                  ...current,
                                  [order.id]: value
                                }));
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="admin-primary-action"
                            onClick={() => void markOrderShipped(order)}
                            disabled={busyOrderId === order.id}
                          >
                            Mark shipped
                          </button>
                        </div>
                        <p className="admin-note-tight">Required: carrier + tracking number.</p>
                      </div>
                    ) : (
                      <div className="admin-divider-top">
                        {hasPrimaryMoveAction && nextStatus ? (
                          <button
                            type="button"
                            className="admin-primary-action"
                            onClick={() => void advanceOrder(order)}
                            disabled={busyOrderId === order.id}
                          >
                            Move to {formatStatus(nextStatus)}
                          </button>
                        ) : null}
                      </div>
                    )}

                    <div className="actionGrid is-center actionGridTight">
                      <button
                        type="button"
                        className="dangerButton"
                        onClick={() => void removeOrderFromQueue(order)}
                        disabled={busyOrderId === order.id}
                      >
                        Remove from queue
                      </button>
                      <button
                        type="button"
                        onClick={() => void printOrderPackingSlip(order)}
                        disabled={busyOrderId === order.id}
                      >
                        Print packing slip
                      </button>
                      <button type="button" onClick={() => void toggleOrderExpanded(order.id)}>
                        {expanded ? "Hide details" : "View details"}
                      </button>
                    </div>

                    {expanded ? (
                      <div className="admin-divider-block">
                        {!detail ? (
                          <p>Loading details...</p>
                        ) : (
                          <>
                            {(() => {
                              const shipping = normalizeShippingAddress(detail.shipping_address);
                              const missingShippingFields = [
                                !shipping.fullName ? "full name" : null,
                                !shipping.addressLine1 ? "address line 1" : null,
                                !shipping.city ? "city" : null,
                                !shipping.provinceOrState ? "province/state" : null,
                                !shipping.postalCode ? "postal/zip code" : null,
                                !shipping.countryCode ? "country code" : null
                              ].filter(Boolean) as string[];

                              return (
                                <div className="admin-shipping-panel">
                                  <p className="admin-item-line">
                                    <strong>Shipping Address</strong>
                                  </p>
                                  <p className="admin-item-line">
                                    {shipping.fullName ?? detail.customer_name ?? "Missing full name"}
                                  </p>
                                  <p className="admin-item-line">
                                    {shipping.addressLine1 ?? "Missing address line 1"}
                                  </p>
                                  {shipping.addressLine2 ? (
                                    <p className="admin-item-line">{shipping.addressLine2}</p>
                                  ) : null}
                                  <p className="admin-item-line">
                                    {[shipping.city, shipping.provinceOrState, shipping.postalCode]
                                      .filter(Boolean)
                                      .join(", ") || "Missing city/province/postal"}
                                  </p>
                                  <p className="admin-item-line">
                                    {shipping.countryCode ?? "Missing country code"}
                                  </p>
                                  <p className="admin-item-line">
                                    Phone: {shipping.phone ?? "Not provided"}
                                  </p>

                                  {missingShippingFields.length > 0 ? (
                                    <p className="admin-shipping-missing">
                                      Missing shipping fields: {missingShippingFields.join(", ")}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })()}

                            <p className="admin-item-line">
                              <strong>Print Files</strong>
                            </p>
                            <ul className="admin-list-indented">
                              {detail.items.length > 0 ? (
                                detail.items.map((item) => {
                                  const snapshotName =
                                    typeof item.product_snapshot?.name === "string"
                                      ? item.product_snapshot.name
                                      : "Item";

                                  return (
                                    <li key={item.id} className="admin-order-file-item">
                                      <p className="admin-item-line">
                                        {snapshotName} x {item.quantity} (
                                        {formatMoney(item.line_total_cents, detail.currency)})
                                      </p>
                                      {item.customization_download_url ? (
                                        <p className="admin-item-line">
                                          <a
                                            href={item.customization_download_url}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Download print image
                                            {item.customization_upload_filename
                                              ? ` (${item.customization_upload_filename})`
                                              : ""}
                                          </a>
                                        </p>
                                      ) : (
                                        <p className="admin-item-line-muted">No upload file for this item.</p>
                                      )}
                                      {item.customization_notes ? (
                                        <p className="admin-item-line-muted">
                                          Notes: {item.customization_notes}
                                        </p>
                                      ) : null}
                                    </li>
                                  );
                                })
                              ) : (
                                <li>No items found for this order.</li>
                              )}
                            </ul>

                            {detail.notes ? (
                              <p className="admin-item-line">
                                <strong>Order note:</strong> {detail.notes}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {!loadingOrders && actionableOrders.length === 0 ? (
              <p className="admin-note">
                No active orders right now. New paid orders will appear here automatically.
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
