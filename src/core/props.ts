/**
 * One element's computed style, reduced to what someone actually wrote.
 */

import { CORNERS, INHERITED, PROPS, SIDES, SIZED_TAGS, splitList, val } from "./const";

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
export function diffProps(cs: CSSStyleDeclaration, def: Record<string, string>, tagDef: Record<string, string>,
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
