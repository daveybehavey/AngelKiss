/**
 * Homepage mobile diagnosis — scroll-depth overflow + section metrics.
 * Usage: node scripts/diagnose-homepage-mobile.mjs
 */
import { chromium, devices } from "playwright";

const baseUrl = process.env.MOBILE_QA_BASE_URL?.trim() || "https://anglkisscreations.ca";

function rect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: Math.round(r.left),
    right: Math.round(r.right),
    width: Math.round(r.width),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom)
  };
}

async function metrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        sel,
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowsViewport: r.right > vw + 1 || r.left < -1
      };
    };
    return {
      viewport: vw,
      docScrollWidth: de.scrollWidth,
      docOverflow: de.scrollWidth - vw,
      pageMain: pick(".page-main"),
      homeHero: pick(".home-hero"),
      studio: pick(".home-studio-print-gallery"),
      market: pick(".home-market-gallery"),
      marketStage: pick(".home-market-gallery-stage"),
      marketSlides: document.querySelectorAll(".home-market-gallery-slide").length,
      marketArrows: document.querySelectorAll(".home-market-gallery-arrow").length,
      marketDots: document.querySelectorAll(".home-market-gallery-dot").length,
      marketImgs: [...document.querySelectorAll(".home-market-gallery img")].map((img) =>
        img.getAttribute("src")
      ),
      studioSlideGrid: (() => {
        const slide = document.querySelector(".home-studio-print-slide.is-active");
        if (!slide) return null;
        return getComputedStyle(slide).gridTemplateColumns;
      })()
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 12"] });
const page = await context.newPage();

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });

const checkpoints = [{ label: "top", y: 0 }];

for (let i = 1; i <= 6; i++) {
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(500);
  checkpoints.push({ label: `scroll+${i}`, y: await page.evaluate(() => window.scrollY) });
}

const results = [];
for (const cp of checkpoints) {
  await page.evaluate((y) => window.scrollTo(0, y), cp.y);
  await page.waitForTimeout(300);
  const m = await metrics(page);
  results.push({ checkpoint: cp.label, scrollY: cp.y, ...m });
}

// Interactivity: try market arrows if present
await page.evaluate(() => {
  const market = document.querySelector(".home-market-gallery");
  market?.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(400);
const activeMarketSrc = () =>
  page.evaluate(() =>
    document
      .querySelector(".home-market-gallery-slide.is-active img")
      ?.getAttribute("src")
  );
const beforeClick = await activeMarketSrc();
const hasArrow = await page.locator(".home-market-gallery-arrow-right").count();
let afterClick = beforeClick;
if (hasArrow > 0) {
  await page.locator(".home-market-gallery-arrow-right").click();
  await page.waitForTimeout(300);
  afterClick = await activeMarketSrc();
}

await page.screenshot({ path: ".visual-qa/diagnose-market-iphone12.png", fullPage: false });

await browser.close();

console.log(JSON.stringify({ results, marketGallery: { beforeClick, afterClick, hasArrow }, }, null, 2));
