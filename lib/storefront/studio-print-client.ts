import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import {
  storefrontImageSrcOrNull,
  storefrontImageUnoptimized
} from "@/lib/storefront/storefront-image-src";

/** Session hint when shopper picks a print from the homepage or shop link before opening a PDP. */
export const STUDIO_PRINT_SESSION_STORAGE_KEY = "anglkiss_studio_print_id";

/** Static placeholder when a studio print row has no signed image URL yet. */
export const STUDIO_PRINT_COMING_SOON_IMAGE = "/marketing/studio-gallery/coming-soon.svg";

/**
 * Next/Image requires a parseable `src`. `??` does not replace `""`, and host-only CDN
 * mistakes are caught here so callers always get a safe value.
 */
export function studioPrintImageSrcForNextImage(imageUrl: string | null | undefined): string {
  return storefrontImageSrcOrNull(imageUrl) ?? STUDIO_PRINT_COMING_SOON_IMAGE;
}

export function studioPrintImageUnoptimized(src: string): boolean {
  return src === STUDIO_PRINT_COMING_SOON_IMAGE || storefrontImageUnoptimized(src);
}

export function shopHrefForStudioPrint(
  print: Pick<PublicStudioPrint, "id" | "primary_cta_slug">
): string {
  const slug = print.primary_cta_slug?.trim();
  if (slug) {
    return `/shop/${encodeURIComponent(slug)}?studio_print=${print.id}`;
  }
  return `/shop?category=custom_sublimation&sublimation_mode=customer_upload&studio_print=${print.id}`;
}
