/**
 * Resizes and compresses brand art into `public/marketing/brand/` for fast LCP.
 * Targets real layout widths (~52vw hero column, not 4K posters). Run: npm run optimize:logo
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "pictures", "logo.png");
const mobileSrc = path.join(root, "pictures", "mobilelogo.png");
const outDir = path.join(root, "public", "marketing", "brand");

async function main() {
  await mkdir(outDir, { recursive: true });
  const meta = await sharp(src).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  console.log(`optimize-brand-logo: source ${path.relative(root, src)} ${w}×${h}`);

  const base = sharp(src).rotate();

  /** Desktop hero ~624px column; 840w + 1680w covers 1x/2x without multi‑MB files. */
  await base
    .clone()
    .resize({ width: 840, height: 945, fit: "cover", position: "centre" })
    .webp({ quality: 80, effort: 6, smartSubsample: true })
    .toFile(path.join(outDir, "hero-desktop.webp"));

  await base
    .clone()
    .resize({ width: 1680, height: 1890, fit: "cover", position: "centre" })
    .webp({ quality: 78, effort: 6, smartSubsample: true })
    .toFile(path.join(outDir, "hero-desktop@2x.webp"));

  const mobile = sharp(mobileSrc).rotate();

  await mobile
    .clone()
    .resize({
      width: 1080,
      height: 1440,
      fit: "contain",
      position: "north",
      background: "#2a1f3d"
    })
    .webp({ quality: 80, effort: 6, smartSubsample: true })
    .toFile(path.join(outDir, "hero-tablet.webp"));

  await mobile
    .clone()
    .resize({
      width: 780,
      height: 1688,
      fit: "contain",
      position: "north",
      background: "#2a1f3d"
    })
    .webp({ quality: 80, effort: 6, smartSubsample: true })
    .toFile(path.join(outDir, "hero-mobile.webp"));

  await base
    .clone()
    .resize({ width: 280, height: 120, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5, smartSubsample: true })
    .toFile(path.join(outDir, "logo-header.webp"));

  for (const name of [
    "hero-desktop.webp",
    "hero-desktop@2x.webp",
    "hero-tablet.webp",
    "hero-mobile.webp",
    "logo-header.webp"
  ]) {
    const p = path.join(outDir, name);
    const { size } = await stat(p);
    console.log(`  wrote ${path.relative(root, p)} (${(size / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
