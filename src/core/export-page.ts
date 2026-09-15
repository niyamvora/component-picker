/**
 * The small page-side steps of `export_page` (#120) that are not an extraction of their own:
 * where the page is scrolled, what it is called, how it divides into sections, and its tokens.
 */

import { codelessReason } from "./codeless";
import { pageSections } from "./page";
import { cssPath } from "./selector";
import { w3cTokenGroups } from "./tokens";

export interface ScrollInfo { y: number; height: number; viewport: number }
export interface PageInfo { url: string; title: string; origin: string; vw: number; vh: number }
export interface OutlineItem { heading: string; selector: string; elements: number }
export interface CodelessRegion { selector: string; reason: string; box: [number, number, number, number] }

/** Visible regions with no code to export (#122), with their document-space boxes for a fallback screenshot. */
export const codeless = (): CodelessRegion[] => [...document.querySelectorAll("canvas, iframe")]
  .map((el) => ({ el, reason: codelessReason(el) }))
  .filter((c): c is { el: Element; reason: string } => !!c.reason)
  .map(({ el, reason }) => {
    const r = el.getBoundingClientRect();
    return { selector: cssPath(el), reason, box: [Math.round(r.x + scrollX), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] as [number, number, number, number] };
  })
  .filter((c) => c.box[2] > 0 && c.box[3] > 0);

/** Jump (not smooth-scroll) so the worker's wait measures the page's reaction, not the scroll. */
export function scrollToY(y: number): ScrollInfo {
  window.scrollTo({ top: y, behavior: "instant" });
  return { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight };
}

export const pageInfo = (): PageInfo =>
  ({ url: location.href, title: document.title, origin: location.origin, vw: innerWidth, vh: innerHeight });

/**
 * The page's top-level sections — the same split `capture_page` and the `P` key use. A child with
 * neither a heading nor anything inside it (a lone image, an empty spacer) is not a section worth
 * naming; on a page with no section structure every such child would otherwise fill the outline.
 */
export const outline = (root?: Element): OutlineItem[] => pageSections(20, root).map((el) => ({
  // innerText, not textContent: a <br> in "Email for<br>developers" is a space to a reader.
  heading: el.querySelector<HTMLElement>("h1, h2, h3")?.innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
  selector: cssPath(el),
  elements: el.querySelectorAll("*").length,
})).filter((o) => o.heading || o.elements > 0);

/**
 * The custom properties in effect on `<html>`, as W3C design tokens. Tailwind's `--tw-*` plumbing is
 * left out: it is machinery, not a design decision, and `styles.css` already carries it verbatim.
 */
export function pageTokens(): Record<string, Record<string, unknown>> {
  const cs = getComputedStyle(document.documentElement);
  const names = [...cs].filter((p) => p.startsWith("--") && !p.startsWith("--tw-")).sort();
  return w3cTokenGroups(names.map((n) => [n, cs.getPropertyValue(n).trim()] as const));
}
