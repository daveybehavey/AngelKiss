import type { Metadata } from "next";
import Link from "next/link";

const ABOUT_BOOTH_PHOTO = {
  src: "/marketing/home-gallery/stand-13.webp",
  alt: "Cydney smiling behind the AnglKiss Creations booth at a Vancouver Island craft market"
} as const;

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet Cydney, the maker behind AnglKiss Creations—handmade crochet and custom photo prints from Vancouver Island.",
  openGraph: {
    title: "About | AnglKiss Creations",
    description:
      "Handmade crochet gifts and custom prints, made with care on Vancouver Island. Pop-ups, markets, and online orders across Canada.",
    type: "website"
  },
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return (
    <main className="page-main policy-page about-page">
      <section className="panel page-intro about-hero">
        <div className="about-hero-grid">
          <div className="about-hero-copy">
            <p className="page-kicker">About the maker</p>
            <h1 className="page-title">Hi, I&apos;m Cydney</h1>
            <p className="page-lead">
              AnglKiss Creations is my little shop for cozy handmade crochet and custom-printed
              gifts—stitched and pressed with care here on Vancouver Island.
            </p>
            <ul className="about-hero-highlights" aria-label="What you will find here">
              <li>Soft crochet plushies, wearables, and gift-ready pieces</li>
              <li>Custom prints with your photo or our in-house designs</li>
              <li>Pop-ups and markets—you can shop online too</li>
            </ul>
            <p className="page-link-row">
              <Link href="/shop">Browse the shop</Link>
              <Link href="/shop?category=handmade_crochet_knit">Handmade crochet</Link>
            </p>
          </div>
          <figure className="about-hero-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ABOUT_BOOTH_PHOTO.src}
              alt={ABOUT_BOOTH_PHOTO.alt}
              width={1200}
              height={900}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <figcaption className="about-hero-caption">
              At a local market—come say hi when you spot the booth.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="panel policy-card">
        <h2>Handmade crochet</h2>
        <p>
          I work slowly and intentionally—stuffed animals, cozy wearables, baby pieces, and little
          gifts made to be held. Many items are small batches; when something sells out, it often
          stays on the site so you can see what might come back at the next market or restock.
        </p>
        <p className="page-link-row">
          <Link href="/shop?category=handmade_crochet_knit">Shop handmade crochet</Link>
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Custom prints</h2>
        <p>
          <strong>Custom prints</strong> turn your photo—or one of{" "}
          <strong>our original studio designs</strong>—into mugs, tumblers, bags, and more. Every
          design in the gallery was made for this shop, not pulled from a stock library.
        </p>
        <p>
          Not sure your image will look good on a mug? Send it anyway—we will reach out before we
          print if something needs a quick tweak.
        </p>
        <p className="page-link-row">
          <Link href="/gallery">Browse studio print designs</Link>
          <Link href="/shop?category=custom_sublimation">Shop custom prints</Link>
        </p>
      </section>

      <section className="panel policy-card about-markets-card">
        <h2>Pop-ups &amp; markets</h2>
        <p>
          You will often find AnglKiss at craft fairs and community markets around Vancouver Island.
          It is the best way to feel the yarn, compare sizes, and pick up a gift on the spot. Online
          orders ship across Canada with rates shown at checkout.
        </p>
        <p className="page-link-row">
          <Link href="/">More booth photos on the homepage</Link>
        </p>
      </section>

      <section className="panel policy-card">
        <h2>Questions or a custom idea?</h2>
        <p>
          Email{" "}
          <a href="mailto:anglkisscreations@gmail.com">anglkisscreations@gmail.com</a>—I am happy
          to help you choose a gift, check on an order, or talk through a custom print.
        </p>
      </section>
    </main>
  );
}
