const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNewsletterEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length > 254 || trimmed.length < 5) {
    return null;
  }
  if (!EMAIL_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}
