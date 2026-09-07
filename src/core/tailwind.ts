/**
 * The resolved CSS, again as Tailwind utility classes.
 *
 * Every paid competitor sells this. We can do it better than they can, because we know the *token*
 * behind each value: `rgba(176,199,217,.145)` with a `var(--gray-a3)` source becomes `bg-gray-a3`,
 * not a hex arbitrary value. It is a lossy convenience — the resolved CSS section stays authoritative
 * — and nothing is silently dropped: a property with no mapping becomes an arbitrary property.
 */

import { sel } from "./const";
import { state } from "./state";
import type { Blocks } from "../shared/types";

/** px → Tailwind spacing step (16→4, 6→1.5, 1→px), or null when off the 4px scale. */
function space(px: string): string | null {
  const n = parseFloat(px);
  if (px === "0px" || n === 0) return "0";
  if (px === "1px") return "px";
  if (!/px$/.test(px)) return null;
  const step = n / 4;
  return Number.isInteger(step) || step % 0.5 === 0 ? String(step) : null;
}

const SPACE_PREFIX: Record<string, string> = { padding: "p", margin: "m", gap: "gap", "row-gap": "gap-y", "column-gap": "gap-x" };

const STATIC: Record<string, Record<string, string>> = {
  display: { flex: "flex", "inline-flex": "inline-flex", grid: "grid", block: "block", "inline-block": "inline-block", inline: "inline", none: "hidden" },
  position: { relative: "relative", absolute: "absolute", fixed: "fixed", sticky: "sticky", static: "static" },
  "flex-direction": { row: "flex-row", column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" },
  "flex-wrap": { wrap: "flex-wrap", nowrap: "flex-nowrap" },
  "justify-content": { "flex-start": "justify-start", "flex-end": "justify-end", center: "justify-center", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly" },
  "align-items": { "flex-start": "items-start", "flex-end": "items-end", center: "items-center", baseline: "items-baseline", stretch: "items-stretch" },
  "text-align": { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" },
  "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "normal-case" },
  "font-weight": { "400": "font-normal", "500": "font-medium", "600": "font-semibold", "700": "font-bold", "800": "font-extrabold", "900": "font-black" },
  "box-sizing": { "border-box": "box-border", "content-box": "box-content" },
  "overflow-x": { hidden: "overflow-x-hidden", auto: "overflow-x-auto", scroll: "overflow-x-scroll" },
  "overflow-y": { hidden: "overflow-y-hidden", auto: "overflow-y-auto", scroll: "overflow-y-scroll" },
  cursor: { pointer: "cursor-pointer", default: "cursor-default", "not-allowed": "cursor-not-allowed" },
};

/** One property → one or more classes, preferring the token when the stylesheet named one. */
function utility(prop: string, value: string, token: string | undefined): string {
  if (STATIC[prop]?.[value]) return STATIC[prop][value];
  if (prop in SPACE_PREFIX) {
    const s = space(value);
    return `${SPACE_PREFIX[prop]}-${s ?? `[${value}]`}`;
  }
  const colorLike = /color|background-color|border-color/.test(prop);
  if (colorLike) {
    const kind = prop.startsWith("background") ? "bg" : prop === "color" ? "text" : "border";
    return `${kind}-[${token ? token : value.replace(/\s+/g, "")}]`;
  }
  if (prop === "border-radius") { const s = space(value); return s ? `rounded-[${value}]` : `rounded-[${value}]`; }
  if (prop === "width") return value === "100%" ? "w-full" : value === "100vw" ? "w-screen" : `w-[${value}]`;
  if (prop === "height") return value === "100%" ? "h-full" : value === "100vh" ? "h-screen" : `h-[${value}]`;
  if (prop === "font-size") return `text-[${value}]`;
  if (prop === "line-height") return `leading-[${value}]`;
  if (prop === "opacity") return `opacity-[${value}]`;
  if (prop === "z-index") return `z-[${value}]`;
  // No mapping: an arbitrary property keeps it rather than dropping it.
  return `[${prop}:${value.replace(/\s+/g, "_")}]`;
}

// ---------- Tailwind v4 variant rules: the motion spec, decoded (#107) ----------
/**
 * On a Tailwind v4 site the variant utilities *are* the animation.
 *
 * `.data-starting-style\:scale-90[data-starting-style] { scale: .9 }` is the entire enter frame of
 * a popup, and nothing else in a capture carries it: it is not a `:hover` rule, so the source-rules
 * scan skips it, and the attribute it keys off is absent at rest, so `querySelectorAll` cannot find
 * the element either. The class name is the reliable handle — it is on the element the whole time,
 * whatever the state — so matching happens on the class and the condition is read back out of it.
 *
 * Printed decoded, because `group-data-\[popup-open\]\:translate-y-0\.5` is not something a reader
 * should have to parse twice.
 */

/** The leading class of a selector, with Tailwind's backslash escapes resolved to real characters. */
function leadingClass(selector: string): string | null {
  if (selector[0] !== ".") return null;
  let out = "";
  for (let i = 1; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") { out += selector[++i] ?? ""; continue; }  // `\:` is a literal colon in the name
    if (/[.#[:>+~,\s]/.test(ch)) break;
    out += ch;
  }
  return out || null;
}

/** `data-starting-style:scale-90` → variants `[data-starting-style]`, utility `scale-90`. */
function splitVariants(cls: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let cur = "", depth = 0;
  for (const ch of cls) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === ":" && !depth) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] };
}

const PLAIN: Record<string, string> = {
  "data-starting-style": "entering (first frame after mount)",
  "data-ending-style": "leaving (last frame before unmount)",
  "data-open": "open", "data-closed": "closed", "data-popup-open": "popup open",
  hover: "hover", focus: "focus", "focus-visible": "keyboard focus", active: "pressed",
  disabled: "disabled", first: "first child", last: "last child", dark: "dark theme",
  "motion-reduce": "reduced motion", "motion-safe": "motion allowed",
};

/** One variant, in words. Falls back to the raw token rather than dropping a condition. */
function humanVariant(v: string): string {
  if (PLAIN[v]) return PLAIN[v];
  const rel = /^(group|peer)-(.*)$/.exec(v);
  if (rel) return `${rel[1] === "group" ? "an ancestor" : "a sibling"} .${rel[1]} is ${humanVariant(rel[2])}`;
  const attr = /^data-\[([\w-]+)=?(.*?)\]$/.exec(v);
  // `data-[popup-open]` and a bare `data-popup-open` are the same condition written two ways.
  if (attr) return attr[2] ? `data-${attr[1]}="${attr[2]}"` : PLAIN[`data-${attr[1]}`] ?? `data-${attr[1]} set`;
  const aria = /^aria-\[?([\w-]+)=?(.*?)\]?$/.exec(v);
  if (aria && v.startsWith("aria-")) return `aria-${aria[1]}${aria[2] ? `="${aria[2]}"` : ""}`;
  if (/^(sm|md|lg|xl|2xl)$/.test(v)) return `viewport ≥ ${v}`;
  if (/^max-/.test(v)) return `viewport below ${v.slice(4)}`;
  return v;
}

const bodyOf = (cssText: string) =>
  cssText.slice(cssText.indexOf("{") + 1, cssText.lastIndexOf("}")).trim().replace(/\s*;\s*$/, "");

export function tailwindVariants(els: Element[], rules: { selectorText: string; cssText: string }[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rules) {
    const cls = leadingClass(r.selectorText);
    if (!cls || !cls.includes(":") || seen.has(cls)) continue;
    const { variants, utility } = splitVariants(cls);
    if (!variants.length) continue;
    const i = els.findIndex((el) => el.classList.contains(cls));
    if (i < 0) continue;
    seen.add(cls);
    const body = bodyOf(r.cssText);
    if (!body) continue;
    lines.push(`${sel(i)} \`${cls}\`\n  when ${variants.map(humanVariant).join(" and ")} → ${utility}\n  { ${body} }`);
    if (lines.length >= 40) break;
  }
  return lines.length
    ? `## Tailwind variant rules (decoded)\n${lines.join("\n\n")}\n` +
      `_These are conditional rules keyed off state attributes, not resting styles — on a Tailwind v4 site they carry the enter/exit animation. The class stays on the element; the condition decides when the declarations apply._`
    : "";
}

export function toTailwind(blocks: Blocks): string {
  const lines: string[] = [];
  for (const i of Object.keys(blocks)) {
    const b = blocks[+i];
    const classes = Object.entries(b.props).map(([p, v]) => utility(p, v, state.sources[+i]?.props[p]));
    if (classes.length) lines.push(`${sel(+i)} ${classes.join(" ")}`);
  }
  return lines.length ? `## Tailwind (v4 — lossy; the resolved CSS above is authoritative)\n${lines.join("\n")}` : "";
}
