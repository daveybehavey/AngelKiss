/**
 * Hero illustration: `<picture>` + native `<img>` for fast LCP (no Next/Image hop).
 * Assets from `npm run optimize:logo` — width-based srcset matches layout column (~52vw desktop).
 */
export function HomeHeroArt() {
  return (
    <div className="home-hero-art reveal reveal-delay-1" aria-hidden="true">
      <picture className="home-hero-art-picture">
        <source
          media="(max-width: 700px)"
          srcSet="/marketing/brand/hero-mobile.webp"
          type="image/webp"
        />
        <source
          media="(max-width: 980px)"
          srcSet="/marketing/brand/hero-tablet.webp"
          type="image/webp"
        />
        <img
          className="home-hero-art-native-img"
          src="/marketing/brand/hero-desktop.webp"
          srcSet="/marketing/brand/hero-desktop.webp 840w, /marketing/brand/hero-desktop@2x.webp 1680w"
          sizes="(max-width: 980px) 100vw, min(52vw, 640px)"
          alt=""
          width={840}
          height={945}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </div>
  );
}
