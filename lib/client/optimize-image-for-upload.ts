/**
 * Client-only: downscale and encode as WebP before uploading to storage.
 * Falls back to the original file if WebP/canvas is unavailable.
 */
/** Default upload optimization tuned for storefront cards/carousels. */
const DEFAULT_MAX_EDGE = 1600;
const WEBP_QUALITY = 0.78;

function baseNameWithoutExt(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() ?? "image";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return base || "image";
  }
  return base.slice(0, dot);
}

export type OptimizedUploadPayload = {
  blob: Blob;
  contentType: string;
  filename: string;
};

export async function optimizeImageFileForUpload(
  file: File,
  options?: { maxEdge?: number }
): Promise<OptimizedUploadPayload> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return { blob: file, contentType: file.type || "application/octet-stream", filename: file.name };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    let w = bitmap.width;
    let h = bitmap.height;
    if (!w || !h) {
      return { blob: file, contentType: file.type || "application/octet-stream", filename: file.name };
    }
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { blob: file, contentType: file.type || "application/octet-stream", filename: file.name };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", WEBP_QUALITY);
    });
    if (!blob || blob.size === 0) {
      return { blob: file, contentType: file.type || "application/octet-stream", filename: file.name };
    }

    const filename = `${baseNameWithoutExt(file.name)}.webp`;
    return { blob, contentType: "image/webp", filename };
  } catch {
    return { blob: file, contentType: file.type || "application/octet-stream", filename: file.name };
  } finally {
    bitmap?.close();
  }
}
