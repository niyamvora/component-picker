/**
 * Motion that no animation object describes (#117).
 *
 * `getAnimations()` covers CSS animations, transitions and the Web Animations API. A script that
 * writes `element.style` from `requestAnimationFrame` or a timer is invisible to it — resend.com's
 * API log panel receives about 1,300 inline opacity/transform writes during one scroll, and new rows
 * are prepended on a timer, and none of that reaches a capture.
 *
 * So this records the writes themselves. A `MutationObserver` sees every change to `style` and
 * `class` and every inserted element; it reads only the inline style it was told changed, never
 * `getComputedStyle`, which would force a style recalculation on every frame and perturb the very
 * animation being measured. What comes out is shaped for a rebuild: a loop period, keyframes, and
 * "every 500ms, prepend this row" — plus the animations `getAnimations()` does see, so the export
 * has one motion file.
 */

import { UI } from "../shared/const";
import { animationLabel, keyframeBody, timingLine } from "./animations";
import { cssPath } from "../shared/selector";

const MAX_TRACKS = 200;
const MAX_SAMPLES = 400;
const MAX_ANIMATIONS = 60;

export interface Track { selector: string; property: string; samples: [number, string][]; period?: number; keyframes?: string }
export interface Stream { selector: string; count: number; every: number; position: "prepend" | "append" | "insert"; template: string }
export interface SeenAnimation { name: string; timing: string; keyframes: string; selectors: string[] }
export interface MotionRecording { durationMs: number; tracks: Track[]; streams: Stream[]; animations: SeenAnimation[] }

interface Session {
  t0: number;
  root: Element;
  observer: MutationObserver;
  last: Map<Element, Map<string, string>>;
  tracks: Map<Element, Map<string, [number, string][]>>;
  adds: Map<Element, { t: number; position: Stream["position"]; html: string }[]>;
}
let session: Session | null = null;

const styleMap = (style: CSSStyleDeclaration | undefined) => {
  const m = new Map<string, string>();
  if (style) for (let i = 0; i < style.length; i++) m.set(style.item(i), style.getPropertyValue(style.item(i)));
  return m;
};

function handle(s: Session, records: MutationRecord[]) {
  const t = Math.round(performance.now() - s.t0);
  const scratch = document.createElement("div");
  for (const m of records) {
    const target = m.target as Element;
    if (target.nodeType !== 1 || target.closest(`[${UI}]`)) continue;
    if (m.type === "childList") {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element) || n.closest(`[${UI}]`)) continue;
        const position = target.firstElementChild === n ? "prepend" : target.lastElementChild === n ? "append" : "insert";
        const list = s.adds.get(target) ?? [];
        list.push({ t, position, html: n.outerHTML.slice(0, 2000) });
        s.adds.set(target, list);
      }
      continue;
    }
    // The first write to an element is measured against what it held before, from `oldValue`.
    let prev = s.last.get(target);
    if (!prev) {
      scratch.style.cssText = m.attributeName === "style" ? m.oldValue ?? "" : target.getAttribute("style") ?? "";
      prev = styleMap(scratch.style);
      prev.set("class", m.attributeName === "class" ? m.oldValue ?? "" : target.getAttribute("class") ?? "");
    }
    const next = styleMap((target as HTMLElement).style);
    next.set("class", target.getAttribute("class") ?? "");
    const tracks = s.tracks.get(target) ?? new Map<string, [number, string][]>();
    for (const property of new Set([...prev.keys(), ...next.keys()])) {
      const [was, now] = [prev.get(property) ?? "", next.get(property) ?? ""];
      if (was === now) continue;
      const samples = tracks.get(property) ?? [[t, was] as [number, string]];
      if (samples.length < MAX_SAMPLES) samples.push([t, now]);
      tracks.set(property, samples);
    }
    s.tracks.set(target, tracks);
    s.last.set(target, next);
  }
}

export function startMotion(root: Element = document.body): void {
  stopMotion();
  const s: Session = { t0: performance.now(), root, observer: null!, last: new Map(), tracks: new Map(), adds: new Map() };
  s.observer = new MutationObserver((records) => handle(s, records));
  s.observer.observe(root, { attributes: true, attributeFilter: ["style", "class"], attributeOldValue: true, childList: true, subtree: true });
  session = s;
}

const numbers = (v: string) => (v.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);

/**
 * How long one cycle takes: the mean gap between returns to the starting value. With two or more
 * returns only the gaps between returns count, because recording starts part-way through a cycle.
 */
export function periodOf(samples: [number, string][]): number | undefined {
  if (samples.length < 4) return undefined;
  const first = numbers(samples[0][1]);
  if (!first.length) return undefined;
  const near = (v: number[]) => v.length === first.length && v.every((x, i) => Math.abs(x - first[i]) <= Math.max(0.05, Math.abs(first[i]) * 0.05));
  const returns: number[] = [];
  let away = false;
  for (const [t, v] of samples.slice(1)) {
    if (!near(numbers(v))) away = true;
    else if (away) { returns.push(t); away = false; }
  }
  if (!returns.length) return undefined;
  const times = returns.length >= 2 ? returns : [samples[0][0], ...returns];
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/**
 * Five evenly spaced keyframes over one cycle (or the whole track when it does not loop).
 * ponytail: five-point sampling; an easing curve between the points is not recovered.
 */
function keyframesOf(property: string, samples: [number, string][], period?: number): string | undefined {
  if (property === "class" || samples.length < 2) return undefined;
  const start = samples[0][0];
  const span = period ?? samples[samples.length - 1][0] - start;
  if (span <= 0) return undefined;
  const at = (target: number) => samples.reduce((best, s) => Math.abs(s[0] - target) < Math.abs(best[0] - target) ? s : best)[1];
  const frames = [0, 25, 50, 75, 100].map((pct) => `  ${pct}% { ${property}: ${at(start + (span * pct) / 100)}; }`);
  return `/* ${span}ms${period ? " · infinite" : ""} */\n${frames.join("\n")}`;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export function stopMotion(): MotionRecording | null {
  const s = session;
  if (!s) return null;
  handle(s, s.observer.takeRecords());
  s.observer.disconnect();
  session = null;

  const tracks: Track[] = [];
  for (const [el, byProp] of s.tracks) {
    for (const [property, samples] of byProp) {
      const period = periodOf(samples);
      const keyframes = keyframesOf(property, samples, period);
      tracks.push({ selector: cssPath(el), property, samples, ...(period ? { period } : {}), ...(keyframes ? { keyframes } : {}) });
    }
  }
  tracks.sort((a, b) => b.samples.length - a.samples.length);

  const streams: Stream[] = [];
  for (const [parent, adds] of s.adds) {
    if (adds.length < 2) continue;
    const positions = adds.map((a) => a.position);
    const position = (["prepend", "append", "insert"] as const).reduce((a, b) => positions.filter((p) => p === b).length > positions.filter((p) => p === a).length ? b : a);
    streams.push({ selector: cssPath(parent), count: adds.length, every: median(adds.slice(1).map((a, i) => a.t - adds[i].t)), position, template: adds[0].html });
  }

  const groups = new Map<string, SeenAnimation>();
  for (const a of document.getAnimations()) {
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (!target || !s.root.contains(target) || target.closest(`[${UI}]`) || a.playState === "idle") continue;
    const seen = { name: animationLabel(a), timing: timingLine(a), keyframes: keyframeBody(a) };
    const key = `${seen.name}|${seen.timing}|${seen.keyframes}`;
    const group = groups.get(key) ?? { ...seen, selectors: [] };
    if (group.selectors.length < 8) group.selectors.push(cssPath(target));
    groups.set(key, group);
  }

  return {
    durationMs: Math.round(performance.now() - s.t0),
    tracks: tracks.slice(0, MAX_TRACKS),
    streams,
    animations: [...groups.values()].slice(0, MAX_ANIMATIONS),
  };
}
