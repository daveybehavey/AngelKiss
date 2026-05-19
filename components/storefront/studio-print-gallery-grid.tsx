"use client";

import {
  getStorefrontGridImageUrl,
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

type StudioPrintGalleryGridProps = {
  prints: PublicStudioPrint[];
  selectedPrintId?: string | null;
  onSelectPrint?: (print: PublicStudioPrint) => void;
  /** When set, tiles link to shop with studio_print query instead of calling onSelectPrint only. */
  linkToShop?: boolean;
};

export function StudioPrintGalleryGrid({
  prints,
  selectedPrintId,
  onSelectPrint,
  linkToShop = true
}: StudioPrintGalleryGridProps) {
  if (prints.length === 0) {
    return <p className="gallery-empty-note">No prints match this filter.</p>;
  }

  return (
    <ul className="studio-print-gallery-grid" aria-label="Studio prints">
      {prints.map((print, index) => {
        const selected = selectedPrintId === print.id;
        const thumbSrc =
          getStorefrontGridImageUrl(print.image_url, { width: STOREFRONT_THUMB_IMAGE_WIDTH }) ??
          studioPrintImageSrcForNextImage(print.image_url);
        const href = shopHrefForStudioPrint(print);

        const tileInner = (
          <>
            <span className="studio-print-gallery-thumb">
              <Image
                src={thumbSrc}
                alt={print.alt_text?.trim() || print.title}
                fill
                className="studio-print-gallery-thumb-img"
                sizes="(max-width: 520px) 45vw, 200px"
                loading={index < 8 ? "eager" : "lazy"}
                decoding="async"
                unoptimized={storefrontGridImageUnoptimized(thumbSrc)}
              />
            </span>
            <span className="studio-print-gallery-tile-title">{print.title}</span>
            {print.subtitle ? (
              <span className="studio-print-gallery-tile-sub">{print.subtitle}</span>
            ) : null}
          </>
        );

        return (
          <li key={print.id}>
            {linkToShop && !onSelectPrint ? (
              <Link
                href={href}
                className={`studio-print-gallery-tile ${selected ? "is-selected" : ""}`}
                aria-current={selected ? "true" : undefined}
              >
                {tileInner}
              </Link>
            ) : (
              <button
                type="button"
                className={`studio-print-gallery-tile ${selected ? "is-selected" : ""}`}
                aria-pressed={selected}
                onClick={() => onSelectPrint?.(print)}
              >
                {tileInner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
