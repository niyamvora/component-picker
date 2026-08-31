/**
 * Two one-key exports that skip the full bundle: a PNG of the element to the clipboard (#63) and
 * the component as a Figma-ready SVG (#66). Both need a user gesture, which the keypress provides.
 */

import { toFigmaSvg } from "../core/figma";
import { label } from "../core/blocks";

const toast = (text: string): HTMLDivElement => {
  const t = document.createElement("div");
  t.setAttribute("data-cp-ui", "");
  t.style.cssText = "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);background:#2563eb;color:#fff;font:13px/1.4 -apple-system,system-ui,sans-serif;padding:8px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3)";
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
  return t;
};

/** A PNG of the element to the clipboard, via the background's CDP screenshot. */
export async function copyImage(_el: Element) {
  const t = toast("Capturing image…");
  try {
    const res = await chrome.runtime?.sendMessage?.({ type: "screenshot" });
    if (!res?.png) throw new Error(res?.error || "no screenshot");
    const blob = await (await fetch(`data:image/png;base64,${res.png}`)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    t.textContent = "Image copied";
  } catch (e) {
    t.textContent = `Image copy failed: ${e instanceof Error ? e.message : e}`;
  }
}

/** The component as a Figma-ready SVG string on the clipboard (paste into Figma). */
export async function copyFigma(el: Element) {
  const t = toast("Building Figma SVG…");
  try {
    await navigator.clipboard.writeText(toFigmaSvg(el));
    t.textContent = `Copied ${label(el)} as Figma SVG — paste into Figma`;
  } catch (e) {
    t.textContent = `Figma copy failed: ${e instanceof Error ? e.message : e}`;
  }
}
