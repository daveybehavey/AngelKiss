"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  getStorefrontGridImageUrl,
  storefrontGridImageUnoptimized,
  storefrontImageSrcOrNull,
  storefrontImageUnoptimized
} from "@/lib/storefront/storefront-image-src";

type ProductGalleryImage = {
  id: string;
  signed_url: string | null;
  alt_text: string | null;
};

type ProductGalleryProps = {
  productName: string;
  images: ProductGalleryImage[];
};

type GalleryImage = {
  id: string;
  url: string;
  alt: string;
};

function toGalleryImages(productName: string, images: ProductGalleryImage[]): GalleryImage[] {
  return images
    .map((image) => {
      const url = storefrontImageSrcOrNull(image.signed_url);
      if (!url) {
        return null;
      }
      return {
        id: image.id,
        url,
        alt: image.alt_text ?? productName
      };
    })
    .filter((x): x is GalleryImage => x !== null);
}

export function ProductGallery({ productName, images }: ProductGalleryProps) {
  const galleryImages = useMemo(
    () => toGalleryImages(productName, images),
    [productName, images]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [productName, galleryImages.length]);

  if (galleryImages.length === 0) {
    return (
      <div className="product-gallery">
        <div className="product-main-image-placeholder">Photo coming soon.</div>
      </div>
    );
  }

  const activeImage =
    galleryImages[Math.min(selectedIndex, galleryImages.length - 1)] ?? galleryImages[0];

  return (
    <div className="product-gallery">
      <div className="product-main-frame">
        <Image
          src={activeImage.url}
          alt={activeImage.alt}
          fill
          priority={selectedIndex === 0}
          sizes="(max-width: 900px) 100vw, min(520px, 45vw)"
          className="product-main-image"
          unoptimized={storefrontImageUnoptimized(activeImage.url)}
        />
      </div>

      {galleryImages.length > 1 ? (
        <ul className="product-thumb-grid" aria-label="Product image previews">
          {galleryImages.map((image, index) => {
            const isActive = index === selectedIndex;
            const thumbSrc = getStorefrontGridImageUrl(image.url, { width: 160 }) ?? image.url;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  className={`product-thumb-button ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedIndex(index)}
                  aria-label={`Show product image ${index + 1}`}
                  aria-pressed={isActive}
                >
                  <Image
                    src={thumbSrc}
                    alt={image.alt}
                    width={160}
                    height={90}
                    sizes="90px"
                    loading="lazy"
                    decoding="async"
                    className="product-thumb-image"
                    unoptimized={storefrontGridImageUnoptimized(thumbSrc)}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
