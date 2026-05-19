/**
 * Storefront audit — layout, panels, images, nav (local or production via MOBILE_QA_BASE_URL).
 * Usage: node scripts/audit-storefront.mjs
 */
import { chromium, devices } from "playwright";

const baseUrl =
  process.env.MOBILE_QA_BASE_URL?.trim() || "https://anglkisscreations.ca";

const routes = [
  "/",
  "/shop",
  "/gallery",
  "/about",
  "/cart",
  "/checkout",
  "/shipping",
  "/returns",
  "/privacy",
  "/shop?category=handmade_crochet_knit",
  "/shop?category=custom_sublimation"
];

function issue(route, kind, detail) {
  return { route, kind, detail };
}

async function auditPage(page, route) {
  const findings = [];
  const data = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const docOverflow = document.documentElement.scrollWidth - vw;

    const panelPad = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const child = el.querySelector(
        "h1, h2, h3, p, button, input, a.btn, .gallery-filter-chip"
      );
      const cr = child?.getBoundingClientRect();
      const padL = parseFloat(s.paddingLeft) || 0;
      const borderL = parseFloat(s.borderLeftWidth) || 0;
      const inset = cr ? cr.left - box.left : null;
      return {
        paddingLeft: padL,
        borderLeft: borderL,
        contentInset: inset == null ? null : Math.round(inset),
        expectedInset: Math.round(borderL + padL),
        width: Math.round(box.width),
        left: Math.round(box.left)
      };
    };

    const align = (sel) => {
      const el = document.querySelector(sel);
      const main = document.querySelector(".page-main");
      if (!el || !main) return null;
      const er = el.getBoundingClientRect();
      const mr = main.getBoundingClientRect();
      return {
        elLeft: Math.round(er.left),
        mainLeft: Math.round(mr.left),
        elWidth: Math.round(er.width),
        mainWidth: Math.round(mr.width),
        aligned:
          Math.abs(er.left - mr.left) <= 2 &&
          Math.abs(er.width - mr.width) <= 2
      };
    };

    const brokenImgs = [...document.querySelectorAll("img")].filter((img) => {
      const r = img.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      return img.complete && img.naturalWidth === 0;
    });

    const tinyTargets = [...document.querySelectorAll("a, button, input, select, [role='button']")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden" || r.width < 4 || r.height < 4) {
          return null;
        }
        if (el.matches(".site-header-cart, .site-nav-cart-link")) {
          return null;
        }
        if (r.width >= 40 && r.height >= 40) return null;
        const text = (el.textContent || "").trim().slice(0, 40);
        return { tag: el.tagName, text, w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter(Boolean)
      .slice(0, 8);

    return {
      docOverflow,
      title: document.title,
      cartIcon: !!document.querySelector(".site-nav-cart-icon"),
      cartLabel: !!document.querySelector(".site-nav-cart-label"),
      menuBtn: !!document.querySelector(".site-nav-menu-btn"),
      pageIntro: panelPad(".page-intro"),
      browsePanel: panelPad(".gallery-browse-panel"),
      plainPanel: panelPad(".gallery-page > .panel:not(.page-intro):not(.gallery-browse-panel)"),
      market: align(".home-market-gallery"),
      hero: align(".home-hero"),
      brokenImgCount: brokenImgs.length,
      brokenImgSrc: brokenImgs.slice(0, 3).map((i) => i.getAttribute("src")?.slice(0, 80)),
      tinyTargets
    };
  });

  if (data.docOverflow > 1) {
    findings.push(issue(route, "overflow", `horizontal overflow ${data.docOverflow}px`));
  }

  for (const [name, pad] of [
    ["page-intro", data.pageIntro],
    ["gallery-browse-panel", data.browsePanel],
    ["plain-panel", data.plainPanel]
  ]) {
    if (!pad) continue;
    if (pad.paddingLeft < 8) {
      findings.push(issue(route, "panel-padding", `${name} padding-left only ${pad.paddingLeft}px`));
    }
    if (
      pad.contentInset != null &&
      Math.abs(pad.contentInset - pad.expectedInset) > 3
    ) {
      findings.push(
        issue(
          route,
          "panel-inset",
          `${name} content inset ${pad.contentInset}px vs expected ~${pad.expectedInset}px`
        )
      );
    }
  }

  if (data.market && !data.market.aligned) {
    findings.push(
      issue(
        route,
        "market-align",
        `market gallery left=${data.market.elLeft} width=${data.market.elWidth} vs main left=${data.market.mainLeft} width=${data.market.mainWidth}`
      )
    );
  }

  if (data.brokenImgCount > 0) {
    findings.push(
      issue(route, "broken-images", `${data.brokenImgCount} broken: ${data.brokenImgSrc.join(", ")}`)
    );
  }

  if (data.tinyTargets.length > 4) {
    findings.push(
      issue(route, "tiny-tap-targets", `${data.tinyTargets.length} controls under 40×40px`)
    );
  }

  return { route, ok: findings.length === 0, findings, data };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 12"] });
const page = await context.newPage();

const results = [];
const allFindings = [];

for (const route of routes) {
  const url = `${baseUrl}${route}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(route === "/" ? 1200 : 500);
    if (route === "/") {
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(250);
      }
      const overflowAfterScroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflowAfterScroll > 1) {
        allFindings.push(
          issue("/", "overflow-after-scroll", `horizontal overflow ${overflowAfterScroll}px after scroll`)
        );
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const report = await auditPage(page, route);
    results.push(report);
    allFindings.push(...report.findings);
  } catch (e) {
    results.push({
      route,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
    allFindings.push(issue(route, "navigation", e instanceof Error ? e.message : String(e)));
  }
}

await browser.close();

const summary = {
  baseUrl,
  routesChecked: routes.length,
  routesWithIssues: results.filter((r) => r.findings?.length).length,
  totalFindings: allFindings.length,
  findings: allFindings,
  byRoute: results.map((r) => ({
    route: r.route,
    ok: r.ok,
    findings: r.findings,
    error: r.error
  }))
};

console.log(JSON.stringify(summary, null, 2));
process.exitCode = allFindings.length > 0 ? 1 : 0;
