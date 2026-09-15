/**
 * The vocabulary every other module shares: which properties are captured, how a captured element
 * is addressed, and the two parsing helpers that everything reaches for.
 */

export const UI = "data-cp-ui";
export const TMP = "data-cp-tmp"; // element index, readable from the MAIN world and from CDP while capturing
export const MAX_ELEMENTS = 300; // ponytail: hard cap; past this the bundle stops being pasteable
export const MAX_OUT = 180_000;
export const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
export const SIZED_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME"]); // replaced elements: computed size is intrinsic, not layout
export const SIDES = ["top", "right", "bottom", "left"];
export const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
export const SVG_NS = "http://www.w3.org/2000/svg";

export const PROPS = `display position top right bottom left z-index float clear box-sizing width height
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
  animation-timeline animation-range scroll-timeline view-timeline container-type container-name
  cursor pointer-events user-select visibility object-fit object-position aspect-ratio list-style-type appearance resize clip-path
  fill stroke stroke-width`.split(/\s+/);
export const INHERITED = new Set(`color font-family font-size font-weight font-style line-height letter-spacing text-align text-transform
  white-space word-break overflow-wrap text-wrap visibility cursor list-style-type font-variant-numeric font-feature-settings text-shadow
  -webkit-text-fill-color user-select pointer-events fill stroke stroke-width`.split(/\s+/));
export const DEF_PROPS = [...PROPS, "transition-duration", "animation-name",
  ...SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]),
  ...CORNERS.map((c) => `border-${c}-radius`)];

export const STATE_RE = /:(hover|focus-visible|focus-within|focus|active|visited|checked|disabled|placeholder-shown|open)\b/;
export const PSEUDO_EL_RE = /::?(before|after|placeholder|marker|selection|first-letter|first-line|backdrop|file-selector-button)\b/;
export const sel = (i: number) => `[data-cp="${i + 1}"]`;
/** Split a CSS comma list without breaking inside cubic-bezier(…), var(…), url(…). */
export const splitList = (str: string): string[] => {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  return [...out, cur.trim()];
};
/** Read a property from either a live computed style or a captured defaults record. */
export const val = (src: CSSStyleDeclaration | Record<string, string>, p: string): string =>
  (src instanceof CSSStyleDeclaration ? src.getPropertyValue(p) : src[p]);

/** `row-gap` and `gap` are the same knob; so are `padding` and `padding-top`. */
export const sameKnob = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/^(row|column)-gap$/, "gap");
  const [x, y] = [norm(a), norm(b)];
  return x === y || x.startsWith(`${y}-`) || y.startsWith(`${x}-`);
};
