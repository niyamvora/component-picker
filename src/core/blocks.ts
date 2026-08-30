/**
 * A captured element as a block of CSS: measure it, print it, and diff two of them.
 */

import { sameKnob, sel } from "./const";
import { DIV_DEF, defaultsFor, SPAN_DEF, styleParent } from "./defaults";
import { diffProps } from "./props";
import { state } from "./state";
import { tokenHint } from "./tokens";
import type { Block, Blocks, MediaRule } from "../shared/types";

export function label(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => "." + c).join("") : "";
  return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}`.slice(0, 60);
}

/** Style blocks for every element in `els` (index-keyed). Hidden subtrees are recorded as display:none and not descended. */
export function computeBlocks(els: Element[]): Blocks {
  const blocks: Blocks = {}, hidden: Element[] = [];
  els.forEach((el, i) => {
    if (hidden.some((h) => h.contains(el))) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none") {
      hidden.push(el);
      blocks[i] = { label: label(el), props: { display: "none" }, raw: {}, pseudos: {} };
      return;
    }
    const tagDef = defaultsFor(el), def = el instanceof SVGElement ? tagDef : DIV_DEF();
    const parent = i === 0 ? null : styleParent(el);
    const parentCs = parent ? getComputedStyle(parent) : null;
    const { props, raw } = diffProps(cs, def, tagDef, parentCs, el);
    const pseudos: Record<string, Record<string, string>> = {};
    for (const ps of ["::before", "::after"]) {
      const pcs = getComputedStyle(el, ps);
      const c = pcs.content;
      if (!c || c === "none" || c === "normal") continue;
      pseudos[ps] = { content: c, ...diffProps(pcs, SPAN_DEF(), SPAN_DEF(), cs, null).props };
    }
    const rect = el.getBoundingClientRect();
    blocks[i] = { label: label(el), props, raw, rect: [Math.round(rect.width), Math.round(rect.height)], pseudos };
  });
  return blocks;
}

/**
 * Properties whose px values are worth reading as rem — the ones a design system's scale is
 * built from. `box-shadow` and `transform` are deliberately absent: nobody writes those in rem.
 */
const REM_PROPS = new Set(["font-size", "line-height", "letter-spacing", "text-underline-offset",
  "padding", "margin", "gap", "row-gap", "column-gap", "border-radius", "width", "height",
  "min-width", "max-width", "min-height", "max-height", "top", "right", "bottom", "left"]);

/**
 * `14px` is `.875rem` is Tailwind's `text-sm` — the px value is what the browser resolved, the rem
 * is what the design system was written in, and only one of them is greppable in the target repo.
 *
 * Only clean conversions are shown: 13.3333px (a UA-default button) is 0.8333rem, which nobody
 * typed and which would be noise on every line.
 *
 * ponytail: uses the root size captured at pick time for every viewport; a page that changes its
 * root font-size per breakpoint would need it captured per snapshot.
 */
export function remHint(prop: string, value: string, rootPx: number): string | null {
  if (!REM_PROPS.has(prop) || !rootPx) return null;
  let converted = false;
  const out = value.split(" ").map((token) => {
    const m = /^(-?[\d.]+)px$/.exec(token);
    if (!m) return token;
    const n = parseFloat(m[1]);
    if (n === 0) return "0";
    const rem = n / rootPx;
    // Only a value that survives the round-trip: 13.3333px is 0.8333rem, which nobody typed and
    // which would put a wrong-looking number on every UA-styled line.
    if (Math.abs(parseFloat(rem.toFixed(3)) - rem) > 0.0001) return token;
    converted = true;
    return `${parseFloat(rem.toFixed(3))}rem`;
  });
  return converted ? out.join(" ") : null;
}

export function renderBlock(i: number, b: Block, props = b.props, pseudos = b.pseudos,
                     notes: Record<string, string[]> = {}): string[] {
  const out: string[] = [];
  const lines = Object.entries(props).map(([p, v]) => {
    const hints = [tokenHint(i, p, v), remHint(p, v, state.rootPx), ...(notes[p] ?? [])].filter((h): h is string => !!h);
    return `  ${p}: ${v};${hints.length ? ` /* ${hints.join(" · ")} */` : ""}`;
  });
  if (lines.length) out.push(`${sel(i)} { /* ${b.label}${b.rect ? ` ${b.rect[0]}×${b.rect[1]}` : ""} */\n${lines.join("\n")}\n}`);
  for (const [ps, pp] of Object.entries(pseudos)) {
    out.push(`${sel(i)}${ps} {\n${Object.entries(pp).map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`);
  }
  return out;
}

/**
 * Does this query hold at `width`? `null` when the condition is something other than a plain
 * width bound — an orientation or hover-capability query gets quoted without a verdict rather
 * than guessed at.
 */
const WIDTH_COND = /\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/g;
export function condApplies(cond: string, width: number): boolean | null {
  let judged = false, holds = true;
  for (const m of cond.matchAll(WIDTH_COND)) {
    judged = true;
    const px = parseFloat(m[2]) * (m[3] === "px" ? 1 : 16);
    holds &&= m[1] === "min" ? width >= px : width <= px;
  }
  return judged ? holds : null;
}

/**
 * The rule that explains a property changing at this viewport.
 *
 * Without it a responsive section reads as though the layout reflowed, when in fact a breakpoint
 * stopped applying — `font-size: 16px` on mobile is Tailwind's `text-base sm:text-sm`, not a
 * consequence of the narrower box, and the two want completely different fixes.
 */
export function breakpointNote(media: MediaRule[], id: number, prop: string, width: number): string | null {
  const hit = media.filter((m) => m.ids.includes(id) && m.props.some((p) => sameKnob(p, prop))).pop();
  if (!hit) return null;
  const verdict = condApplies(hit.cond, width);
  const says = verdict === null ? "" : verdict ? " applies" : " no longer applies";
  return `@media ${hit.cond} ${hit.selector}${says}`;
}


/** Only what changed vs the desktop blocks. */
export function diffBlocks(desktop: Blocks, other: Blocks, media: MediaRule[] = [], width = 0): string[] {
  const out: string[] = [];
  for (const i of Object.keys(other)) {
    const m = other[+i], d = desktop[+i];
    const changed: Record<string, string> = {};
    for (const k of new Set([...Object.keys(m.props), ...(d ? Object.keys(d.props) : [])])) {
      // ponytail: composite keys (border/transition) absent on one side read as "unchanged"; PROPS always have raw values
      const mv = m.props[k] ?? m.raw[k], dv = d ? d.props[k] ?? d.raw[k] : undefined;
      if (mv !== undefined && mv !== dv) changed[k] = mv;
    }
    const pseudos: Record<string, Record<string, string>> = {};
    for (const [ps, pp] of Object.entries(m.pseudos)) {
      if (JSON.stringify(pp) !== JSON.stringify(d && d.pseudos[ps])) pseudos[ps] = pp;
    }
    const notes: Record<string, string[]> = {};
    if (width) for (const k of Object.keys(changed)) {
      const note = breakpointNote(media, +i, k, width);
      if (note) notes[k] = [note];
    }
    out.push(...renderBlock(+i, m, changed, pseudos, notes));
  }
  return out;
}
