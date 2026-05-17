type PayPalAccessTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type PayPalApiError = {
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
};

export type PayPalOrderCreateResponse = {
  id: string;
  status: string;
};

export type PayPalOrderCaptureResponse = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
      }>;
    };
  }>;
};

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function getPayPalMode(): "sandbox" | "live" {
  const mode = process.env.PAYPAL_ENV?.trim().toLowerCase();
  if (mode === "live") {
    return "live";
  }
  return "sandbox";
}

function getPayPalBaseUrl(): string {
  return getPayPalMode() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getPayPalClientId(): string {
  const direct = process.env.PAYPAL_CLIENT_ID?.trim();
  const liveClientId = process.env.PAYPAL_LIVE_CLIENT_ID?.trim();
  const sandboxClientId = process.env.PAYPAL_SANDBOX_CLIENT_ID?.trim();
  const testClientId = process.env.PAYPAL_TEST_CLIENT_ID?.trim();
  const devClientId = process.env.PAYPAL_CLIENTS_DEV_CLIENT?.trim();
  const publicClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  if (getPayPalMode() === "sandbox") {
    if (sandboxClientId) {
      return sandboxClientId;
    }
    if (testClientId) {
      return testClientId;
    }
    if (devClientId) {
      return devClientId;
    }
    if (direct) {
      return direct;
    }
    if (publicClientId) {
      return publicClientId;
    }
  } else {
    if (liveClientId) {
      return liveClientId;
    }
    if (direct) {
      return direct;
    }
    if (publicClientId) {
      return publicClientId;
    }
    if (testClientId) {
      return testClientId;
    }
  }
  throw new Error(
    "Missing PayPal client id: set PAYPAL_LIVE_CLIENT_ID / PAYPAL_CLIENT_ID (live), PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_TEST_CLIENT_ID (sandbox), or NEXT_PUBLIC_PAYPAL_CLIENT_ID"
  );
}

function getPayPalClientSecret(): string {
  const direct = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const liveSecret = process.env.PAYPAL_LIVE_CLIENT_SECRET?.trim();
  const sandboxSecret = process.env.PAYPAL_SANDBOX_CLIENT_SECRET?.trim();
  const testSecret = process.env.PAYPAL_TEST_CLIENT_SECRET?.trim();
  const devSecret = process.env.PAYPAL_CLIENTS_DEV_SECRET?.trim();
  if (getPayPalMode() === "sandbox") {
    if (sandboxSecret) {
      return sandboxSecret;
    }
    if (testSecret) {
      return testSecret;
    }
    if (devSecret) {
      return devSecret;
    }
    if (direct) {
      return direct;
    }
  } else {
    if (liveSecret) {
      return liveSecret;
    }
    if (direct) {
      return direct;
    }
    if (testSecret) {
      return testSecret;
    }
  }
  throw new Error(
    "Missing PayPal client secret: set PAYPAL_LIVE_CLIENT_SECRET / PAYPAL_CLIENT_SECRET (live), PAYPAL_SANDBOX_CLIENT_SECRET / PAYPAL_TEST_CLIENT_SECRET (sandbox)"
  );
}

function getBasicAuthHeader(): string {
  const clientId = getPayPalClientId();
  const clientSecret = getPayPalClientSecret();
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now) {
    return cachedToken.token;
  }

  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getBasicAuthHeader()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const payload = (await response.json().catch(() => ({}))) as PayPalAccessTokenResponse | PayPalApiError;
  if (!response.ok || !("access_token" in payload)) {
    const message = "message" in payload && typeof payload.message === "string" ? payload.message : "Failed to fetch PayPal access token";
    throw new Error(message);
  }

  cachedToken = {
    token: payload.access_token,
    expiresAtMs: now + payload.expires_in * 1000
  };

  return payload.access_token;
}

async function paypalRequest<TResponse>(
  path: string,
  options: {
    method: "POST" | "GET";
    body?: Record<string, unknown>;
  }
): Promise<TResponse> {
  const token = await getAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = (await response.json().catch(() => ({}))) as TResponse & PayPalApiError;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : "PayPal API request failed";
    throw new Error(message);
  }

  return payload;
}

export async function createPayPalOrder(input: {
  checkoutSessionId: string;
  totalCents: number;
  currencyCode: string;
}): Promise<PayPalOrderCreateResponse> {
  const amountValue = (input.totalCents / 100).toFixed(2);

  return paypalRequest<PayPalOrderCreateResponse>("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.checkoutSessionId,
          custom_id: input.checkoutSessionId,
          amount: {
            currency_code: input.currencyCode,
            value: amountValue
          }
        }
      ]
    }
  });
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrderCaptureResponse> {
  return paypalRequest<PayPalOrderCaptureResponse>(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST"
  });
}

export function extractCaptureId(payload: PayPalOrderCaptureResponse): string | null {
  const captureId = payload.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (captureId && captureId.trim().length > 0) {
    return captureId;
  }
  return null;
}

export type PayPalVerifyWebhookSignatureResponse = {
  verification_status: string;
};

/**
 * Calls PayPal `POST /v1/notifications/verify-webhook-signature`.
 * Requires the same OAuth credentials as checkout. Returns PayPal’s status string
 * (`SUCCESS`, `FAILURE`, etc.).
 */
export async function verifyPayPalWebhookSignature(input: {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookId: string;
  webhookEvent: Record<string, unknown>;
}): Promise<PayPalVerifyWebhookSignatureResponse> {
  return paypalRequest<PayPalVerifyWebhookSignatureResponse>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: input.authAlgo,
      cert_url: input.certUrl,
      transmission_id: input.transmissionId,
      transmission_sig: input.transmissionSig,
      transmission_time: input.transmissionTime,
      webhook_id: input.webhookId,
      webhook_event: input.webhookEvent
    }
  });
}
