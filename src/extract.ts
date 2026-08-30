/**
 * The extraction engine: everything that turns a picked element into the Markdown bundle.
 *
 * Pure DOM — the only extension API it touches is `chrome.runtime.sendMessage`, guarded, so the
 * whole engine also runs in a plain page. That is how `test/check.sh` exercises it with no
 * extension loaded at all.
 */

import type { Block, Blocks, MediaRule, Message, MeasureResult, ProbeResult, Snapshot, StateIndices, StateName } from "./types";

export const UI = "data-cp-ui";
const TMP = "data-cp-tmp"; // element index, readable from the MAIN world and from CDP while capturing
const MAX_ELEMENTS = 300; // ponytail: hard cap; past this the bundle stops being pasteable
const MAX_OUT = 180_000;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
const SIZED_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME"]); // replaced elements: computed size is intrinsic, not layout
const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const SVG_NS = "http://www.w3.org/2000/svg";

const PROPS = `display position top right bottom left z-index float clear box-sizing width height
  min-width max-width min-height max-height margin-top margin-right margin-bottom margin-left
  padding-top padding-right padding-bottom padding-left overflow-x overflow-y
  flex-direction flex-wrap justify-content align-items align-content align-self flex-grow flex-shrink flex-basis order row-gap column-gap
  grid-template-columns grid-template-rows grid-template-areas grid-auto-flow grid-auto-columns grid-auto-rows
  grid-column-start grid-column-end grid-row-start grid-row-end justify-items justify-self
  font-family font-size font-weight font-style line-height letter-spacing text-align text-transform
  text-decoration-line text-decoration-style text-decoration-color text-decoration-thickness text-underline-offset
  white-space word-break overflow-wrap text-overflow text-wrap vertical-align font-variant-numeric font-feature-settings text-shadow
  -webkit-line-clamp -webkit-box-orient
  color background-color background-image background-size background-position background-repeat background-clip background-origin background-attachment
  -webkit-text-fill-color -webkit-background-clip opacity mix-blend-mode filter backdrop-filter isolation
  outline-width outline-style outline-color outline-offset box-shadow
  transform transform-origin perspective backface-visibility will-change
  cursor pointer-events user-select visibility object-fit object-position aspect-ratio list-style-type appearance resize clip-path
  fill stroke stroke-width`.split(/\s+/);
const INHERITED = new Set(`color font-family font-size font-weight font-style line-height letter-spacing text-align text-transform
  white-space word-break overflow-wrap text-wrap visibility cursor list-style-type font-variant-numeric font-feature-settings text-shadow
  -webkit-text-fill-color user-select pointer-events fill stroke stroke-width`.split(/\s+/));
const DEF_PROPS = [...PROPS, "transition-duration", "animation-name",
  ...SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]),
  ...CORNERS.map((c) => `border-${c}-radius`)];

const STATE_RE = /:(hover|focus-visible|focus-within|focus|active|visited|checked|disabled|placeholder-shown|open)\b/;
const PSEUDO_EL_RE = /::?(before|after|placeholder|marker|selection|first-letter|first-line|backdrop|file-selector-button)\b/;
const sel = (i: number) => `[data-cp="${i + 1}"]`;
/** Split a CSS comma list without breaking inside cubic-bezier(…), var(…), url(…). */
const splitList = (str: string): string[] => {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  return [...out, cur.trim()];
};
/** Read a property from either a live computed style or a captured defaults record. */
const val = (src: CSSStyleDeclaration | Record<string, string>, p: string): string =>
  (src instanceof CSSStyleDeclaration ? src.getPropertyValue(p) : src[p]);

// ---------- browser default styles per tag (fresh about:blank iframe) ----------
const defaults: Record<string, Record<string, string>> = {};
let frame: HTMLIFrameElement | undefined;
function defaultsFor(el: Element): Record<string, string> {
  const svg = el instanceof SVGElement;
  const key = (svg ? "svg:" : "") + el.tagName.toLowerCase();
  if (defaults[key]) return defaults[key];
  if (!frame) {
    frame = document.createElement("iframe");
    frame.setAttribute(UI, "");
    frame.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;border:0;opacity:0;pointer-events:none";
    document.documentElement.append(frame);
  }
  const doc = frame.contentDocument!;
  const probe = svg ? doc.createElementNS(SVG_NS, el.tagName) : doc.createElement(el.tagName);
  const host = svg && el.tagName !== "svg" ? doc.body.appendChild(doc.createElementNS(SVG_NS, "svg")) : doc.body;
  host.append(probe);
  const cs = frame.contentWindow!.getComputedStyle(probe);
  const d: Record<string, string> = {};
  for (const p of DEF_PROPS) d[p] = cs.getPropertyValue(p);
  return (defaults[key] = d);
}

const DIV_DEF = () => defaultsFor(document.createElement("div"));
const SPAN_DEF = () => defaultsFor(document.createElement("span"));

// ---------- one element's style, as the diff from a neutral baseline / its parent ----------
const sized = (el: Element, cs: CSSStyleDeclaration, p: string) =>
  SIZED_TAGS.has(el.tagName.toUpperCase()) || /^(absolute|fixed)$/.test(cs.position) || !!((el as HTMLElement).style?.getPropertyValue(p)) || el.hasAttribute(p);
/** Is `v` the default `50% 50%` transform-origin, i.e. the border-box centre? */
const isCenter = (v: string, cs: CSSStyleDeclaration) => {
  const extra = (axis: string[]) => cs.boxSizing === "content-box"
    ? axis.reduce((n, s) => n + parseFloat(cs.getPropertyValue(`padding-${s}`)) + parseFloat(cs.getPropertyValue(`border-${s}-width`)), 0) : 0;
  const [x, y] = v.split(" ").map(parseFloat);
  const w = parseFloat(cs.width) + extra(["left", "right"]), h = parseFloat(cs.height) + extra(["top", "bottom"]);
  return Math.abs(x - w / 2) < 0.01 && Math.abs(y - h / 2) < 0.01;
};
const MIRRORS_COLOR = new Set(["text-decoration-color", "outline-color", "-webkit-text-fill-color"]);
const box4 = (prefix: string, get: (k: string) => string) => {
  const v = SIDES.map((s) => get(`${prefix}-${s}`));
  return new Set(v).size === 1 ? v[0] : v[0] === v[2] && v[1] === v[3] ? `${v[0]} ${v[1]}` : v.join(" ");
};

/** `def` is the neutral baseline (a plain div/span), `tagDef` the element's own UA default — only `display` is judged against the latter. */
function diffProps(cs: CSSStyleDeclaration, def: Record<string, string>, tagDef: Record<string, string>,
                   parentCs: CSSStyleDeclaration | null, el: Element | null) {
  const props: Record<string, string> = {}, raw: Record<string, string> = {};
  for (const p of PROPS) {
    const v = cs.getPropertyValue(p);
    raw[p] = v;
    if (!v) continue;
    if (INHERITED.has(p) && parentCs) { if (v === parentCs.getPropertyValue(p)) continue; }
    else if (p === "display") { if (v === tagDef.display) continue; }
    else if (v === def[p] && v === tagDef[p]) continue; // differs from neither the neutral div nor the tag's own UA default
    if (/^(top|right|bottom|left)$/.test(p) && v === "0px" && cs.position === "relative") continue; // auto reads as 0px

    // Computed width/height is always px, even for fluid boxes; only emit when the author sized it.
    if ((p === "width" || p === "height") && el && !sized(el, cs, p)) continue;
    if ((p === "min-width" || p === "min-height") && v === "auto") continue; // flex/grid items report auto
    if (MIRRORS_COLOR.has(p) && v === cs.color) continue; // currentColor
    if (p === "transform-origin" && (cs.transform === "none" || (el && isCenter(v, cs)))) continue;
    if (p === "transform" && (v === "matrix(1, 0, 0, 1, 0, 0)" || cs.animationName !== "none")) continue; // keyframes own it
    // Flex/grid items are blockified: inline-block→block is the container's doing, not the author's.
    if (p === "display" && v === "block" && parentCs && /flex|grid/.test(parentCs.display) && /^inline/.test(tagDef.display)) continue;
    props[p] = v;
  }
  for (const box of ["margin", "padding"]) {
    if (SIDES.some((s) => props[`${box}-${s}`])) { SIDES.forEach((s) => delete props[`${box}-${s}`]); props[box] = box4(box, (k) => raw[k]); }
  }
  if (props["row-gap"] && props["row-gap"] === props["column-gap"]) { props.gap = props["row-gap"]; delete props["row-gap"]; delete props["column-gap"]; }
  const side = (src: CSSStyleDeclaration | Record<string, string>) => SIDES.map((s) => {
    const st = val(src, `border-${s}-style`), w = val(src, `border-${s}-width`);
    // Tailwind preflight sets `border: 0 solid` on every element; a zero-width border is no border.
    return st === "none" || w === "0px" ? "none" : `${w} ${st} ${val(src, `border-${s}-color`)}`;
  });
  const b = side(cs), db = side(def);
  if (b.join() !== db.join()) {
    if (new Set(b).size === 1) props.border = b[0];
    else SIDES.forEach((s, i) => { if (b[i] !== db[i]) props[`border-${s}`] = b[i]; });
  }
  const r = CORNERS.map((c) => val(cs, `border-${c}-radius`)), dr = CORNERS.map((c) => val(def, `border-${c}-radius`));
  if (r.join() !== dr.join()) props["border-radius"] = new Set(r).size === 1 ? r[0] : r.join(" ");
  if (splitList(cs.transitionDuration).some((d) => d !== "0s")) {
    const lists = ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"]
      .map((p) => splitList(cs.getPropertyValue(p)));
    const n = Math.max(...lists.map((l) => l.length));
    props.transition = Array.from({ length: n }, (_, i) => lists.map((l) => l[i % l.length]).join(" ")).join(", ");
  }
  if (cs.animationName !== "none") {
    props.animation = ["animation-name", "animation-duration", "animation-timing-function", "animation-delay",
      "animation-iteration-count", "animation-direction", "animation-fill-mode"].map((p) => cs.getPropertyValue(p)).join(" ");
  }
  return { props, raw };
}

export function label(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => "." + c).join("") : "";
  return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}`.slice(0, 60);
}

/** Style blocks for every element in `els` (index-keyed). Hidden subtrees are recorded as display:none and not descended. */
function computeBlocks(els: Element[]): Blocks {
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
    const parentCs = i === 0 ? null : getComputedStyle(el.parentElement!);
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
function remHint(prop: string, value: string, rootPx: number): string | null {
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

function renderBlock(i: number, b: Block, props = b.props, pseudos = b.pseudos,
                     notes: Record<string, string[]> = {}): string[] {
  const out: string[] = [];
  const lines = Object.entries(props).map(([p, v]) => {
    const rem = remHint(p, v, rootPx);
    const hints = [...(rem ? [rem] : []), ...(notes[p] ?? [])];
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
function condApplies(cond: string, width: number): boolean | null {
  let judged = false, holds = true;
  for (const m of cond.matchAll(WIDTH_COND)) {
    judged = true;
    const px = parseFloat(m[2]) * (m[3] === "px" ? 1 : 16);
    holds &&= m[1] === "min" ? width >= px : width <= px;
  }
  return judged ? holds : null;
}

/** `row-gap` and `gap` are the same knob; so are `padding` and `padding-top`. */
const sameKnob = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/^(row|column)-gap$/, "gap");
  const [x, y] = [norm(a), norm(b)];
  return x === y || x.startsWith(`${y}-`) || y.startsWith(`${x}-`);
};

/**
 * The rule that explains a property changing at this viewport.
 *
 * Without it a responsive section reads as though the layout reflowed, when in fact a breakpoint
 * stopped applying — `font-size: 16px` on mobile is Tailwind's `text-base sm:text-sm`, not a
 * consequence of the narrower box, and the two want completely different fixes.
 */
function breakpointNote(media: MediaRule[], id: number, prop: string, width: number): string | null {
  const hit = media.filter((m) => m.ids.includes(id) && m.props.some((p) => sameKnob(p, prop))).pop();
  if (!hit) return null;
  const verdict = condApplies(hit.cond, width);
  const says = verdict === null ? "" : verdict ? " applies" : " no longer applies";
  return `@media ${hit.cond} ${hit.selector}${says}`;
}

/** The page's root font-size at pick time — what every rem hint is measured against. */
let rootPx = 16;

/** Only what changed vs the desktop blocks. */
function diffBlocks(desktop: Blocks, other: Blocks, media: MediaRule[] = [], width = 0): string[] {
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

// ---------- stylesheet rules: states, media queries, keyframes, font faces ----------
function sheetRules() {
  const styleRules: { r: CSSStyleRule; cond: string | null }[] = [];
  const keyframes: Record<string, string> = {};
  const fontFaces: CSSFontFaceRule[] = [];
  const walk = (rules: CSSRuleList, cond: string | null): void => {
    for (const r of rules) {
      if (r instanceof CSSKeyframesRule) keyframes[r.name] = r.cssText;
      else if (r instanceof CSSFontFaceRule) fontFaces.push(r);
      else if (r instanceof CSSMediaRule) {
        if (!/print/.test(r.conditionText)) walk(r.cssRules, cond ? `${cond} and ${r.conditionText}` : r.conditionText);
      } else if (r instanceof CSSStyleRule) {
        if (cond || STATE_RE.test(r.selectorText)) styleRules.push({ r, cond });
      } else if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules, cond);
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules, null); } catch { /* cross-origin sheet */ } }
  return { styleRules, keyframes, fontFaces };
}

/** Which forced state a `:hover`/`:focus…`/`:active` selector asks for. */
const forcedState = (pseudo: string): StateName | null => (pseudo === "hover" ? "hover" : pseudo.startsWith("focus") ? "focus-visible" : pseudo === "active" ? "active" : null);

function matchRules(root: Element, els: Element[], styleRules: { r: CSSStyleRule; cond: string | null }[]) {
  const index = new Map(els.map((el, i) => [el, i]));
  const found: string[] = [];
  const media: MediaRule[] = [];
  // Hovering a child hovers its ancestors, so the picked root always counts as hovered.
  const stateIdx: Record<StateName, Set<number>> = { hover: new Set([0]), "focus-visible": new Set(), active: new Set() };
  for (const { r, cond } of styleRules.slice(0, 20000)) {
    const base = r.selectorText.replace(new RegExp(STATE_RE.source, "g"), "").replace(new RegExp(PSEUDO_EL_RE.source, "g"), "").trim();
    if (!base || base === "*" || /^[>+~,]|[>+~,]$/.test(base)) continue;
    let hits: Element[];
    try { hits = [...root.querySelectorAll(base)]; if (root.matches(base)) hits.unshift(root); } catch { continue; }
    const ids = hits.map((el) => index.get(el)).filter((n): n is number => n !== undefined);
    if (!ids.length) continue;
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

/** Substitute var(--x[, fallback]) with the element's computed custom property, innermost first. */
function resolveVars(text: string, cs: CSSStyleDeclaration): string {
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

function fonts(els: Element[], fontFaces: CSSFontFaceRule[]) {
  const fams = new Set(els.map((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/['"]/g, "").trim()));
  const faces = fontFaces.filter((f) => fams.has(f.style.fontFamily.replace(/['"]/g, "").trim())).map((f) =>
    f.cssText.replace(/url\((["']?)([^)"']+)\1\)/g, (_m, _q, u) => `url("${new URL(u, f.parentStyleSheet?.href || location.href).href}")`));
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')].map((l) => l.href).filter((h) => /font/i.test(h));
  return { fams: [...fams], faces, links };
}

// ---------- sibling variants: the same component in its other states ----------
const VARIANT_ATTRS = ["data-state", "aria-selected", "aria-current", "aria-checked", "aria-expanded",
  "aria-pressed", "disabled", "data-active", "data-highlighted", "data-disabled"];
const attrOf = (el: Element, a: string) => (el.hasAttribute(a) ? el.getAttribute(a) || "true" : null);

/**
 * A stepper's done/pending steps and a tab bar's unselected tabs are on the page already — the
 * user just cannot pick two things at once. Siblings that differ from the picked element only by
 * a state attribute are captured as diffs against it.
 */
function variantsOf(root: Element, els: Element[], desktop: Blocks): string[] {
  const parent = root.parentElement;
  if (!parent) return [];
  const out: string[] = [];
  for (const s of [...parent.children]) {
    if (out.length >= 6) break;
    if (s === root || s.tagName !== root.tagName || s.closest(`[${UI}]`)) continue;
    const differing = VARIANT_ATTRS.filter((a) => attrOf(s, a) !== attrOf(root, a));
    if (!differing.length) continue;
    const selector = differing.map((a) => (s.hasAttribute(a) ? `[${a}="${attrOf(s, a)}"]` : `:not([${a}])`)).join("");
    const all = [s, ...s.querySelectorAll("*")].filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase()) && !e.closest(`[${UI}]`));
    const diff = diffBlocks(desktop, computeBlocks(all.slice(0, els.length)));
    const r = s.getBoundingClientRect();
    const note = all.length !== els.length ? ` (markup differs — ${all.length} vs ${els.length} elements)` : "";
    out.push(`${selector} — ${label(s)} ${Math.round(r.width)}×${Math.round(r.height)}${note} — diff vs picked:\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No style differences._"));
  }
  return out;
}

// ---------- framework: React fiber (component names + handler source), Vue ----------
// Page-JS expandos (__reactFiber$…) are invisible from this isolated world, so background.js runs
// pageProbe() in the MAIN world; elements are handed over via a temporary data-cp-tmp attribute.
async function frameworkInfo(els: Element[]): Promise<ProbeResult> {
  const info: ProbeResult = { framework: "not detected", chain: [], handlers: [] };
  els.forEach((el, i) => { for (const a of el.attributes) if (/^on/i.test(a.name)) info.handlers.push(`${sel(i)} ${a.name}="${a.value.slice(0, 300)}"`); });
  try {
    const r = (await send({ type: "probe" })) as ProbeResult | undefined;
    if (r && !r.error) { info.framework = r.framework; info.chain = r.chain; info.handlers.push(...r.handlers); }
  } catch { /* keep defaults */ }
  return info;
}

// ---------- HTML ----------
function htmlOf(root: Element, all: Element[], els: Element[], stamp: Set<number>): string {
  const clone = root.cloneNode(true) as Element;
  const clones = [clone, ...clone.querySelectorAll("*")];
  const pos = new Map(all.map((e, i) => [e, i]));
  els.forEach((el, i) => {
    const c = clones[pos.get(el)!];
    if (!c) return;
    if (stamp.has(i)) c.setAttribute("data-cp", String(i + 1));
    if (el instanceof HTMLImageElement) { c.setAttribute("src", el.currentSrc || el.src); c.removeAttribute("srcset"); c.removeAttribute("sizes"); }
    else if (el instanceof HTMLAnchorElement && el.href) c.setAttribute("href", el.href);
    else if ((el instanceof HTMLVideoElement || el instanceof HTMLSourceElement) && el.src) c.setAttribute("src", el.src);
  });
  clone.querySelectorAll(`script,style,noscript,template,link,meta,[${UI}]`).forEach((n) => n.remove());
  for (const c of clones) {
    c.removeAttribute(TMP);
    for (const a of [...c.attributes]) if (/^on/i.test(a.name)) c.removeAttribute(a.name);
  }
  return clone.outerHTML;
}

// ---------- the bundle ----------
let pending: Element[] = []; // the picked subtree, kept for the snapshots the service worker asks for

export async function extract(root: Element, onStatus: (s: string) => void = () => {}): Promise<string> {
  const all = [root, ...root.querySelectorAll("*")];
  const eligible = all.filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase()) && !e.closest(`[${UI}]`));
  const els = eligible.slice(0, MAX_ELEMENTS);
  pending = els;
  rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  els.forEach((el, i) => el.setAttribute(TMP, String(i)));
  try {
    return await build(root, all, eligible, els, onStatus);
  } finally {
    els.forEach((el) => el.removeAttribute(TMP));
  }
}

async function build(root: Element, all: Element[], eligible: Element[], els: Element[], onStatus: (s: string) => void): Promise<string> {
  const { styleRules, keyframes, fontFaces } = sheetRules();
  const { found: rules, states, media } = matchRules(root, els, styleRules);

  // Everything measurable is measured in one debugger session, starting with the resting
  // desktop state — the pointer is still on the element the user just clicked, and reading
  // getComputedStyle here would record its :hover styles as if they were the resting ones.
  onStatus("Measuring viewports + states…");
  const resp = await measureAll(states);
  const desktop = resp.viewports?.[0]?.blocks ?? computeBlocks(els);

  const stamp = new Set<number>([0]);
  for (const i of Object.keys(desktop)) if (Object.keys(desktop[+i].props).length || Object.keys(desktop[+i].pseudos).length) stamp.add(+i);
  for (const line of rules) for (const m of line.matchAll(/data-cp="(\d+)"/g)) stamp.add(+m[1] - 1);
  const html = htmlOf(root, all, els, stamp);

  const anims = new Set(els.flatMap((el) => splitList(getComputedStyle(el).animationName)).filter((n) => n !== "none"));
  const kf = [...anims].map((n) => keyframes[n]).filter(Boolean);
  const font = fonts(els, fontFaces);
  const { framework, chain, handlers: js } = await frameworkInfo(els);
  const variants = variantsOf(root, els, desktop);
  const rect = root.getBoundingClientRect();

  const md: string[] = [];
  md.push(`# Component picked from ${document.title || location.hostname} — ${location.href}`);
  md.push(`Picked: ${label(root)} ${Math.round(rect.width)}×${Math.round(rect.height)} at (${Math.round(rect.left + scrollX)}, ${Math.round(rect.top + scrollY)}). ` +
    `Desktop viewport ${innerWidth}×${innerHeight} @${devicePixelRatio}x. ` +
    `Framework: ${framework}.${chain.length ? ` Component chain: ${chain.join(" › ")}.` : ""}` +
    `${eligible.length > els.length ? ` NOTE: subtree has ${eligible.length} elements; CSS captured for the first ${els.length}.` : ""}`);
  md.push(`> How to use: paste this to your AI. \`data-cp\` ids on HTML nodes match the CSS selectors below. CSS values are browser-resolved (px/rgb) diffs against browser defaults and the parent element; \`/* … W×H */\` comments are the real rendered box. State, Variant and Responsive sections list ONLY what changes vs the resting desktop capture. \`/* …rem */\` comments restate px against the page's root size (${rootPx}px), and \`/* @media … */\` names the breakpoint behind a responsive change. Rebuild as a React/Next.js component in the project's styling system (Tailwind/CSS modules), keep hover/focus/animation rules, swap absolute asset URLs for local assets.`);
  md.push(`## HTML\n\`\`\`html\n${html}\n\`\`\``);
  md.push(`## CSS (desktop, resting state)` +
    (resp.error ? `\n_Measured with the pointer still on the element — hover styles may be included._` : "") +
    `\n\`\`\`css\n${Object.keys(desktop).flatMap((i) => renderBlock(+i, desktop[+i])).join("\n\n")}\n\`\`\``);
  for (const st of resp.states || []) {
    const diff = diffBlocks(desktop, st.blocks);
    md.push(`## State: ${st.name} (diff vs resting)\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No changes._"));
  }
  if (variants.length) md.push(`## Variants (siblings of the picked element)\n\n${variants.join("\n\n")}`);
  if (rules.length) md.push(`## Source rules (hover/focus/media, from the site's stylesheets)\n\`\`\`css\n${rules.join("\n\n")}\n\`\`\``);
  if (resp.error) md.push(`## Responsive + states\n_Viewport and interaction-state snapshots unavailable: ${resp.error}. Use the source rules above._`);
  for (const v of (resp.viewports || []).slice(1)) {
    const diff = diffBlocks(desktop, v.blocks, media, v.width);
    md.push(`## Responsive: ${v.name} ${v.width}×${v.height} (DPR ${v.dpr}) — root renders ${v.root[0]}×${v.root[1]}\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No style changes vs desktop; layout only reflows._"));
  }
  if (kf.length) md.push(`## Keyframes\n\`\`\`css\n${kf.join("\n\n")}\n\`\`\``);
  md.push(`## Fonts\n- Families used: ${font.fams.join(", ")}` +
    (font.links.length ? `\n- Font stylesheets: ${font.links.join(", ")}` : "") +
    (font.faces.length ? `\n\`\`\`css\n${font.faces.join("\n")}\n\`\`\`` : ""));
  if (js.length) md.push(`## JS / handlers (React props + inline)\n\`\`\`\n${js.join("\n")}\n\`\`\``);

  let out = md.join("\n\n");
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n\n<!-- truncated: bundle exceeded size cap; pick a smaller component -->";
  return out;
}

/** Messaging the service worker — or a reason there is none, since the engine also runs bare. */
async function send(msg: Message): Promise<unknown> {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error("not running as an extension");
  return await chrome.runtime.sendMessage(msg);
}

async function measureAll(states: StateIndices): Promise<MeasureResult> {
  const empty: MeasureResult = { viewports: [], states: [] };
  try {
    return ((await send({ type: "measure", states })) as MeasureResult) ?? { ...empty, error: "no response" };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * How long the picked subtree still needs before its styles are final.
 *
 * A forced :hover on a button with `transition: background-color .3s` reads a colour part-way
 * through the fade if measured too early — `rgb(0, 0, 251)` where the answer is `rgb(0, 0, 255)`.
 * A fixed guess would be either wrong or slow, so the wait comes from the page's own longest
 * transition, capped so one `transition: 10s` cannot stall the capture.
 */
function settleMs(els: Element[]): number {
  let max = 0;
  for (const el of els) {
    const cs = getComputedStyle(el);
    const durations = splitList(cs.transitionDuration), delays = splitList(cs.transitionDelay);
    durations.forEach((d, i) => {
      max = Math.max(max, (parseFloat(d) || 0) + (parseFloat(delays[i % delays.length]) || 0));
    });
  }
  return Math.min(max * 1000 + 50, 1200);
}


/** One measurement of the picked subtree, taken once the page has stopped moving. */
export function snapshot(settle = 400): Promise<Snapshot> {
  return new Promise((resolve) => {
    setTimeout(() => requestAnimationFrame(() => {
      const r = pending[0].getBoundingClientRect();
      resolve({ blocks: computeBlocks(pending), root: [Math.round(r.width), Math.round(r.height)] });
    }), Math.max(settle, settleMs(pending)));
  });
}
