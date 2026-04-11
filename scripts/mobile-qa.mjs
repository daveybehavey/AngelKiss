import { chromium } from "playwright";

const baseUrl =
  process.env.MOBILE_QA_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://angelkisscreations.com";

const pages = ["/", "/shop", "/cart", "/checkout", "/admin", "/admin/orders"];
const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 }
];

const overflowFailures = [];
const tapWarnings = [];

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    for (const route of pages) {
      const url = `${baseUrl}${route}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(150);

      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const maxWidth = Math.max(
          root.scrollWidth,
          root.offsetWidth,
          body?.scrollWidth ?? 0,
          body?.offsetWidth ?? 0
        );
        return {
          clientWidth: root.clientWidth,
          maxWidth,
          overflow: Math.max(0, maxWidth - root.clientWidth)
        };
      });

      if (metrics.overflow > 1) {
        overflowFailures.push({
          viewport: viewport.name,
          route,
          overflow: metrics.overflow,
          clientWidth: metrics.clientWidth,
          maxWidth: metrics.maxWidth
        });
      }

      const tinyTargets = await page.evaluate(() => {
        const selector = "a, button, input:not([type='hidden']), select, textarea, [role='button']";
        const elements = Array.from(document.querySelectorAll(selector));

        const tiny = elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const hidden =
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) === 0 ||
              rect.width === 0 ||
              rect.height === 0;

            if (hidden) {
              return null;
            }

            if (rect.width >= 40 && rect.height >= 40) {
              return null;
            }

            const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
            return {
              tag: element.tagName.toLowerCase(),
              text,
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            };
          })
          .filter(Boolean)
          .slice(0, 6);

        return tiny;
      });

      if (tinyTargets.length > 0) {
        tapWarnings.push({
          viewport: viewport.name,
          route,
          targets: tinyTargets
        });
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

if (tapWarnings.length > 0) {
  console.log("Tap-target warnings (informational):");
  for (const warning of tapWarnings) {
    console.log(`- [${warning.viewport}] ${warning.route}`);
    for (const target of warning.targets) {
      console.log(
        `  - <${target.tag}> ${target.text || "(no text)"} | ${target.width}x${target.height}`
      );
    }
  }
}

if (overflowFailures.length > 0) {
  console.error("Horizontal overflow failures:");
  for (const failure of overflowFailures) {
    console.error(
      `- [${failure.viewport}] ${failure.route} overflow=${failure.overflow}px (client=${failure.clientWidth}, content=${failure.maxWidth})`
    );
  }
  process.exit(1);
}

console.log("Mobile QA passed: no horizontal overflow detected.");
