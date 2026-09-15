/**
 * A page's layout as data, so a rebuild can be checked without a screenshot (#121).
 *
 * A picture invites judging by eye; this answers in numbers — "font-size 48px, original 56px" — and
 * works the same on a localhost rebuild as on the original. Per visible element: its tag, its own
 * text, its layout box and a fixed set of resolved styles. The box comes from offset geometry, not
 * `getBoundingClientRect`, so a spinning icon or a mid-flight reveal does not read as a layout change.
 */

import { SKIP_TAGS, UI } from "./const";
import { cssPath } from "./selector";

export const FINGERPRINT_PROPS = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color",
  "background-color", "background-image", "border-radius", "border-width", "padding", "gap", "display", "grid-template-columns", "opacity"];
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
      for (const p of FINGERPRINT_PROPS) style[p] = p === "background-image" ? backgroundKind(cs.getPropertyValue(p)) : cs.getPropertyValue(p);
      nodes.push({ path: cssPath(el), tags: path, text: ownText(el), box, style });
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
 * Elements pair up by tag and own text, in document order; elements without text pair by their
 * ancestor tag path and occurrence. A box within `tolerance` px counts as the same.
 */
export function compareFingerprints(original: Fingerprint, rebuild: Fingerprint, tolerance = 2): Comparison {
  const queues = new Map<string, FingerprintNode[]>();
  const keyOf = (n: FingerprintNode, seen: Map<string, number>) => {
    if (n.text) return `t|${n.tags.split(">").pop()}|${n.text}`;
    const k = `p|${n.tags}`;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    return `${k}|${i}`;
  };
  const rebuildSeen = new Map<string, number>();
  for (const n of rebuild.nodes) {
    const k = keyOf(n, rebuildSeen);
    queues.set(k, [...(queues.get(k) ?? []), n]);
  }

  const mismatches: Mismatch[] = [];
  const used = new Set<FingerprintNode>();
  let matched = 0, missing = 0;
  const originalSeen = new Map<string, number>();
  for (const o of original.nodes) {
    const area = o.box[2] * o.box[3];
    const r = queues.get(keyOf(o, originalSeen))?.shift();
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
      if (o.style[p] !== r.style[p]) mismatches.push({ area, message: `${label(o)}: ${p}: ${r.style[p]}, original ${o.style[p]}` });
    }
  }
  mismatches.sort((a, b) => b.area - a.area);
  return { matched, missing, extra: rebuild.nodes.length - used.size, mismatches: mismatches.slice(0, MAX_MESSAGES) };
}
