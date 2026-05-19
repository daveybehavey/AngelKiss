/**
 * Shop page mobile layout diagnosis (production or MOBILE_QA_BASE_URL).
 */
import { chromium, devices } from "playwright";

const baseUrl =
  process.env.MOBILE_QA_BASE_URL?.trim() || "https://anglkisscreations.ca";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 12"] });
const page = await context.newPage();

await page.goto(`${baseUrl}/shop`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector(".product-grid .product-card", { timeout: 120000 });
await page.waitForTimeout(800);

const report = await page.evaluate(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const grid = document.querySelector(".product-grid");
  const cards = [...document.querySelectorAll(".product-grid > .product-card")];
  const gridStyle = grid ? getComputedStyle(grid) : null;
  const gridRect = grid?.getBoundingClientRect();

  const cardLayouts = cards.slice(0, 6).map((card, i) => {
    const r = card.getBoundingClientRect();
    const media = card.querySelector(".product-card-media");
    const img = card.querySelector("img");
    const mr = media?.getBoundingClientRect();
    const ir = img?.getBoundingClientRect();
    return {
      index: i,
      cardW: Math.round(r.width),
      cardH: Math.round(r.height),
      cardLeft: Math.round(r.left),
      cardTop: Math.round(r.top),
      mediaH: mr ? Math.round(mr.height) : null,
      imgW: ir ? Math.round(ir.width) : null,
      imgH: ir ? Math.round(ir.height) : null,
      imgNatural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null
    };
  });

  const cols = new Set(cardLayouts.map((c) => c.cardLeft));
  const rows = new Set(cardLayouts.map((c) => c.cardTop));

  const overflowEls = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right > vw + 2) {
      const cls =
        el.className && typeof el.className === "string"
          ? el.className.split(/\s+/).slice(0, 3).join(".")
          : el.tagName;
      overflowEls.push({
        tag: el.tagName,
        cls,
        right: Math.round(r.right),
        width: Math.round(r.width)
      });
      if (overflowEls.length >= 12) break;
    }
  }

  const toolbar = document.querySelector(".shop-toolbar");
  const toolbarRect = toolbar?.getBoundingClientRect();
  const overview = document.querySelector(".shop-overview-grid");

  return {
    viewport: vw,
    docOverflow: de.scrollWidth - vw,
    productCount: cards.length,
    gridTemplateColumns: gridStyle?.gridTemplateColumns ?? null,
    gridGap: gridStyle?.gap ?? null,
    gridWidth: gridRect ? Math.round(gridRect.width) : null,
    distinctColumns: cols.size,
    distinctRows: rows.size,
    cardLayouts,
    toolbarRight: toolbarRect ? Math.round(toolbarRect.right) : null,
    overviewCols: overview
      ? getComputedStyle(overview).gridTemplateColumns
      : null,
    overflowElements: overflowEls
  };
});

await page.screenshot({
  path: ".visual-qa/diagnose-shop-iphone12.png",
  fullPage: true
});

await browser.close();
console.log(JSON.stringify({ baseUrl, report }, null, 2));

if (report.distinctColumns < 2 && report.productCount >= 2) {
  console.error("\nFAIL: expected 2 product columns on mobile, got", report.distinctColumns);
  process.exitCode = 1;
}
if (report.docOverflow > 4) {
  console.error("\nFAIL: horizontal document overflow", report.docOverflow, "px");
  process.exitCode = 1;
}
