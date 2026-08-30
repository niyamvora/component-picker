/**
 * What the browser would do on its own: the baseline every captured value is diffed against.
 */

import { DEF_PROPS, SVG_NS, UI } from "./const";

// ---------- browser default styles per tag (fresh about:blank iframe) ----------
const defaults: Record<string, Record<string, string>> = {};
let frame: HTMLIFrameElement | undefined;
export function defaultsFor(el: Element): Record<string, string> {
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

/**
 * The element an inherited property comes from.
 *
 * A shadow root's children have no `parentElement` — their parent is the root itself — but
 * inherited properties do cross the boundary from the host, so that is what they are diffed
 * against. Without this, measuring inside a web component throws.
 */
export const styleParent = (el: Element): Element | null =>
  el.parentElement ?? (el.parentNode instanceof ShadowRoot ? el.parentNode.host : null);

export const DIV_DEF = () => defaultsFor(document.createElement("div"));
export const SPAN_DEF = () => defaultsFor(document.createElement("span"));
