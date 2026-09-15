/**
 * The small page-side steps of `export_page` (#120) that are not an extraction of their own:
 * where the page is scrolled, what it is called, how it divides into sections, and its tokens.
 */

import { pageSections } from "./page";
import { cssPath } from "./selector";
import { w3cTokenGroups } from "./tokens";

export interface ScrollInfo { y: number; height: number; viewport: number }
export interface PageInfo { url: string; title: string; origin: string; vw: number; vh: number }
export interface OutlineItem { heading: string; selector: string; elements: number }

/** Jump (not smooth-scroll) so the worker's wait measures the page's reaction, not the scroll. */
export function scrollToY(y: number): ScrollInfo {
  window.scrollTo({ top: y, behavior: "instant" });
  return { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight };
}

export const pageInfo = (): PageInfo =>
  ({ url: location.href, title: document.title, origin: location.origin, vw: innerWidth, vh: innerHeight });

/** The page's top-level sections — the same split `capture_page` and the `P` key use. */
export const outline = (): OutlineItem[] => pageSections(20).map((el) => ({
  heading: el.querySelector("h1, h2, h3")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
  selector: cssPath(el),
  elements: el.querySelectorAll("*").length,
}));

/**
 * The custom properties in effect on `<html>`, as W3C design tokens. Tailwind's `--tw-*` plumbing is
 * left out: it is machinery, not a design decision, and `styles.css` already carries it verbatim.
 */
export function pageTokens(): Record<string, Record<string, unknown>> {
  const cs = getComputedStyle(document.documentElement);
  const names = [...cs].filter((p) => p.startsWith("--") && !p.startsWith("--tw-")).sort();
  return w3cTokenGroups(names.map((n) => [n, cs.getPropertyValue(n).trim()] as const));
}
