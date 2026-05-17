/**
 * Capture homepage at common viewports. Requires dev server: npm run dev:win
 * Usage: node scripts/screenshot-homepage.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, ".visual-qa");
const base = process.argv[2]?.trim() || "http://127.0.0.1:3010";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 }
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".home-hero", { timeout: 30_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const file = path.join(outDir, `home-${vp.name}-${vp.width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", path.relative(root, file));
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
