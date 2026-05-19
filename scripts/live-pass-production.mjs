/**
 * Live production smoke + layout pass (iPhone 12).
 * Usage: node scripts/live-pass-production.mjs
 */
import { chromium, devices } from "playwright";

const base = process.env.MOBILE_QA_BASE_URL?.trim() || "https://anglkisscreations.ca";

const report = {};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 12"] });
const page = await context.newPage();

await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 120000 });
for (let i = 0; i < 14; i++) {
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(250);
}
await page.waitForSelector(".home-market-gallery", { timeout: 20000 }).catch(() => null);
report.home = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const m = document.querySelector(".home-market-gallery");
  const main = document.querySelector(".page-main");
  const sig = document.querySelector(".home-signature");
  const mr = m?.getBoundingClientRect();
  const pr = main?.getBoundingClientRect();
  const sr = sig?.getBoundingClientRect();
  return {
    overflow: document.documentElement.scrollWidth - vw,
    cartIcon: !!document.querySelector(".site-nav-cart-icon"),
    marketSlides: document.querySelectorAll(".home-market-gallery-slide").length,
    marketArrows: document.querySelectorAll(".home-market-gallery-arrow").length,
    market: mr ? { left: Math.round(mr.left), width: Math.round(mr.width) } : null,
    main: pr ? { left: Math.round(pr.left), width: Math.round(pr.width) } : null,
    signature: sr ? { left: Math.round(sr.left), width: Math.round(sr.width) } : null,
    aligned:
      mr && pr
        ? Math.abs(mr.left - pr.left) <= 2 && Math.abs(mr.width - pr.width) <= 2
        : null
  };
});
await page.screenshot({ path: ".visual-qa/live-home-scrolled-iphone12.png", fullPage: false });

await page.goto(`${base}/gallery`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(800);
report.gallery = await page.evaluate(() => {
  const panel = document.querySelector(".gallery-browse-panel");
  const intro = document.querySelector(".page-intro");
  const pad = (el) => (el ? parseFloat(getComputedStyle(el).paddingLeft) : 0);
  const inset = (el) => {
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const child = el.querySelector("h2, button, .gallery-filter-chip");
    const cr = child?.getBoundingClientRect();
    return cr ? Math.round(cr.left - box.left) : null;
  };
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    browsePad: pad(panel),
    introPad: pad(intro),
    browseInset: inset(panel),
    chips: document.querySelectorAll(".gallery-filter-chip").length
  };
});
await page.screenshot({ path: ".visual-qa/live-gallery-iphone12.png", fullPage: false });

await page.goto(`${base}/shop`, { waitUntil: "networkidle", timeout: 120000 });
report.shop = await page.evaluate(() => ({
  sublimationVisible: document.body.innerText.includes("Sublimation"),
  customPrintsChip: document.body.innerText.includes("Custom prints ("),
  products: document.querySelectorAll(".product-card").length
}));

await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 90000 });
await page.locator(".site-nav-menu-btn").click();
await page.waitForTimeout(400);
report.nav = await page.evaluate(() => ({
  drawerOpen: !!document.querySelector(".site-nav-drawer[open]"),
  hasAbout: !!document.querySelector('a[href="/about"]')
}));
await page.screenshot({ path: ".visual-qa/live-nav-drawer-iphone12.png", fullPage: false });

await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 90000 });
await page.evaluate(() =>
  document.querySelector(".home-market-gallery")?.scrollIntoView({ block: "center" })
);
await page.waitForSelector(".home-market-gallery-arrow-right", { timeout: 15000 }).catch(() => null);
const before = await page.evaluate(() =>
  document.querySelector(".home-market-gallery-slide.is-active img")?.getAttribute("src")
);
if ((await page.locator(".home-market-gallery-arrow-right").count()) > 0) {
  await page.locator(".home-market-gallery-arrow-right").click();
  await page.waitForTimeout(400);
}
const after = await page.evaluate(() =>
  document.querySelector(".home-market-gallery-slide.is-active img")?.getAttribute("src")
);
report.marketCarousel = { before, after, changed: before !== after };

await browser.close();

console.log(JSON.stringify({ base, report }, null, 2));
