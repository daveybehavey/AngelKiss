/**
 * Broad storefront diagnosis (production or local via MOBILE_QA_BASE_URL).
 */
import { chromium, devices } from "playwright";

const baseUrl =
  process.env.MOBILE_QA_BASE_URL?.trim() || "https://anglkisscreations.ca";

const routes = [
  { path: "/", name: "home" },
  { path: "/shop", name: "shop" },
  { path: "/gallery", name: "gallery" },
  { path: "/shop?category=custom_sublimation", name: "custom-shop" },
  { path: "/cart", name: "cart" }
];

async function pageReport(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const brokenImgs = [...document.querySelectorAll("img")].filter((img) => {
      const r = img.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      return img.complete && img.naturalWidth === 0;
    });
    const navDrawer = !!document.querySelector(".site-nav-drawer");
    const menuBtn = !!document.querySelector(".site-nav-menu-btn");
    const headerTextBrand =
      !!document.querySelector(".brand-link") &&
      !document.querySelector(".brand-link img") &&
      (document.querySelector(".brand-link")?.textContent?.includes("AnglKiss") ?? false);
    const inlineNavInHeader = !!document.querySelector(
      ".site-header-inner > nav.site-nav"
    );
    const marketSlides = document.querySelectorAll(".home-market-gallery-slide").length;
    const marketArrows = document.querySelectorAll(".home-market-gallery-arrow").length;
    const productCards = document.querySelectorAll(".product-card").length;
    const productImgs = document.querySelectorAll(".product-card img, .product-card-image img");
    const productBroken = [...productImgs].filter(
      (img) => img.complete && img.naturalWidth === 0
    ).length;
    return {
      viewport: vw,
      docOverflow: de.scrollWidth - vw,
      navDrawer,
      menuBtn,
      headerTextBrand,
      inlineNavInHeader,
      marketSlides,
      marketArrows,
      productCards,
      productBroken,
      brokenImgCount: brokenImgs.length,
      brokenImgAlts: brokenImgs.slice(0, 5).map((i) => i.alt || i.src?.slice(0, 60))
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 12"] });
const page = await context.newPage();
const reports = {};

for (const route of routes) {
  const url = `${baseUrl}${route.path}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(600);
    reports[route.name] = { url, ok: true, ...(await pageReport(page)) };
  } catch (e) {
    reports[route.name] = {
      url,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

await browser.close();
console.log(JSON.stringify({ baseUrl, reports }, null, 2));
