"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: Record<string, unknown>) => {
        render: (container: HTMLElement) => Promise<void>;
      };
    };
  }
}

export type PayPalCaptureSuccess = {
  checkoutSessionId: string;
  paypalOrderId: string;
  paypalStatus: string;
  finalized: boolean;
  orderId: string | null;
  message: string | null;
};

type PayPalButtonProps = {
  checkoutSessionId: string;
  onSuccess: (result: PayPalCaptureSuccess) => void;
};

let paypalScriptPromise: Promise<void> | null = null;

function getPublicPayPalClientId(): string | null {
  const value = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function ensurePayPalScript(clientId: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.paypal) {
    return Promise.resolve();
  }

  if (paypalScriptPromise) {
    return paypalScriptPromise;
  }

  paypalScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("paypal-js-sdk");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load PayPal SDK")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "paypal-js-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });

  return paypalScriptPromise;
}

export function PayPalButton({ checkoutSessionId, onSuccess }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = getPublicPayPalClientId();
    if (!clientId) {
      setError("Missing NEXT_PUBLIC_PAYPAL_CLIENT_ID");
      return;
    }
    const resolvedClientId: string = clientId;

    let cancelled = false;

    async function renderButton() {
      try {
        setError(null);
        await ensurePayPalScript(resolvedClientId);

        if (cancelled || !containerRef.current || !window.paypal) {
          return;
        }

        containerRef.current.innerHTML = "";

        const buttons = window.paypal.Buttons({
          createOrder: async () => {
            const response = await fetch(`/api/checkout/sessions/${checkoutSessionId}/paypal-order/create`, {
              method: "POST"
            });
            const payload = (await response.json().catch(() => ({}))) as {
              paypalOrderId?: string;
              error?: string;
            };

            if (!response.ok || !payload.paypalOrderId) {
              throw new Error(payload.error ?? "Failed to create PayPal order");
            }

            return payload.paypalOrderId;
          },
          onApprove: async () => {
            const response = await fetch(`/api/checkout/sessions/${checkoutSessionId}/paypal-order/capture`, {
              method: "POST"
            });
            const payload = (await response.json().catch(() => ({}))) as PayPalCaptureSuccess & { error?: string };

            if (!response.ok) {
              setError(payload.error ?? "Failed to capture payment");
              return;
            }

            onSuccess(payload);
          },
          onError: (callbackError: unknown) => {
            setError(callbackError instanceof Error ? callbackError.message : "PayPal checkout failed");
          },
          onCancel: () => {
            setError("Payment cancelled.");
          }
        });

        await buttons.render(containerRef.current);
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Failed to initialize PayPal");
        }
      }
    }

    void renderButton();

    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, onSuccess]);

  return (
    <section className="paypal-panel">
      <h3>Pay with PayPal</h3>
      <div ref={containerRef} className="paypal-button-mount" />
      {error ? <p className="checkout-error">{error}</p> : null}
    </section>
  );
}
