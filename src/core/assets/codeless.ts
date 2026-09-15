/**
 * What has no code to capture (#122).
 *
 * Screenshots are off by default: a picture makes an agent approximate by eye instead of reading the
 * exact values a capture already carries. The exceptions are the things a capture cannot read at
 * all — a `<canvas>`, whose pixels come from draw calls or the GPU, and an iframe from another
 * origin — and for those a picture is the only record there is.
 */
export function codelessReason(el: Element): string | null {
  if (el instanceof HTMLCanvasElement) return "a <canvas>, which has no markup or CSS to capture";
  if (el instanceof HTMLIFrameElement) {
    try { if (el.contentDocument) return null; } catch { /* cross-origin access throws in some browsers */ }
    return "a cross-origin <iframe>, which cannot be read";
  }
  return null;
}
