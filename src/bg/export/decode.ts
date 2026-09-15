/**
 * An image's colours, read in the service worker (#119).
 *
 * The bytes are already in hand from the network log, and a service worker has `createImageBitmap`
 * and `OffscreenCanvas` — so the stand-in gradient costs no round trip through the page. Downscaled
 * to 64px first: a palette does not need a 4K hero's every pixel.
 */

import { paletteOf, type Palette } from "../../core/assets/media-code";

const SIDE = 64;

export async function paletteFromBytes(bytes: Uint8Array): Promise<Palette | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = new OffscreenCanvas(w, h).getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return paletteOf(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null; // SVG, a truncated body, or a format the browser will not decode off the page
  }
}
