/**
 * Values safe to pass to `next/image` `src` (absolute URL or root-relative path).
 * Rejects empty strings and strings that are not valid absolute URLs.
 */
export function storefrontImageSrcOrNull(url: string | null | undefined): string | null {
  let raw = typeof url === "string" ? url.trim() : "";
  if (!raw) {
    return null;
  }
  // Protocol-relative URLs (some CDNs / proxies) — `new URL("//host")` throws in Node.
  if (raw.startsWith("//")) {
    raw = `https:${raw}`;
  }
  if (raw.startsWith("/")) {
    return raw;
  }
  try {
    void new URL(raw);
    return raw;
  } catch {
    return null;
  }
}

export {
  isStorefrontCdnImageSrc,
  storefrontImageUnoptimized
} from "@/lib/storefront/image-cdn-env";
