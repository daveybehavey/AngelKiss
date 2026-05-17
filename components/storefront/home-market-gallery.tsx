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
  }
] as const;

const headingId = "home-market-gallery-heading";

/**
 * Server-rendered booth photo (below the fold). No carousel JS on the homepage —
 * keeps Lighthouse TBT and LCP render delay lower than a client `next/image` carousel.
 */
export function HomeMarketGallery() {
  const shot = BOOTH_SHOTS[0];

  return (
    <section className="home-market-gallery" aria-labelledby={headingId}>
      <div className="home-market-gallery-stage">
        <div className="home-market-gallery-slide is-active">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.src}
            alt={shot.alt}
            className="home-market-gallery-photo home-market-gallery-photo-native"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>

      <div className="home-market-gallery-scrim" aria-hidden="true" />

      <div className="home-market-gallery-foot">
        <div className="home-market-gallery-foot-inner">
          <p className="home-market-gallery-kicker">Pop-ups &amp; markets</p>
          <h2 id={headingId} className="home-market-gallery-title">
            See the booth in real life
          </h2>
          <p className="home-market-gallery-lead">
            A few snapshots from recent events—same care you get when you order online.
          </p>
        </div>
      </div>
    </section>
  );
}
