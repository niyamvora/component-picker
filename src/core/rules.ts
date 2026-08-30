/**
 * The site's own stylesheets: which rules touch the picked subtree, and what they ask for.
 */

import { PSEUDO_EL_RE, sel, STATE_RE } from "./const";
import type { MediaRule, StateIndices, StateName } from "../shared/types";

// ---------- stylesheet rules: states, media queries, keyframes, font faces ----------
/**
 * A rule's declarations as authored, read from its text.
 *
 * Not from `CSSStyleDeclaration`: a `var()` inside a shorthand becomes a pending-substitution
 * value, so `background: var(--gray-a3)` enumerates as `background-color` … with every longhand
 * reporting an empty string. The token is only visible in the text.
 */
export function declarations(r: CSSStyleRule): [string, string][] {
  const body = r.cssText.slice(r.cssText.indexOf("{") + 1, r.cssText.lastIndexOf("}"));
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === ";" && !depth) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => {
    const i = p.indexOf(":");
    return i < 0 ? null : ([p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]);
  }).filter((d): d is [string, string] => !!d && !!d[0]);
}

/** Does this rule name a design token — either using one, or defining one? */
export const declaresVar = (r: CSSStyleRule) =>
  declarations(r).some(([p, v]) => p.startsWith("--") || v.includes("var("));

const holdsNow = (cond: string | null) => {
  if (!cond) return true;
  try { return matchMedia(cond).matches; } catch { return false; }
};

export function sheetRules() {
  const styleRules: { r: CSSStyleRule; cond: string | null }[] = [];
  /** Rules that could explain a resolved value as a token — the input to `varSources`. */
  const varRules: CSSStyleRule[] = [];
  /** Every plain style rule's selector + text, for the reveal-class scan in `scrollBehaviour`. */
  const allRules: { selectorText: string; cssText: string }[] = [];
  const keyframes: Record<string, string> = {};
  const fontFaces: CSSFontFaceRule[] = [];
  const walk = (rules: CSSRuleList, cond: string | null): void => {
    for (const r of rules) {
      if (r instanceof CSSKeyframesRule) keyframes[r.name] = r.cssText;
      else if (r instanceof CSSFontFaceRule) fontFaces.push(r);
      else if (r instanceof CSSMediaRule) {
        if (!/print/.test(r.conditionText)) walk(r.cssRules, cond ? `${cond} and ${r.conditionText}` : r.conditionText);
      } else if (typeof CSSContainerRule !== "undefined" && r instanceof CSSContainerRule) {
        // A container query is a breakpoint against an ancestor's width, not the viewport's; carry
        // it like a media condition so matched rules still surface, tagged `@container`.
        walk(r.cssRules, cond ? `${cond} and @container ${r.conditionText}` : `@container ${r.conditionText}`);
      } else if (r instanceof CSSStyleRule) {
        if (cond || STATE_RE.test(r.selectorText)) styleRules.push({ r, cond });
        if (allRules.length < 20000) allRules.push({ selectorText: r.selectorText, cssText: r.cssText });
        // A `:hover` rule's token is not what the resting value came from, and a media rule that
        // does not currently hold explains nothing about what is on screen.
        if (!STATE_RE.test(r.selectorText) && holdsNow(cond) && declaresVar(r)) varRules.push(r);
      } else if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules, cond);
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules, null); } catch { /* cross-origin sheet */ } }
  return { styleRules, varRules, allRules, keyframes, fontFaces };
}

/** Elements of the picked subtree a selector hits, ignoring the state and pseudo-element parts. */
/**
 * Strip the state and pseudo-element parts of a selector, leaving what `querySelectorAll` needs —
 * without corrupting anything inside `:has(...)`, `:is(...)` or `:where(...)`. The old blind regex
 * mangled `:has(> img)`; this skips over balanced parentheses.
 */
function stripStates(selector: string): string {
  let out = "", depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    out += ch;
  }
  if (depth === 0) {
    out = out.replace(new RegExp(STATE_RE.source, "g"), "").replace(new RegExp(PSEUDO_EL_RE.source, "g"), "");
  }
  return out.trim();
}

export function matchIds(root: Element, index: Map<Element, number>, selectorText: string): { ids: number[]; hits: Element[] } | null {
  const base = stripStates(selectorText);
  if (!base || base === "*" || /^[>+~,]|[>+~,]$/.test(base)) return null;
  let hits: Element[];
  try { hits = [...root.querySelectorAll(base)]; if (root.matches(base)) hits.unshift(root); } catch { return null; }
  const ids = hits.map((el) => index.get(el)).filter((n): n is number => n !== undefined);
  return ids.length ? { ids, hits } : null;
}

/** Substitute var(--x[, fallback]) with the element's computed custom property, innermost first. */
export function resolveVars(text: string, cs: CSSStyleDeclaration): string {
  for (let i = 0; i < 6; i++) {
    const next = text.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (m, name, fb) => {
      const v = cs.getPropertyValue(name).trim();
      return v || (fb !== undefined ? fb.trim() : m);
    });
    if (next === text) break;
    text = next;
  }
  return text;
}


/** Which forced state a `:hover`/`:focus…`/`:active` selector asks for. */
const forcedState = (pseudo: string): StateName | null => (pseudo === "hover" ? "hover" : pseudo.startsWith("focus") ? "focus-visible" : pseudo === "active" ? "active" : null);

export function matchRules(root: Element, els: Element[], styleRules: { r: CSSStyleRule; cond: string | null }[]) {
  const index = new Map(els.map((el, i) => [el, i]));
  const found: string[] = [];
  const media: MediaRule[] = [];
  // Hovering a child hovers its ancestors, so the picked root always counts as hovered.
  const stateIdx: Record<StateName, Set<number>> = { hover: new Set([0]), "focus-visible": new Set(), active: new Set() };
  for (const { r, cond } of styleRules.slice(0, 20000)) {
    const m = matchIds(root, index, r.selectorText);
    if (!m) continue;
    const { ids, hits } = m;
    const css = resolveVars(r.cssText, getComputedStyle(hits.find((el) => index.has(el))!));
    const text = cond ? `@media ${cond} {\n  ${css}\n}` : css;
    found.push(`/* → ${ids.slice(0, 8).map(sel).join(", ")}${ids.length > 8 ? ", …" : ""} */\n${text}`);
    if (cond) {
      const props = Array.from({ length: r.style.length }, (_, n) => r.style.item(n));
      media.push({ ids, cond, selector: r.selectorText, props });
    }
    for (const m of r.selectorText.matchAll(new RegExp(STATE_RE.source, "g"))) {
      const state = forcedState(m[1]);
      if (state) for (const i of ids) stateIdx[state].add(i);
    }
  }
  const states = Object.fromEntries(Object.entries(stateIdx).map(([k, v]) => [k, [...v]])) as StateIndices;
  return { found, states, media };
}
