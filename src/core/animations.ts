/**
 * The motion actually running on the picked subtree.
 *
 * `element.getAnimations()` returns every live animation — CSS animations, CSS transitions, and
 * anything driven by the Web Animations API. Framer Motion's engine compiles to WAAPI, so this one
 * call covers a library we would otherwise need a bespoke reader for, and it reports the *resolved*
 * timing rather than what a stylesheet asked for. The authored `@keyframes` text stays in its own
 * section; this is what is moving right now.
 */

import { sel } from "./const";

const MAX_ANIMATIONS = 40;

/** camelCase → kebab-case, so a WAAPI keyframe reads like the CSS it came from. */
const kebab = (p: string) => p.replace(/([A-Z])/g, "-$1").toLowerCase();
const NON_STYLE = new Set(["offset", "composite", "computedOffset", "easing"]);

function timingLine(a: Animation): string {
  const t = a.effect?.getTiming();
  if (!t) return a.playState;
  const dur = typeof t.duration === "number" ? `${Math.round(t.duration)}ms` : String(t.duration);
  const iter = t.iterations === Infinity ? "infinite" : `${t.iterations ?? 1}×`;
  const delay = t.delay ? ` · delay ${Math.round(t.delay)}ms` : "";
  return `${dur} · ${t.easing} · ${iter} · ${t.direction} · ${a.playState}${delay}`;
}

function keyframeBody(a: Animation): string {
  // getKeyframes() is a KeyframeEffect method; the base AnimationEffect type does not declare it.
  const effect = a.effect as KeyframeEffect | null;
  const frames = effect?.getKeyframes?.() ?? [];
  return frames.map((f, i) => {
    const offset = f.offset ?? (frames.length > 1 ? i / (frames.length - 1) : 0);
    const decls = Object.entries(f)
      .filter(([k]) => !NON_STYLE.has(k))
      .map(([k, v]) => `${kebab(k)}: ${v};`)
      .join(" ");
    return `  ${Math.round(offset * 100)}% { ${decls} }`;
  }).join("\n");
}

function label(a: Animation): string {
  if (a instanceof CSSAnimation) return `"${a.animationName}"`;
  if (a instanceof CSSTransition) return `transition ${a.transitionProperty}`;
  return "(WAAPI)";
}

/**
 * @param named  animation-names already printed in the `## Keyframes` section — a CSS animation
 *               whose keyframes are shown there and whose timing is the plain shorthand is a
 *               duplicate, so it is skipped here.
 */
export function runningAnimations(els: Element[], named: Set<string>): string {
  const lines: string[] = [];
  let count = 0;
  for (const [i, el] of els.entries()) {
    let anims: Animation[];
    try { anims = el.getAnimations(); } catch { continue; } // throws on detached nodes in some builds
    for (const a of anims) {
      if (count >= MAX_ANIMATIONS) break;
      if (a.playState === "idle") continue;
      if (a instanceof CSSAnimation && named.has(a.animationName)) continue; // already in ## Keyframes
      count++;
      lines.push(`${sel(i)} — ${label(a)} · ${timingLine(a)}\n${keyframeBody(a)}`);
    }
  }
  return lines.length ? `## Animations (running)\n${lines.join("\n\n")}` : "";
}
