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

export function toTailwind(blocks: Blocks): string {
  const lines: string[] = [];
  for (const i of Object.keys(blocks)) {
    const b = blocks[+i];
    const classes = Object.entries(b.props).map(([p, v]) => utility(p, v, state.sources[+i]?.props[p]));
    if (classes.length) lines.push(`${sel(+i)} ${classes.join(" ")}`);
  }
  return lines.length ? `## Tailwind (v4 — lossy; the resolved CSS above is authoritative)\n${lines.join("\n")}` : "";
}
