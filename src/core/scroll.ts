/**
 * Why a captured element is invisible.
 *
 * A hero that fades in on scroll captures as `opacity: 0` — the bundle describes an invisible box
 * and the rebuild looks broken. This is the single most confusing wrong output the tool can
 * produce, so it is reported explicitly: both the resting state and the revealed one, never one
 * silently swapped for the other.
 */

import { sel } from "./const";
import type { MotionInfo } from "../shared/types";

/** Native scroll-driven animation, read straight off the computed style. */
function scrollTimeline(cs: CSSStyleDeclaration): string | null {
  const tl = cs.getPropertyValue("animation-timeline").trim();
  const st = cs.getPropertyValue("scroll-timeline").trim();
  const vt = cs.getPropertyValue("view-timeline").trim();
  if (tl && tl !== "auto" && tl !== "none") {
    const range = cs.getPropertyValue("animation-range").trim();
    return `animation-timeline: ${tl};${range && range !== "normal" ? ` animation-range: ${range};` : ""}`;
  }
  if (st && st !== "none") return `scroll-timeline: ${st};`;
  if (vt && vt !== "none") return `view-timeline: ${vt};`;
  return null;
}

/**
 * A reveal-on-scroll pattern: the element is hidden at rest and a class flips it visible.
 *
 * Detected structurally — an element hidden by `opacity: 0` or an off-screen transform that has a
 * stylesheet rule differing from its own selector by exactly one extra class. That extra class is
 * the "visible" state a script toggles, and the rule it carries is what the element becomes.
 */
function revealClass(el: Element, sheetRules: { selectorText: string; cssText: string }[]): string | null {
  const cs = getComputedStyle(el);
  const hidden = parseFloat(cs.opacity) === 0 || (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)");
  if (!hidden) return null;
  const classes = [...el.classList];
  for (const r of sheetRules) {
    // e.g. `.reveal.is-visible` when the element is `.reveal`
    const m = r.selectorText.match(/\.([\w-]+)$/);
    if (!m) continue;
    const extra = m[1];
    if (el.classList.contains(extra)) continue;
    const base = r.selectorText.slice(0, -extra.length - 1);
    if (classes.some((c) => base.endsWith(`.${c}`))) {
      const body = r.cssText.slice(r.cssText.indexOf("{") + 1, r.cssText.lastIndexOf("}")).trim();
      return `revealed by adding \`.${extra}\` → { ${body} }`;
    }
  }
  return null;
}

/**
 * A Framer Motion reveal, named (#108).
 *
 * `whileInView` is the single most common reason a captured hero reads `opacity: 0`, and the props
 * are already on the fiber — `initial` is literally the resting style the capture recorded, and
 * `whileInView` is what it becomes. Saying so turns a confusing capture into an instruction.
 */
function motionReveal(id: number, motion: MotionInfo[], hidden: boolean): string | null {
  const m = motion.find((x) => x.id === id);
  if (!m) return null;
  const inView = m.props.whileInView ?? m.props.animate;
  if (!m.props.initial || !inView) return null;
  // This section answers "why is this invisible". `whileInView` is scroll behaviour by definition,
  // but a plain mount `animate` on an element that is already visible has finished and explains
  // nothing — reporting it would add a puzzling section to every Framer Motion capture.
  if (!m.props.whileInView && !hidden) return null;
  const once = m.props.viewport ? ` · viewport ${m.props.viewport}` : "";
  const how = m.props.whileInView ? "whileInView (Framer Motion, fires when scrolled into view)" : "animate (Framer Motion, fires on mount)";
  return `${how} — initial ${m.props.initial} → ${inView}${once}` +
    `${m.props.transition ? ` · transition ${m.props.transition}` : ""}`;
}

export function scrollBehaviour(els: Element[], sheetRules: { selectorText: string; cssText: string }[], motion: MotionInfo[] = []): string {
  const lines: string[] = [];
  for (const [i, el] of els.entries()) {
    const cs = getComputedStyle(el);
    const resting = `opacity: ${cs.opacity}${cs.transform !== "none" ? `; transform: ${cs.transform}` : ""}`;
    const hidden = parseFloat(cs.opacity) === 0 || (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)");
    const native = scrollTimeline(cs);
    if (native) { lines.push(`${sel(i)} — ${native}`); continue; }
    // Named library first: it explains the same symptom the class heuristic guesses at, but exactly.
    const fm = motionReveal(i, motion, hidden);
    if (fm) { lines.push(`${sel(i)} — ${hidden ? `hidden at rest (${resting}), ` : ""}revealed by ${fm}`); continue; }
    const reveal = revealClass(el, sheetRules);
    if (reveal) {
      lines.push(`${sel(i)} — hidden at rest (${resting}), ${reveal}`);
      continue;
    }
    // Webflow's interaction engine hides with data-w-id + opacity:0; the Platform section has detail.
    if (el.hasAttribute("data-w-id") && parseFloat(cs.opacity) === 0) {
      lines.push(`${sel(i)} — hidden at rest by a Webflow IX2 interaction (see the Platform section).`);
    }
  }
  return lines.length
    ? `## Scroll behaviour\n${lines.join("\n")}\n` +
      `_These elements are captured in their hidden resting state, which is what the page actually renders before the reveal. Rebuild with both states; do not treat the resting values as the final design. To watch a reveal run, use capture_interaction with the \`scroll\` action._`
    : "";
}
