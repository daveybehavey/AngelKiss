"use client";

import {
  getStorefrontGridImageUrl,
  STOREFRONT_HOME_STUDIO_IMAGE_WIDTH,
  storefrontGridImageUnoptimized
} from "@/lib/storefront/storefront-image-src";
import {
  shopHrefForStudioPrint,
  STUDIO_PRINT_COMING_SOON_IMAGE,
  studioPrintImageSrcForNextImage
} from "@/lib/storefront/studio-print-client";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

const AUTO_MS = 8000;
/** Above this, show a compact progress bar + “n / total” instead of one dot per slide. */
const DOTS_MAX = 12;
const SWIPE_MIN_PX = 45;

function studioPrintImageFrameStyle(print: PublicStudioPrint): CSSProperties | undefined {
  const w = print.image_width;
  const h = print.image_height;
  if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
    return { aspectRatio: `${w} / ${h}` };
  }
  return undefined;
}

type HomeStudioPrintGalleryClientProps = {
  prints: PublicStudioPrint[];
};

export function HomeStudioPrintGalleryClient({ prints }: HomeStudioPrintGalleryClientProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (prints.length <= 1) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (isPaused || mq.matches) {
      return;
    }
    const t = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % prints.length);
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [isPaused, prints.length]);

  const move = (dir: "prev" | "next") => {
    setActiveIndex((i) => {
      if (dir === "next") {
        return (i + 1) % prints.length;
      }
      return (i - 1 + prints.length) % prints.length;
    });
  };

  function onSwipeTouchStart(e: React.TouchEvent) {
    if (prints.length <= 1) {
      return;
    }
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onSwipeTouchEnd(e: React.TouchEvent) {
    if (prints.length <= 1 || touchStartX.current == null) {
      return;
    }
    const x = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = x - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_MIN_PX) {
      return;
    }
    if (dx < 0) {
      move("next");
    } else {
      move("prev");
    }
  }

  const active = prints[activeIndex];
  if (!active) {
    return null;
  }

  return (
    <section
      className="home-studio-print-gallery"
      aria-labelledby="home-studio-print-heading"
      aria-roledescription="carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="home-studio-print-gallery-header">
        <p className="home-studio-print-kicker">In-house designs</p>
        <h2 id="home-studio-print-heading" className="home-studio-print-title">
          Studio prints you can wear and gift
        </h2>
        <p className="home-studio-print-lead">
          These are our own in-house designs—choose one for mugs, tumblers, bags, and more, and we
          print it with care.
        </p>
        <p className="home-studio-print-actions">
          <Link href="/gallery" className="btn btn-outline btn-sm">
            Browse all studio prints
          </Link>
        </p>
      </div>

      <div className="home-studio-print-stage" aria-live="polite">
        {prints.map((print, index) => {
          const on = index === activeIndex;
          const alt = print.alt_text?.trim() || print.title;
          const frameStyle = studioPrintImageFrameStyle(print);
          const imageSrc =
            getStorefrontGridImageUrl(print.image_url, {
              width: STOREFRONT_HOME_STUDIO_IMAGE_WIDTH
            }) ?? studioPrintImageSrcForNextImage(print.image_url);
          return (
            <div
              key={print.id}
              className={`home-studio-print-slide ${on ? "is-active" : ""}`}
              aria-hidden={on ? "false" : "true"}
              inert={on ? undefined : true}
            >
              <div
                className={`home-studio-print-image-wrap${frameStyle ? " home-studio-print-image-wrap--native" : ""}`}
                style={frameStyle}
                onTouchStart={on ? onSwipeTouchStart : undefined}
                onTouchEnd={on ? onSwipeTouchEnd : undefined}
              >
                {on ? (
                  <Image
                    src={imageSrc}
                    alt={alt}
                    fill
                    className={
                      imageSrc === STUDIO_PRINT_COMING_SOON_IMAGE
                        ? "home-studio-print-image home-studio-print-image--placeholder"
                        : "home-studio-print-image"
                    }
                    sizes="(max-width: 980px) 92vw, min(560px, 46vw)"
                    quality={72}
                    priority={activeIndex === 0}
                    unoptimized={storefrontGridImageUnoptimized(imageSrc)}
                  />
                ) : null}
              </div>
              <div className="home-studio-print-caption">
                <h3 className="home-studio-print-caption-title">{print.title}</h3>
                {print.subtitle ? <p className="home-studio-print-caption-sub">{print.subtitle}</p> : null}
                <div className="home-studio-print-caption-actions">
                  <Link href={shopHrefForStudioPrint(print)} className="btn btn-primary">
                    Use this print on a custom item
                  </Link>
                  <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="btn btn-outline">
                    Browse all custom blanks
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {prints.length > 1 ? (
        <div className="home-studio-print-controls" aria-label="Slide controls">
          <button
            type="button"
            className="home-studio-print-arrow home-studio-print-arrow-left"
            onClick={() => move("prev")}
            aria-label="Previous studio print"
          >
            ‹
          </button>
          {prints.length <= DOTS_MAX ? (
            <div className="home-studio-print-dots" role="group" aria-label="Slides">
              {prints.map((print, index) => (
                <button
                  key={print.id}
                  type="button"
                  aria-label={`Show slide ${index + 1}: ${print.title}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  className={`home-studio-print-dot ${index === activeIndex ? "is-active" : ""}`}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          ) : (
            <div
              className="home-studio-print-pagination-compact"
              role="group"
              aria-label="Slide position"
            >
              <p className="home-studio-print-pagination-count" aria-live="polite">
                Print {activeIndex + 1} of {prints.length}
              </p>
              <div
                className="home-studio-print-progress-track"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={prints.length}
                aria-valuenow={activeIndex + 1}
                aria-label={`Slide ${activeIndex + 1} of ${prints.length}`}
              >
                <div
                  className="home-studio-print-progress-fill"
                  style={{
                    width: `${((activeIndex + 1) / prints.length) * 100}%`
                  }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            className="home-studio-print-arrow home-studio-print-arrow-right"
            onClick={() => move("next")}
            aria-label="Next studio print"
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
