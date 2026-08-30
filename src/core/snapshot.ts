/**
 * Measuring on request: what the service worker asks for between viewport, state and theme changes.
 */

import { splitList } from "./const";
import { computeBlocks } from "./blocks";
import { state } from "./state";
import type { Snapshot, ThemeInfo } from "../shared/types";

/**
 * How long the picked subtree still needs before its styles are final.
 *
 * A forced :hover on a button with `transition: background-color .3s` reads a colour part-way
 * through the fade if measured too early — `rgb(0, 0, 251)` where the answer is `rgb(0, 0, 255)`.
 * A fixed guess would be either wrong or slow, so the wait comes from the page's own longest
 * transition, capped so one `transition: 10s` cannot stall the capture.
 */
export function settleMs(els: Element[]): number {
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
      const r = state.pending[0].getBoundingClientRect();
      resolve({
        blocks: computeBlocks(state.pending),
        root: [Math.round(r.width), Math.round(r.height)],
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      });
    }), Math.max(settle, settleMs(state.pending)));
  });
}

// ---------- themes ----------
const THEME_ATTRS = ["data-theme", "data-mode", "data-color-mode", "data-color-scheme"];

/**
 * How this page decides which theme it is in.
 *
 * Three mechanisms in the wild and they need different handling: a `.dark` class, a `data-theme`
 * attribute, or nothing at all — in which case the OS preference is what is being followed and the
 * debugger can emulate it.
 */
export function detectTheme(): ThemeInfo | null {
  const html = document.documentElement;
  for (const c of ["dark", "light"] as const) if (html.classList.contains(c)) return { kind: "class", current: c };
  for (const attr of THEME_ATTRS) {
    const v = html.getAttribute(attr);
    if (v === "dark" || v === "light") return { kind: "attr", attr, current: v };
  }
  try {
    return { kind: "media", current: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" };
  } catch {
    return null;
  }
}

/**
 * Flip the page's theme, measure, and put it back.
 *
 * Returns null when the flip did not stick: next-themes and friends re-apply the stored theme on
 * mutation, and a snapshot taken then would be the theme we already had, labelled as the other one.
 */
export async function snapshotOtherTheme(settle: number): Promise<Snapshot | null> {
  const before = detectTheme();
  if (!before || before.kind === "media") return null;
  const html = document.documentElement;
  const other = before.current === "dark" ? "light" : "dark";
  const restoreScheme = html.style.colorScheme;
  if (before.kind === "class") html.classList.replace(before.current, other);
  else html.setAttribute(before.attr!, other);
  html.style.colorScheme = other;
  try {
    const shot = await snapshot(settle);
    return detectTheme()?.current === other ? shot : null;
  } finally {
    if (before.kind === "class") html.classList.replace(other, before.current);
    else html.setAttribute(before.attr!, before.current);
    html.style.colorScheme = restoreScheme;
  }
}
