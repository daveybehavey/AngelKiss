export type RequestMeta = {
  requestId: string;
  method: string;
  path: string;
  userAgent: string | null;
};

function safeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}`;
}

function parsePathFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function getRequestMeta(request: Request): RequestMeta {
  const requestIdHeader =
    request.headers.get("x-request-id") ??
    request.headers.get("cf-ray") ??
    request.headers.get("x-correlation-id");
  const requestId =
    requestIdHeader && requestIdHeader.trim().length > 0
      ? requestIdHeader.trim()
      : safeRequestId();

  const userAgent = request.headers.get("user-agent");

  return {
    requestId,
    method: request.method,
    path: parsePathFromUrl(request.url),
    userAgent: userAgent ? userAgent.slice(0, 160) : null
  };
}
