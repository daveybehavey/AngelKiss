/**
 * Sharp encode settings aligned with `lib/client/optimize-image-for-upload.ts`.
 */
import sharp from "sharp";

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_WEBP_QUALITY = 78;
const INPUT_PIXEL_LIMIT = 4096 * 4096;

const RASTER_EXT = /\.(jpe?g|png|gif|webp|tiff?|heic|heif)$/i;

export function isRasterCatalogKey(objectKey) {
  return RASTER_EXT.test(String(objectKey ?? ""));
}

export function targetWebpObjectKey(objectKey) {
  const key = String(objectKey ?? "").trim();
  if (/\.webp$/i.test(key)) {
    return key;
  }
  if (/\.(jpe?g|png|gif|tiff?|heic|heif)$/i.test(key)) {
    return key.replace(/\.(jpe?g|png|gif|tiff?|heic|heif)$/i, ".webp");
  }
  return `${key}.webp`;
}

export function remapDbStoragePath(dbPath, objectKey, newObjectKey) {
  const path = String(dbPath ?? "").trim();
  if (!path) {
    return newObjectKey;
  }
  if (path.endsWith(objectKey)) {
    return path.slice(0, -objectKey.length) + newObjectKey;
  }
  const idx = path.indexOf(objectKey);
  if (idx >= 0) {
    return path.slice(0, idx) + newObjectKey + path.slice(idx + objectKey.length);
  }
  return newObjectKey;
}

/**
 * @param {Buffer} input
 * @param {{ maxEdge?: number; quality?: number }} [options]
 */
export async function optimizeCatalogImageBuffer(input, options = {}) {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;

  const meta = await sharp(input, {
    failOn: "none",
    animated: false,
    pages: 1,
    limitInputPixels: INPUT_PIXEL_LIMIT
  }).metadata();

  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW <= 0 || srcH <= 0) {
    throw new Error("invalid image dimensions");
  }

  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const out = await sharp(input, {
    failOn: "none",
    animated: false,
    pages: 1,
    limitInputPixels: INPUT_PIXEL_LIMIT
  })
    .rotate()
    .resize({ width: w, height: h, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer();

  return { buffer: out, width: w, height: h, sourceWidth: srcW, sourceHeight: srcH };
}

/**
 * @param {Buffer} buffer
 * @param {{ width: number; height: number }} meta
 * @param {{ isWebp?: boolean; maxEdge?: number; minBytes?: number; force?: boolean }} opts
 */
export function shouldSkipOptimization(buffer, meta, opts) {
  if (opts.force) {
    return false;
  }
  if (!opts.isWebp) {
    return false;
  }
  const minBytes = opts.minBytes ?? 250_000;
  if (buffer.length > minBytes) {
    return false;
  }
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const longEdge = Math.max(meta.width, meta.height);
  return longEdge <= maxEdge;
}
