/**
 * Build tab favicon + Apple touch icon from pictures/logo-icon.png.
 * Run: npm run optimize:favicon
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "pictures", "logo-icon.png");
const appDir = path.join(root, "app");

async function main() {
  await mkdir(appDir, { recursive: true });
  const meta = await sharp(src).metadata();
  console.log(`optimize-favicon: source ${path.relative(root, src)} ${meta.width}×${meta.height}`);

  const base = sharp(src).rotate();

  /** Browser tab + PWA: Next serves /icon from app/icon.png */
  await base
    .clone()
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(path.join(appDir, "icon.png"));

  /** iOS / some Android bookmarks */
  await base
    .clone()
    .resize(180, 180, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(path.join(appDir, "apple-icon.png"));

  console.log(`  wrote ${path.relative(root, path.join(appDir, "icon.png"))}`);
  console.log(`  wrote ${path.relative(root, path.join(appDir, "apple-icon.png"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
