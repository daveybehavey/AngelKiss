/**
 * Turn iOS camera-roll style names (and their humanized titles) into shopper-friendly titles.
 * Long numeric asset ids are never shown — those rows get a short catalog-style name instead.
 */

/** Canonical catalog title prefix from repair/import (`AnglKiss Gallery · NNN`). Legacy `AngiKiss gallery ·` is still recognized. */
export const GALLERY_PLACEHOLDER_TITLE = "In-house gallery artwork";

const CATALOG_TITLE_RE = /^(?:AnglKiss Gallery|AngiKiss gallery) · \d+$/i;
const CATALOG_TITLE_NUM_RE = /^(?:AnglKiss Gallery|AngiKiss gallery) · (\d+)$/i;

/**
 * Sequential public title. Supports more than 999 entries (4+ digit suffix).
 * @param {number} n 1-based index
 */
export function assignGalleryCatalogTitle(n) {
  const safe = Math.max(1, Math.floor(Number(n)) || 1);
  const digits = safe > 999 ? 4 : 3;
  return `AnglKiss Gallery · ${String(safe).padStart(digits, "0")}`;
}

/** True if this title should be replaced with a catalog code (repair / import). */
export function needsCatalogTitle(title) {
  const t = String(title ?? "").trim();
  if (!t) {
    return true;
  }
  if (t === GALLERY_PLACEHOLDER_TITLE) {
    return true;
  }
  if (CATALOG_TITLE_RE.test(t)) {
    return false;
  }
  if (/^studio\s+print\s+\d{5,}/i.test(t)) {
    return true;
  }
  const rest = t.replace(/^studio\s+print\s+/i, "").trim();
  return /^[\d\s]+$/.test(rest) || /^[\d\s]+\s+[1-9]\d?$/.test(rest);
}

/**
 * @param {string} raw - filename stem or gallery title with spaces
 * @returns {string} max 200 chars for DB title column
 */
export function prettifyStudioPrintTitle(raw) {
  let s = String(raw ?? "").trim();
  if (!s) {
    return GALLERY_PLACEHOLDER_TITLE;
  }

  s = s.replace(/[\s_]+/g, " ").trim();

  if (CATALOG_TITLE_RE.test(s)) {
    const m = s.match(CATALOG_TITLE_NUM_RE);
    if (m) {
      return assignGalleryCatalogTitle(Number.parseInt(m[1], 10));
    }
  }

  // Leading YYYYMMDD (underscore or space after)
  s = s.replace(/^\d{8}\s+/i, "");

  // Trailing "iOS" / "IOS" (Photos duplicate saves add " 1", " 2" after iOS — keep that number)
  s = s.replace(/\s+iOS\s*(\d+)?\s*$/i, (_, num) => (num ? ` ${num}` : ""));

  s = s.trim();
  if (!s) {
    return GALLERY_PLACEHOLDER_TITLE;
  }

  const withoutStudio = s.replace(/^studio\s+print\s+/i, "").trim();
  if (
    /^[\d\s]+$/.test(withoutStudio) ||
    /^[\d\s]+\s+[1-9]\d?$/.test(withoutStudio)
  ) {
    return GALLERY_PLACEHOLDER_TITLE;
  }

  if (/^[\d\s]+$/.test(s)) {
    return GALLERY_PLACEHOLDER_TITLE;
  }

  const parts = s.split(/\s+/).map((w) => {
    if (/^\d+$/.test(w)) {
      return w;
    }
    if (!/[a-z]/i.test(w)) {
      return w;
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  let out = parts.join(" ");
  if (out.length > 200) {
    out = out.slice(0, 197) + "…";
  }
  return out;
}

/**
 * @param {string} filePath
 * @param {(p: string, ext: string) => string} basename
 * @param {(p: string) => string} extname
 */
export function titleFromImageFilePath(filePath, basename, extname) {
  const stem = basename(filePath, extname(filePath));
  const spaced = stem
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .trim()
    .replace(/\s+/g, " ");
  return prettifyStudioPrintTitle(spaced);
}
