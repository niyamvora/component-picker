/**
 * The page's own stylesheets, verbatim, cut down to the rules the page can use (#114).
 *
 * Per-element computed CSS (`blocks.ts`) is one frame at one viewport. The source rules are the
 * whole behaviour — breakpoints, hover and focus, dark mode, motion — and on a Tailwind site the
 * class names in the markup map one-to-one onto them. So a page export keeps the rules as written,
 * inside the same `@layer` / `@media` / `@supports` / `@container` nesting, and drops only the
 * rules whose selector cannot match anything on the page.
 *
 * "Can match" ignores state: `.btn:hover` is kept when `.btn` exists and `html.dark .card` when
 * `.card` does, because hover and theme are exactly what a frozen capture loses. Keeping an extra
 * rule costs bytes; dropping a live one costs a behaviour, so every doubt resolves to keep.
 */

import { splitList } from "./const";
import { registeredProperties } from "./rules";

export interface UsedCss {
  css: string;
  /** Distinct viewport and container conditions that guard at least one kept rule. */
  breakpoints: string[];
  /** Stylesheets that could not be read (cross-origin without CORS), by URL. */
  unreadable: string[];
  kept: number;
  total: number;
}

/** A stylesheet's text the page could not read itself — fetched by the caller through CDP. */
export interface SheetText { href: string; text: string }

/**
 * A selector with every pseudo-class, pseudo-element, attribute test and theme class removed, so it
 * answers "does the thing this styles exist?" rather than "is it in that state right now?".
 * Escapes are copied through untouched: Tailwind's `.group-data-\[open\]\:x` is one class.
 */
export function atRest(selector: string): string {
  let out = "";
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") { out += ch + (selector[i + 1] ?? ""); i++; continue; }
    if (ch !== ":" && ch !== "[") { out += ch; continue; }
    let j = i + 1;
    if (ch === "[") {
      while (j < selector.length && selector[j] !== "]") j += selector[j] === "\\" ? 2 : 1;
      j++;
    } else {
      if (selector[j] === ":") j++;
      while (j < selector.length && /[\w-]/.test(selector[j])) j++;
      if (selector[j] === "(") {
        let depth = 0;
        do { depth += selector[j] === "(" ? 1 : selector[j] === ")" ? -1 : 0; j++; } while (j < selector.length && depth > 0);
      }
    }
    i = j - 1;
  }
  return out
    .replace(/\.(dark|light)(?![\w-])/g, "")
    .replace(/^\s*[>+~]\s*|\s*[>+~]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordIn = (word: string, text: string) => new RegExp(`(^|[^\\w-])${escapeRe(word)}([^\\w-]|$)`).test(text);
const indent = (s: string) => s.replace(/^/gm, "  ");
const prelude = (r: CSSRule) => r.cssText.slice(0, r.cssText.indexOf("{")).trim();
const VIEWPORT_COND = /width|height|aspect-ratio|orientation/;

/** `url(relative)` → `url("absolute")` against the sheet it came from, so the file works anywhere. */
export function absolutizeUrls(text: string, base: string): string {
  return text.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, _q: string, raw: string) => {
    const u = raw.trim();
    if (/^(data:|#|[a-z][\w+.-]*:)/i.test(u)) return m;
    try { return `url("${new URL(u, base).href}")`; } catch { return m; }
  });
}

export function usedCss(root: Document | Element = document, extra: SheetText[] = []): UsedCss {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const cache = new Map<string, boolean>();
  const exists = (selectorText: string) => splitList(selectorText).some((s) => {
    const base = atRest(s) || "*";
    let hit = cache.get(base);
    if (hit === undefined) {
      // A selector that no longer parses once its pseudo parts are gone is kept, not guessed at.
      try { hit = !!root.querySelector(base) || (root instanceof Element && root.matches(base)); } catch { hit = true; }
      cache.set(base, hit);
    }
    return hit;
  });

  const keyframes = new Map<string, string>();
  const properties: Record<string, string> = {};
  const faces: { family: string; text: string }[] = [];
  const breakpoints = new Set<string>();
  const unreadable: string[] = [];
  let kept = 0, total = 0;

  const walk = (rules: CSSRuleList, base: string, conds: string[]): string[] => {
    const out: string[] = [];
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        total++;
        if (!exists(r.selectorText)) continue;
        kept++;
        out.push(absolutizeUrls(r.cssText, base));
        for (const c of conds) breakpoints.add(c);
      } else if (r instanceof CSSKeyframesRule) keyframes.set(r.name, r.cssText);
      else if (typeof CSSPropertyRule !== "undefined" && r instanceof CSSPropertyRule) properties[r.name] = r.cssText;
      else if (r instanceof CSSFontFaceRule) {
        faces.push({ family: r.style.getPropertyValue("font-family").replace(/['"]/g, "").trim(), text: absolutizeUrls(r.cssText, base) });
      } else if (r instanceof CSSImportRule) {
        // Inlined rather than re-emitted: an `@import` is only valid at the top of a file.
        if (r.styleSheet) out.push(...(readSheet(r.styleSheet, base) ?? []));
      } else if ("cssRules" in r) {
        const cond = r instanceof CSSMediaRule && VIEWPORT_COND.test(r.conditionText) ? `@media ${r.conditionText}`
          : typeof CSSContainerRule !== "undefined" && r instanceof CSSContainerRule ? `@container ${r.conditionText}` : null;
        const inner = walk((r as CSSGroupingRule).cssRules, base, cond ? [...conds, cond] : conds);
        if (inner.length) out.push(`${prelude(r)} {\n${inner.map(indent).join("\n")}\n}`);
      } else {
        // `@layer a, b;`, `@counter-style`, `@font-palette-values`: small, and the layer order matters.
        out.push(r.cssText);
      }
    }
    return out;
  };

  function readSheet(sheet: CSSStyleSheet, fallbackBase: string): string[] | null {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { if (sheet.href) unreadable.push(sheet.href); return null; }
    const inner = walk(rules, sheet.href ?? fallbackBase, []);
    const media = sheet.media?.mediaText;
    return media && media !== "all" && inner.length ? [`@media ${media} {\n${inner.map(indent).join("\n")}\n}`] : inner;
  }

  const blocks: string[] = [];
  const sheets = [...doc.styleSheets, ...(doc.adoptedStyleSheets ?? [])];
  for (const sheet of sheets) {
    if (sheet.disabled) continue;
    const inner = readSheet(sheet, doc.baseURI);
    if (inner?.length) blocks.push(`/* ${sheet.href ?? "inline <style>"} */\n${inner.join("\n")}`);
  }
  for (const { href, text } of extra) {
    const sheet = new CSSStyleSheet({ baseURL: href });
    try { sheet.replaceSync(text); } catch { continue; }
    const inner = walk(sheet.cssRules, href, []);
    const at = unreadable.indexOf(href);
    if (at >= 0) unreadable.splice(at, 1);
    if (inner.length) blocks.push(`/* ${href} (read through the debugger) */\n${inner.join("\n")}`);
  }

  const body = blocks.join("\n\n");
  const frames = [...keyframes].filter(([name]) => wordIn(name, body)).map(([, text]) => text);
  const registered = registeredProperties(properties, `${body}\n${frames.join("\n")}`);
  const usedFaces = [...new Set(faces.filter((f) => f.family && body.includes(f.family)).map((f) => f.text))];
  return {
    css: [...registered, ...usedFaces, body, ...frames].filter(Boolean).join("\n\n") + "\n",
    breakpoints: [...breakpoints],
    unreadable,
    kept,
    total,
  };
}
