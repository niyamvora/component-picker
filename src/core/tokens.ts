/**
 * Where a resolved value came from: the design token behind the rgba.
 */

import { sameKnob } from "./const";
import { declarations, matchIds } from "./rules";
import { options } from "../shared/options";
import { state } from "./state";
import type { VarSource } from "../shared/types";


/**
 * Where each resolved value came from.
 *
 * `rgba(176, 199, 217, 0.145)` is the truth about pixels, but `var(--gray-a3)` is the portable
 * truth: it is the half that maps onto the target project's own tokens, and the only half that is
 * greppable. Later declarations win, which approximates the cascade well enough to name a token.
 *
 * ponytail: source order, not specificity. A low-specificity rule later in the sheet can win here
 * and it cannot in the browser; the value printed beside it is always the real computed one.
 */
export function varSources(root: Element, els: Element[], varRules: CSSStyleRule[]): Record<number, VarSource> {
  const index = new Map(els.map((el, i) => [el, i]));
  const out: Record<number, VarSource> = {};
  const at = (i: number) => (out[i] ??= { props: {}, customs: {} });
  const absorb = (i: number, decls: [string, string][]) => {
    for (const [p, v] of decls) {
      if (p.startsWith("--")) { at(i).customs[p] = v; continue; }
      if (v.includes("var(")) { at(i).props[p] = v; continue; }
      // A later literal overrides the token that was recorded for the same knob — printing
      // `var(--gray-a3)` next to a value an inline style actually set would be a lie.
      for (const seen of Object.keys(at(i).props)) if (sameKnob(seen, p)) delete at(i).props[seen];
    }
  };
  for (const r of varRules.slice(0, 20000)) {
    const m = matchIds(root, index, r.selectorText);
    if (m) { const decls = declarations(r); for (const i of m.ids) absorb(i, decls); }
  }
  // Inline styles are the last word, so they are absorbed last.
  els.forEach((el, i) => {
    const st = (el as HTMLElement).style;
    if (!st?.length) return;
    absorb(i, Array.from({ length: st.length }, (_, n) => [st.item(n), st.getPropertyValue(st.item(n))] as [string, string]));
  });
  return out;
}

/**
 * Tailwind v4 routes a utility's token through `--tw-*` plumbing: `bg-gray-a3` sets
 * `--tw-bg: var(--gray-a3)`. Printing the plumbing helps nobody, so it is followed to the name a
 * person actually wrote.
 */
export function expandTw(expr: string, customs: Record<string, string>): string {
  for (let hop = 0; hop < 6 && /var\(--tw-/.test(expr); hop++) {
    const next = expr.replace(/var\((--tw-[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (m, name, fb) => customs[name]?.trim() || (fb ?? m));
    if (next === expr) break;
    expr = next;
  }
  return expr;
}

/**
 * Every token the bundle ended up naming, resolved.
 *
 * Read back off the finished Markdown rather than collected while rendering: the hints are the
 * only place tokens appear, so scanning them cannot drift out of sync with what was printed.
 */
export function tokensSection(md: string[], root: Element, els: Element[]): string | null {
  const names = new Set<string>();
  for (const m of md.join("\n").matchAll(/var\((--[\w-]+)/g)) if (!m[1].startsWith("--tw-")) names.add(m[1]);
  if (!names.size) return null;
  // A token can be scoped anywhere in the subtree — a gradient's stops are often declared on the
  // element that draws it — so the lookup walks outward from the pick and then through it.
  const scopes = [root, document.documentElement, ...els].map((el) => getComputedStyle(el));
  const resolve = (n: string) => scopes.map((cs) => cs.getPropertyValue(n).trim()).find(Boolean);
  const resolved = [...names].sort().map((n) => [n, resolve(n)] as const);
  const lines = resolved.map(([n, v]) => `${n}: ${v || "/* not resolvable from the picked subtree */"};`);
  const json = options.tokensJson ? w3cTokens(resolved) : "";
  return `## Tokens used\n\`\`\`css\n${lines.join("\n")}\n\`\`\`${json}`;
}

/**
 * The tokens again, as the [W3C Design Tokens format](https://www.designtokens.org/tr/drafts/format/).
 *
 * The CSS list above is what a human reads; this is what Style Dictionary, Tokens Studio and Figma
 * Variables read. `$type` is inferred from the resolved value, and omitted rather than guessed when
 * the value does not clearly fit a category — the spec allows an untyped token.
 */
function w3cTokens(resolved: readonly (readonly [string, string | undefined])[]): string {
  const groups: Record<string, Record<string, unknown>> = {};
  const put = (group: string, name: string, value: unknown, type?: string) => {
    (groups[group] ??= {})[name] = type ? { $type: type, $value: value } : { $value: value };
  };
  for (const [rawName, value] of resolved) {
    if (!value) continue;
    const name = rawName.replace(/^--/, "");
    const num = parseFloat(value);
    const unit = /(-?[\d.]+)(px|rem|em|%|vh|vw)$/.exec(value);
    const time = /^(-?[\d.]+)(m?s)$/.exec(value);
    const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(value);
    if (/^(#|rgb|rgba|hsl|hsla|oklch|oklab|color)\b|^#[0-9a-f]/i.test(value)) put("color", name, value, "color");
    else if (unit) put("dimension", name, { value: parseFloat(unit[1]), unit: unit[2] }, "dimension");
    else if (time) put("duration", name, { value: parseFloat(time[1]), unit: time[2] }, "duration");
    else if (bezier) put("cubicBezier", name, bezier[1].split(",").map((n) => parseFloat(n)), "cubicBezier");
    else if (value.includes(",") && /[a-z]/i.test(value) && !/[(){}]/.test(value)) put("fontFamily", name, value.split(",").map((f) => f.trim().replace(/['"]/g, "")), "fontFamily");
    else if (Number.isFinite(num) && String(num) === value.trim()) put("number", name, num, "number");
    else put("other", name, value); // untyped rather than a wrong guess
  }
  return `\n\`\`\`json\n${JSON.stringify(groups, null, 2)}\n\`\`\``;
}

/** The token behind a printed property, if the stylesheet named one. */
export function tokenHint(i: number, prop: string, value: string): string | null {
  const src = state.sources[i];
  if (!src) return null;
  const found = Object.entries(src.props).filter(([p]) => sameKnob(p, prop)).pop();
  if (!found) return null;
  const expr = expandTw(found[1].trim(), src.customs);
  if (!expr.includes("var(")) return null; // the plumbing resolved to a literal; the value already says it
  const space = / in ([a-z-]+)/.exec(value); // gradients keep their interpolation space
  return expr + (space ? ` — interpolation: ${space[1]}` : "");
}
