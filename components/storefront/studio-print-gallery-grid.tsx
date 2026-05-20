"use client";

import { ImageLightbox } from "@/components/storefront/image-lightbox";
import {
  getStorefrontGridImageUrl,
  getStorefrontLightboxImageUrl,
  STOREFRONT_THUMB_IMAGE_WIDTH,
  storefrontGridImageUnoptimized
} from "@/lib/storefront/storefront-image-src";
import {
  shopHrefForStudioPrint,
  studioPrintImageSrcForNextImage
} from "@/lib/storefront/studio-print-client";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";

type StudioPrintGalleryGridProps = {
  prints: PublicStudioPrint[];
  selectedPrintId?: string | null;
  onSelectPrint?: (print: PublicStudioPrint) => void;
  /** When set, tiles link to shop with studio_print query instead of calling onSelectPrint only. */
  linkToShop?: boolean;
};

type LightboxState = {
  src: string;
  alt: string;
  unoptimized: boolean;
};

export function StudioPrintGalleryGrid({
  prints,
  selectedPrintId,
  onSelectPrint,
  linkToShop = true
}: StudioPrintGalleryGridProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  if (prints.length === 0) {
    return <p className="gallery-empty-note">No prints match this filter.</p>;
  }

  return (
    <>
      <ul className="studio-print-gallery-grid" aria-label="Studio prints">
        {prints.map((print, index) => {
          const selected = selectedPrintId === print.id;
          const imageAlt = print.alt_text?.trim() || print.title;
          const thumbSrc =
            getStorefrontGridImageUrl(print.image_url, { width: STOREFRONT_THUMB_IMAGE_WIDTH }) ??
            studioPrintImageSrcForNextImage(print.image_url);
          const lightboxSrc =
            getStorefrontLightboxImageUrl(print.image_url) ??
            studioPrintImageSrcForNextImage(print.image_url);
          const href = shopHrefForStudioPrint(print);

          const imageTrigger = (
            <button
              type="button"
              className="studio-print-gallery-image-trigger"
              onClick={() =>
                setLightbox({
                  src: lightboxSrc,
                  alt: imageAlt,
                  unoptimized: storefrontGridImageUnoptimized(lightboxSrc)
                })
              }
              aria-label={`View larger image of ${print.title}`}
            >
              <span className="studio-print-gallery-thumb">
                <Image
                  src={thumbSrc}
                  alt=""
                  fill
                  className="studio-print-gallery-thumb-img"
                  sizes="(max-width: 520px) 45vw, 200px"
                  loading={index < 8 ? "eager" : "lazy"}
                  decoding="async"
                  unoptimized={storefrontGridImageUnoptimized(thumbSrc)}
                />
              </span>
            </button>
          );

          const tileBody = (
            <>
              <span className="studio-print-gallery-tile-title">{print.title}</span>
              {print.subtitle ? (
                <span className="studio-print-gallery-tile-sub">{print.subtitle}</span>
              ) : null}
            </>
          );

          return (
            <li
              key={print.id}
              className={`studio-print-gallery-card ${selected ? "is-selected" : ""}`}
            >
              {imageTrigger}
              {linkToShop && !onSelectPrint ? (
                <Link
                  href={href}
                  className="studio-print-gallery-body-link"
                  aria-current={selected ? "true" : undefined}
                  prefetch={false}
                >
                  {tileBody}
                </Link>
              ) : (
                <button
                  type="button"
                  className="studio-print-gallery-select-trigger"
                  aria-pressed={selected}
                  onClick={() => onSelectPrint?.(print)}
                >
                  {tileBody}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ImageLightbox
        open={lightbox !== null}
        onClose={closeLightbox}
        src={lightbox?.src ?? ""}
        alt={lightbox?.alt ?? ""}
        unoptimized={lightbox?.unoptimized}
      />
    </>
  );
}
