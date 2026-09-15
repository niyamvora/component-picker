/**
 * A page's layout as data, so a rebuild can be checked without a screenshot (#121).
 *
 * A picture invites judging by eye; this answers in numbers — "font-size 48px, original 56px" — and
 * works the same on a localhost rebuild as on the original. Per visible element: its tag, its own
 * text, its layout box and a fixed set of resolved styles. The box comes from offset geometry, not
 * `getBoundingClientRect`, so a spinning icon or a mid-flight reveal does not read as a layout change.
 */

import { SKIP_TAGS, UI } from "../shared/const";
import { cssPath } from "../shared/selector";

export const FINGERPRINT_PROPS = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color",
  "background-color", "background-image", "border-radius", "border-width", "padding", "gap", "display", "grid-template-columns", "opacity",
  // Shades and motion (#125): what a page looks like at rest includes its shadows, filters and transforms,
  // and how it will move is declared here even when nothing is moving.
  "box-shadow", "text-shadow", "transform", "filter", "backdrop-filter", "border-color", "outline", "cursor",
  "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
  "animation-name", "animation-duration", "animation-timing-function", "animation-iteration-count"];

const TRANSFORM_PARTS = new Set(["transform", "translate", "rotate", "scale"]);

/**
 * Properties an animation or transition is driving on this element right now. They have no single
 * value — a marquee item read at opacity 0.138 is one frame of a loop — so the fingerprint leaves
 * them out and lists them; the animation itself is still compared through `animation-*` and styles.css.
 */
export function animatedProps(el: Element): Set<string> {
  const out = new Set<string>();
  let animations: Animation[] = [];
  try { animations = el.getAnimations(); } catch { return out; }
  for (const a of animations) {
    if (a.playState !== "running" && a.playState !== "paused") continue;
    if (typeof CSSTransition !== "undefined" && a instanceof CSSTransition) { out.add(a.transitionProperty); continue; }
    for (const frame of (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? []) {
      for (const k of Object.keys(frame)) {
        if (!["offset", "computedOffset", "easing", "composite"].includes(k)) out.add(k.replace(/([A-Z])/g, "-$1").toLowerCase());
      }
    }
  }
  if ([...out].some((p) => TRANSFORM_PARTS.has(p))) out.add("transform");
  if ([...out].some((p) => p.startsWith("border") && p.endsWith("color"))) out.add("border-color");
  if ([...out].some((p) => p.startsWith("outline"))) out.add("outline");
  return out;
}
const MAX_NODES = 5000;
const MAX_MESSAGES = 200;

export interface FingerprintNode {
  path: string;
  /** Ancestor tags, `main>section>h2`: the fallback key when an element has no text of its own. */
  tags: string;
  text: string;
  /** x, y, width, height in document CSS px, transforms ignored. */
  box: [number, number, number, number];
  style: Record<string, string>;
  /** Properties an animation was driving when the fingerprint was taken, left out of `style`. */
  animated?: string[];
}
export interface Fingerprint { url: string; width: number; height: number; nodes: FingerprintNode[] }
export interface Mismatch { area: number; message: string }
export interface Comparison { matched: number; missing: number; extra: number; mismatches: Mismatch[] }

const ownText = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE)
  .map((n) => n.textContent ?? "").join(" ").replace(/\s+/g, " ").trim().slice(0, 80);

/** The layout box without transforms: offset geometry for HTML, the client rect for SVG. */
function layoutBox(el: Element): [number, number, number, number] {
  if (el instanceof HTMLElement) {
    let x = 0, y = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop; }
    return [x, y, el.offsetWidth, el.offsetHeight];
  }
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + scrollX), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)];
}

const backgroundKind = (v: string) => v === "none" ? "none" : /gradient\(/.test(v) ? "gradient" : /url\(/.test(v) ? "image" : v;

export function fingerprint(root: Element = document.body): Fingerprint {
  const nodes: FingerprintNode[] = [];
  const visit = (el: Element, tags: string) => {
    if (nodes.length >= MAX_NODES || SKIP_TAGS.has(el.tagName.toUpperCase()) || el.hasAttribute(UI)) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return;
    const tag = el.tagName.toLowerCase();
    const path = tags ? `${tags}>${tag}` : tag;
    const box = layoutBox(el);
    if (box[2] > 0 && box[3] > 0 && cs.visibility !== "hidden") {
      const style: Record<string, string> = {};
      const animated = animatedProps(el);
      for (const p of FINGERPRINT_PROPS) {
        if (!animated.has(p)) style[p] = p === "background-image" ? backgroundKind(cs.getPropertyValue(p)) : cs.getPropertyValue(p);
      }
      nodes.push({ path: cssPath(el), tags: path, text: ownText(el), box, style, ...(animated.size ? { animated: [...animated] } : {}) });
    }
    // An SVG's internals are drawing, not layout.
    if (tag !== "svg") for (const child of el.children) visit(child, path);
  };
  visit(root, "");
  return { url: location.href, width: innerWidth, height: innerHeight, nodes };
}

const label = (n: FingerprintNode) => `${n.tags.split(">").pop()}${n.text ? ` "${n.text.slice(0, 40)}"` : ""} (${n.path})`;

/**
 * Align a rebuild's fingerprint with the original's and report what differs, largest first.
 *
 * Elements pair up, strongest key first:
 *   1. the same tag, own text and layout box — the same thing in the same place, whatever its
 *      selector says. resend.com has an invisible extra <section> early in the live page, so every
 *      later section's nth-of-type path is one higher in the original than in its own export;
 *   2. the same selector path and tag (a rebuild that kept the structure but moved things);
 *   3. tag and own text, in document order;
 *   4. ancestor tag path and occurrence — last, because one missing element shifts every later
 *      pairing by one.
 * A box within `tolerance` px counts as the same.
 */
export function compareFingerprints(original: Fingerprint, rebuild: Fingerprint, tolerance = 2): Comparison {
  const tag = (n: FingerprintNode) => n.tags.split(">").pop();
  const boxKey = (n: FingerprintNode) => `${tag(n)}|${n.text}|${n.box.join(",")}`;
  const byBox = new Map<string, FingerprintNode[]>();
  const byPath = new Map<string, FingerprintNode>();
  const byText = new Map<string, FingerprintNode[]>();
  const byTags = new Map<string, FingerprintNode[]>();
  const push = (map: Map<string, FingerprintNode[]>, key: string, n: FingerprintNode) => map.set(key, [...(map.get(key) ?? []), n]);
  for (const n of rebuild.nodes) {
    push(byBox, boxKey(n), n);
    byPath.set(`${tag(n)}|${n.path}`, n);
    if (n.text) push(byText, `${tag(n)}|${n.text}`, n);
    else push(byTags, n.tags, n);
  }
  const used = new Set<FingerprintNode>();
  const take = (list?: FingerprintNode[]) => {
    while (list?.length) { const n = list.shift()!; if (!used.has(n)) return n; }
    return undefined;
  };
  // Text is identity: an element with text that finds no text match is missing, not paired with
  // whatever element happens to share its tag path.
  // Box matches are claimed for the whole page before any weaker key runs. Done greedily in document
  // order, an earlier element with no box match would take a later element's box partner by path.
  const inPlace = new Map<FingerprintNode, FingerprintNode>();
  for (const o of original.nodes) {
    const r = take(byBox.get(boxKey(o)));
    if (r) { used.add(r); inPlace.set(o, r); }
  }
  const partner = (o: FingerprintNode) => {
    const placed = inPlace.get(o);
    if (placed) return placed;
    const same = byPath.get(`${tag(o)}|${o.path}`);
    if (same && !used.has(same) && same.text === o.text) return same;
    return o.text ? take(byText.get(`${tag(o)}|${o.text}`)) : take(byTags.get(o.tags));
  };

  const mismatches: Mismatch[] = [];
  let matched = 0, missing = 0;
  for (const o of original.nodes) {
    const area = o.box[2] * o.box[3];
    const r = partner(o);
    if (!r) {
      missing++;
      mismatches.push({ area, message: `Missing: ${label(o)}` });
      continue;
    }
    used.add(r);
    matched++;
    if (o.box.some((v, i) => Math.abs(v - r.box[i]) > tolerance)) {
      mismatches.push({ area, message: `${label(o)}: box ${r.box[2]}×${r.box[3]} at (${r.box[0]}, ${r.box[1]}), original ${o.box[2]}×${o.box[3]} at (${o.box[0]}, ${o.box[1]})` });
    }
    for (const p of FINGERPRINT_PROPS) {
      // Absent on either side: animated at that moment, or a fingerprint older than the property.
      if (!(p in o.style) || !(p in r.style)) continue;
      if (o.style[p] !== r.style[p]) mismatches.push({ area, message: `${label(o)}: ${p}: ${r.style[p]}, original ${o.style[p]}` });
    }
  }
  mismatches.sort((a, b) => b.area - a.area);
  return { matched, missing, extra: rebuild.nodes.length - used.size, mismatches: mismatches.slice(0, MAX_MESSAGES) };
}
