/**
 * The picked subtree as pasteable markup.
 */

import { TMP, UI } from "./const";
import { iconName } from "./icons";
import { cloneDeep, walkClone } from "./walk";

// ---------- HTML ----------
/** Icon names found in the last capture, for the header line. */
export const icons = new Set<string>();

export function htmlOf(root: Element, all: Element[], els: Element[], stamp: Set<number>, fold: Set<Element> = new Set()): string {
  icons.clear();
  const clone = cloneDeep(root);
  const clones = walkClone(clone);
  const pos = new Map(all.map((e, i) => [e, i]));
  // Repeated instances (#37) are replaced with a comment, so the HTML carries one of each.
  for (const el of fold) {
    const c = clones[pos.get(el)!];
    if (c) c.replaceWith(document.createComment(` ×N — identical to the first, see Repeated structure `));
  }
  els.forEach((el, i) => {
    const c = clones[pos.get(el)!];
    if (!c) return;
    if (stamp.has(i)) c.setAttribute("data-cp", String(i + 1));
    if (el instanceof SVGSVGElement) {
      const name = iconName(el);
      if (name) { c.setAttribute("data-icon", name); icons.add(name); }
    }
    if (el instanceof HTMLImageElement) { c.setAttribute("src", el.currentSrc || el.src); c.removeAttribute("srcset"); c.removeAttribute("sizes"); }
    else if (el instanceof HTMLAnchorElement && el.href) c.setAttribute("href", el.href);
    else if ((el instanceof HTMLVideoElement || el instanceof HTMLSourceElement) && el.src) c.setAttribute("src", el.src);
  });
  // Templates are kept: a declarative shadow root IS a template, and dropping it would empty the
  // component. Everything else that carries code or a stylesheet still goes.
  for (const n of clones) if (/^(SCRIPT|STYLE|NOSCRIPT|LINK|META)$/.test(n.tagName) || n.hasAttribute(UI)) n.remove();
  for (const c of clones) {
    c.removeAttribute(TMP);
    for (const a of [...c.attributes]) if (/^on/i.test(a.name)) c.removeAttribute(a.name);
  }
  return clone.outerHTML;
}
