/**
 * Typography as a developer writes it, and the faces behind it.
 */

import { label } from "./blocks";

/** Does this element paint any text of its own? Only those decide a typographic style. */
export const hasOwnText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());

/**
 * Typography as a developer writes it: `Inter 500 — 14px/20px`.
 *
 * The `@font-face` block is behind an option: it is rarely what a rebuild needs and costs a lot
 * of tokens, while the family, weight and metrics are exactly what gets typed.
 */
export function fonts(els: Element[], fontFaces: CSSFontFaceRule[]) {
  const family = (cs: CSSStyleDeclaration) => cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  const fams = new Set(els.map((el) => family(getComputedStyle(el))));

  // "family weight" → "14px/20px" → the elements wearing it
  const styles = new Map<string, Map<string, string[]>>();
  for (const el of els) {
    if (!hasOwnText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    const key = `${family(cs)} ${cs.fontWeight}`;
    const metric = `${cs.fontSize}/${cs.lineHeight}`;
    const sizes = styles.get(key) ?? styles.set(key, new Map()).get(key)!;
    sizes.set(metric, [...(sizes.get(metric) ?? []), label(el)]);
  }
  const lines = [...styles].map(([key, sizes]) => {
    const parts = [...sizes].map(([metric, who]) =>
      `${metric} (${who.slice(0, 3).join(", ")}${who.length > 3 ? `, +${who.length - 3} more` : ""})`);
    return `- ${key} — ${parts.join(" · ")}`;
  });

  const faces = fontFaces.filter((f) => fams.has(f.style.fontFamily.replace(/['"]/g, "").trim())).map((f) =>
    f.cssText.replace(/url\((["']?)([^)"']+)\1\)/g, (_m, _q, u) => `url("${new URL(u, f.parentStyleSheet?.href || location.href).href}")`));
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')].map((l) => l.href).filter((h) => /font/i.test(h));
  return { lines, faces, links };
}
