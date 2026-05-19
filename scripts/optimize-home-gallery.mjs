/**
 * Compresses market booth photos for the homepage carousel.
 * Source: place JPEGs in public/marketing/home-gallery/ (e.g. stand-09.jpg).
 * Output: matching .webp (max 1600×1200, quality 78).
 * Run: npm run optimize:home-gallery
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "public", "marketing", "home-gallery");
const outDir = srcDir;

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 78;

async function listSourceJpegs() {
  const names = await readdir(srcDir);
  return names
    .filter((name) => /^stand-\d+\.jpe?g$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function optimizeOne(name) {
  const src = path.join(srcDir, name);
  const out = path.join(outDir, name.replace(/\.jpe?g$/i, ".webp"));
  const meta = await sharp(src).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  console.log(`optimize-home-gallery: ${name} ${width}x${height}`);

  await sharp(src)
    .rotate()
    .resize({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true
    })
    .sharpen(1.05, 1, 1)
    .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toFile(out);

  const { size } = await stat(out);
  console.log(`  wrote ${path.relative(root, out)} (${(size / 1024).toFixed(1)} KB)`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = await listSourceJpegs();
  if (files.length === 0) {
    console.error("No stand-*.jpg files found in public/marketing/home-gallery/");
    process.exit(1);
  }
  for (const file of files) {
    await optimizeOne(file);
  }
  console.log(`Done: ${files.length} image(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
