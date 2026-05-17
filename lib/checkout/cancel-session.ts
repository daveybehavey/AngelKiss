/**
 * Client-safe helper to release checkout inventory holds.
 */
export async function cancelCheckoutSession(
  checkoutSessionId: string,
  status: "failed" | "expired" = "failed"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!checkoutSessionId.trim()) {
    return { ok: false, error: "Missing checkout session id" };
  }

  try {
    const response = await fetch(`/api/checkout/sessions/${encodeURIComponent(checkoutSessionId)}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      keepalive: true
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: typeof payload.error === "string" ? payload.error : `Cancel failed (${response.status})`
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cancel request failed"
    };
  }
}
