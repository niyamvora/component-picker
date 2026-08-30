/**
 * Whether the captured component is usable, not just how it looks.
 *
 * Every tool in this space reproduces appearance and ignores accessibility, so a pixel-perfect
 * rebuild of an inaccessible component quietly carries the original's bugs into a new codebase.
 * Computed in the content script rather than through CDP: roles, names and contrast are all
 * derivable from the DOM and the colours already captured, so this also works in fast mode and in
 * Firefox, where the debugger is not available.
 */

import { sel } from "./const";

/** The implicit ARIA role of a tag, for the common cases worth naming. */
function role(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  const map: Record<string, string> = {
    a: el.hasAttribute("href") ? "link" : "generic", button: "button", nav: "navigation", main: "main",
    header: "banner", footer: "contentinfo", h1: "heading", h2: "heading", h3: "heading", h4: "heading",
    img: "img", input: (el as HTMLInputElement).type === "checkbox" ? "checkbox" : "textbox",
    select: "combobox", textarea: "textbox", ul: "list", ol: "list", li: "listitem", table: "table",
  };
  return map[tag] ?? "";
}

/** The accessible name, by the parts of the algorithm that matter most in practice. */
function accName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) return labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
  if (el instanceof HTMLImageElement) return el.alt.trim();
  const title = el.querySelector(":scope > title")?.textContent?.trim();
  if (title) return title;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** WCAG relative luminance of an `rgb(...)`/`rgba(...)` string. */
function luminance(color: string): number | null {
  const m = color.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The first ancestor with a non-transparent background — what the text actually sits on. */
function backdrop(el: Element): string | null {
  for (let a: Element | null = el; a; a = a.parentElement) {
    const bg = getComputedStyle(a).backgroundColor;
    const alpha = bg.match(/[\d.]+/g);
    if (bg && bg !== "transparent" && !(alpha && alpha.length === 4 && Number(alpha[3]) === 0)) {
      if (getComputedStyle(a).backgroundImage !== "none") return null; // over an image — can't judge
      return bg;
    }
  }
  return null;
}

function contrastWarning(el: Element, i: number): string | null {
  const cs = getComputedStyle(el);
  if (!(el.textContent ?? "").trim()) return null;
  const bg = backdrop(el);
  if (!bg) return null;
  const lf = luminance(cs.color), lb = luminance(bg);
  if (lf === null || lb === null) return null;
  const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
  const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
  const large = size >= 24 || (size >= 18.66 && bold);
  const min = large ? 3 : 4.5;
  return ratio < min ? `${sel(i)} ⚠ contrast ${ratio.toFixed(1)}:1 (needs ${min}:1 for this text size)` : null;
}

const focusable = (el: Element) => {
  const ti = el.getAttribute("tabindex");
  if (ti !== null) return Number(ti) >= 0;
  return /^(a|button|input|select|textarea)$/i.test(el.tagName) && !(el as HTMLButtonElement).disabled && !(el.tagName === "A" && !el.hasAttribute("href"));
};

export function a11ySnapshot(els: Element[]): string {
  const lines: string[] = [];
  const warnings: string[] = [];
  const order: string[] = [];
  els.forEach((el, i) => {
    const r = role(el);
    if (!r || r === "generic") { const c = contrastWarning(el, i); if (c) warnings.push(c); return; }
    const name = accName(el);
    lines.push(`${sel(i)} role=${r}${name ? `  name="${name}"` : ""}${focusable(el) ? "  focusable" : ""}`);
    if (focusable(el)) order.push(sel(i));
    if ((r === "img" || r === "button" || r === "link") && !name) warnings.push(`${sel(i)} ⚠ ${r} has no accessible name (add aria-label or alt)`);
    const c = contrastWarning(el, i);
    if (c) warnings.push(c);
    if (Number(el.getAttribute("tabindex")) > 0) warnings.push(`${sel(i)} ⚠ positive tabindex (${el.getAttribute("tabindex")}) — breaks natural focus order`);
  });
  if (!lines.length && !warnings.length) return "";
  const body = [
    ...lines,
    order.length ? `Focus order: ${order.join(" → ")}` : "",
    ...warnings,
  ].filter(Boolean).join("\n");
  return `## Accessibility\n${body}`;
}
