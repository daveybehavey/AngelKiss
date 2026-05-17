/** Normalize shopper-entered promo codes (DB stores uppercase). */
export function normalizePromoCodeInput(value: string): string {
  return value.trim().toUpperCase();
}
