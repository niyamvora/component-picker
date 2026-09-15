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
 * Elements pair up, strongest key first: the same selector path and tag (an export, or a rebuild
 * that kept the structure, has the element at the same place); then tag and own text, in document
 * order; then ancestor tag path and occurrence. Occurrence is last because it is fragile — one
 * missing element shifts every later pairing by one, which on resend.com turned ten missing nodes
 * into hundreds of reports comparing a grid with an unrelated block. A box within `tolerance` px
 * counts as the same.
 */
export function compareFingerprints(original: Fingerprint, rebuild: Fingerprint, tolerance = 2): Comparison {
  const tag = (n: FingerprintNode) => n.tags.split(">").pop();
  const byPath = new Map<string, FingerprintNode>();
  const byText = new Map<string, FingerprintNode[]>();
  const byTags = new Map<string, FingerprintNode[]>();
  const push = (map: Map<string, FingerprintNode[]>, key: string, n: FingerprintNode) => map.set(key, [...(map.get(key) ?? []), n]);
  for (const n of rebuild.nodes) {
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
  const partner = (o: FingerprintNode) => {
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
      if (o.style[p] !== r.style[p]) mismatches.push({ area, message: `${label(o)}: ${p}: ${r.style[p]}, original ${o.style[p]}` });
    }
  }
  mismatches.sort((a, b) => b.area - a.area);
  return { matched, missing, extra: rebuild.nodes.length - used.size, mismatches: mismatches.slice(0, MAX_MESSAGES) };
}
