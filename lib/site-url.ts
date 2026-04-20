const fallback = "http://localhost:3000";

export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return fallback;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}
