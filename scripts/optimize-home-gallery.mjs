/**
 * Compresses market booth photos for the homepage carousel.
 * Run: npm run optimize:home-gallery
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "public", "marketing", "home-gallery");
const outDir = srcDir;
const files = [
  "stand-01.jpg",
  "stand-02.jpg",
  "stand-03.jpg",
  "stand-04.jpg",
  "stand-05.jpg",
  "stand-06.jpg",
  "stand-07.jpg",
  "stand-08.jpg"
];

async function optimizeOne(name) {
  const src = path.join(srcDir, name);
  const out = path.join(outDir, name.replace(/\.jpg$/i, ".webp"));
  const meta = await sharp(src).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  console.log(`optimize-home-gallery: ${name} ${width}x${height}`);

  await sharp(src)
    .rotate()
    .resize({
      width: 1600,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true
    })
    .sharpen(1.05, 1, 1)
    .webp({ quality: 78, effort: 6, smartSubsample: true })
    .toFile(out);

  const { size } = await stat(out);
  console.log(`  wrote ${path.relative(root, out)} (${(size / 1024).toFixed(1)} KB)`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const file of files) {
    await optimizeOne(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
