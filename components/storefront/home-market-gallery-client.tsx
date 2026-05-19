"use client";

import { getStorefrontGridImageUrl } from "@/lib/storefront/storefront-image-src";
import { useEffect, useRef, useState } from "react";

const BOOTH_IMAGE_WIDTH = 1100;

const BOOTH_SHOTS = [
  {
    src: "/marketing/home-gallery/stand-01.webp",
    alt: "Market booth display with handmade and custom-print items"
  },
  {
    src: "/marketing/home-gallery/stand-02.webp",
    alt: "Booth table with gift-ready products"
  },
  {
    src: "/marketing/home-gallery/stand-03.webp",
    alt: "Pop-up stand with colorful creations"
  },
  {
    src: "/marketing/home-gallery/stand-04.webp",
    alt: "In-person market setup"
  },
  {
    src: "/marketing/home-gallery/stand-05.webp",
    alt: "Booth shelves and product arrangement"
  },
  {
    src: "/marketing/home-gallery/stand-06.webp",
    alt: "Handmade and print items at a market"
  },
  {
    src: "/marketing/home-gallery/stand-07.webp",
    alt: "Market display from another angle"
  },
  {
    src: "/marketing/home-gallery/stand-08.webp",
    alt: "Booth overview at an event"
  },
  {
    src: "/marketing/home-gallery/stand-09.webp",
    alt: "Pop-up market booth with crochet and custom-print gifts"
  },
  {
    src: "/marketing/home-gallery/stand-10.webp",
    alt: "Craft fair table with handmade items and printed drinkware"
  },
  {
    src: "/marketing/home-gallery/stand-11.webp",
    alt: "Vendor display at a local market event"
  },
  {
    src: "/marketing/home-gallery/stand-12.webp",
    alt: "Booth setup with colorful products on display"
  },
  {
    src: "/marketing/home-gallery/stand-13.webp",
    alt: "In-person shopping at an AnglKiss Creations pop-up"
  },
  {
    src: "/marketing/home-gallery/stand-14.webp",
    alt: "Market stall showcasing crochet and custom prints"
  }
] as const;

const AUTO_MS = 7000;
const SWIPE_MIN_PX = 45;
const headingId = "home-market-gallery-heading";

export function HomeMarketGalleryClient() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (BOOTH_SHOTS.length <= 1) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (isPaused || mq.matches) {
      return;
    }
    const t = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % BOOTH_SHOTS.length);
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [isPaused]);

  const move = (dir: "prev" | "next") => {
    setActiveIndex((i) => {
      if (dir === "next") {
        return (i + 1) % BOOTH_SHOTS.length;
      }
      return (i - 1 + BOOTH_SHOTS.length) % BOOTH_SHOTS.length;
    });
  };

  function onSwipeTouchStart(e: React.TouchEvent) {
    if (BOOTH_SHOTS.length <= 1) {
      return;
    }
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onSwipeTouchEnd(e: React.TouchEvent) {
    if (BOOTH_SHOTS.length <= 1 || touchStartX.current == null) {
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

  const prefetchNext = (activeIndex + 1) % BOOTH_SHOTS.length;
  const prefetchPrev = (activeIndex - 1 + BOOTH_SHOTS.length) % BOOTH_SHOTS.length;

  return (
    <section
      className="home-market-gallery"
      aria-labelledby={headingId}
      aria-roledescription="carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div
        className="home-market-gallery-stage"
        aria-live="polite"
        aria-label={`Booth photo ${activeIndex + 1} of ${BOOTH_SHOTS.length}`}
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onSwipeTouchEnd}
      >
        {BOOTH_SHOTS.map((shot, index) => {
          const on = index === activeIndex;
          const loadImage = on || index === prefetchNext || index === prefetchPrev;
          return (
            <div
              key={shot.src}
              className={`home-market-gallery-slide ${on ? "is-active" : ""}`}
              aria-hidden={on ? "false" : "true"}
              inert={on ? undefined : true}
            >
              {loadImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getStorefrontGridImageUrl(shot.src, { width: BOOTH_IMAGE_WIDTH }) ?? shot.src}
                  alt={shot.alt}
                  width={1600}
                  height={1200}
                  sizes="(max-width: 700px) 100vw, min(1100px, 92vw)"
                  className="home-market-gallery-photo home-market-gallery-photo-native"
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={on ? "high" : "low"}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="home-market-gallery-scrim" aria-hidden="true" />

      <div className="home-market-gallery-foot">
        <div className="home-market-gallery-foot-inner">
          <p className="home-market-gallery-kicker">Pop-ups &amp; markets</p>
          <h2 id={headingId} className="home-market-gallery-title">
            See the booth in real life
          </h2>
          <p className="home-market-gallery-lead">
            Swipe or use the arrows to browse snapshots from recent events—same care you get when
            you order online.
          </p>
        </div>

        {BOOTH_SHOTS.length > 1 ? (
          <div className="home-market-gallery-dots" role="group" aria-label="Booth photos">
            {BOOTH_SHOTS.map((shot, index) => (
              <button
                key={shot.src}
                type="button"
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className={`home-market-gallery-dot ${index === activeIndex ? "is-active" : ""}`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {BOOTH_SHOTS.length > 1 ? (
        <div className="home-market-gallery-controls" aria-label="Booth photo controls">
          <button
            type="button"
            className="home-market-gallery-arrow home-market-gallery-arrow-left"
            onClick={() => move("prev")}
            aria-label="Previous booth photo"
          >
            ‹
          </button>
          <button
            type="button"
            className="home-market-gallery-arrow home-market-gallery-arrow-right"
            onClick={() => move("next")}
            aria-label="Next booth photo"
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
