/**
 * How every interactive element answers the pointer and the keyboard (#125).
 *
 * Hover lifts, shadows that deepen, focus rings, a button that gives under a press: these
 * micro-interactions are much of what makes a page feel like itself, and a resting-state capture
 * has none of them. The CSS that drives them is already in styles.css; this records them as
 * behaviour — what each element's subtree looks like before and after, how long the transition
 * takes, and whether a script rather than CSS did it — so an agent can build them and
 * verify_rebuild can check them.
 *
 * The page side finds targets, snapshots and diffs. The pointer itself comes from the service
 * worker through the debugger: a synthetic mouseover never applies `:hover`.
 */

import { SKIP_TAGS, splitList, UI } from "../shared/const";
import { cssPath } from "../shared/selector";
import { animatedProps } from "./fingerprint";
import { atRest } from "./used-css";

export type InteractionAction = "hover" | "focus" | "press";
export interface InteractionTarget { index: number; mark: string; selector: string; label: string; actions: InteractionAction[] }
/** One property that changed. `at` is relative to the target: "" for itself, `> span:nth-of-type(2)` for a descendant, plus any `::before`. */
export interface StyleChange { at: string; property: string; from: string; to: string }
export interface Timing { at: string; property: string; duration: string; easing: string; delay: string }
export interface InteractionRecord {
  selector: string;
  label: string;
  action: InteractionAction;
  changes: StyleChange[];
  /** The transitions that carry those changes, as declared at rest. */
  timing: Timing[];
  /** Attributes a script wrote during the interaction — `style`, `class`, `data-popup-open` — which no static export carries. */
  script: StyleChange[];
}
export interface InteractionDiff { message: string; script: boolean }

export const INTERACTION_PROPS = ["color", "background-color", "background-image", "background-position", "background-size",
  "border-color", "border-width", "border-radius", "box-shadow", "text-shadow", "outline-color", "outline-style", "outline-width",
  "outline-offset", "opacity", "visibility", "transform", "translate", "scale", "rotate", "filter", "backdrop-filter", "clip-path",
  "text-decoration-line", "text-decoration-color", "text-underline-offset", "letter-spacing", "font-weight", "width", "height",
  "padding", "margin", "gap", "fill", "stroke", "animation-play-state", "cursor"];

const MARK = "data-cp-interact";
const MAX_TARGETS = 150;
/** Forty identical nav links behave identically; two of each show the behaviour and keep the sweep short. */
const PER_SIGNATURE = 2;
const MAX_WATCHED = 60;
const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="option"], [tabindex]:not([tabindex="-1"])';
const STATES: [InteractionAction, RegExp][] = [["hover", /:hover\b/], ["focus", /:focus(?:-visible|-within)?\b/], ["press", /:active\b/]];

interface Active {
  index: number;
  watched: Element[];
  before: Map<string, Record<string, string>>;
  /** Properties an animation drives on each watched element — a spinner's transform is not a hover effect. */
  animated: Map<string, Set<string>>;
  /** Properties that changed between two resting reads, by snapshot key: they change on their own. */
  unstable: Map<string, Set<string>>;
  timing: Timing[];
  observer: MutationObserver;
  writes: StyleChange[];
}

let targets: Element[] = [];
let active: Active | null = null;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

const labelOf = (el: Element) =>
  (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.querySelector("img")?.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 40);

/** Where `el` sits under `target`, as a chain that survives a rebuild keeping the component's own structure. */
function rel(target: Element, el: Element): string {
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== target; n = n.parentElement) {
    const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n!.tagName) : [];
    const tag = n.tagName.toLowerCase();
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
  }
  return parts.length ? `> ${parts.join(" > ")}` : "";
}

/**
 * The elements each kind of state rule styles. Hovering one of them hovers every ancestor too, so a
 * rule reached through an ancestor (`.card:hover .title`, Tailwind's `group-hover:`) still applies.
 * ponytail: a rule on a sibling (`.a:hover + .b`) is only seen if `.a` is itself a target.
 */
function styledByState(root: Element): Map<Element, Set<InteractionAction>> {
  const bases = new Map<string, Set<InteractionAction>>();
  const visit = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        for (const part of splitList(r.selectorText)) {
          const actions = STATES.filter(([, re]) => re.test(part)).map(([a]) => a);
          if (!actions.length) continue;
          const base = atRest(part);
          if (!base || base === "*" || /^(html|body|:root)$/i.test(base)) continue;
          const set = bases.get(base) ?? new Set<InteractionAction>();
          for (const a of actions) set.add(a);
          bases.set(base, set);
        }
      } else if ("cssRules" in r) visit((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of document.styleSheets) { try { visit(s.cssRules); } catch { /* cross-origin */ } }
  const out = new Map<Element, Set<InteractionAction>>();
  for (const [base, actions] of bases) {
    let hits: Element[];
    try { hits = [...root.querySelectorAll(base)].slice(0, 200); } catch { continue; }
    for (const el of hits) {
      const set = out.get(el) ?? new Set<InteractionAction>();
      for (const a of actions) set.add(a);
      out.set(el, set);
    }
  }
  return out;
}

/** Every element worth interacting with, marked so the worker can find it. */
export function discoverInteractive(root: Element = document.body): InteractionTarget[] {
  clearInteractive();
  const actionsOf = new Map<Element, Set<InteractionAction>>();
  const add = (el: Element, actions: Iterable<InteractionAction>) => {
    const set = actionsOf.get(el) ?? new Set<InteractionAction>();
    for (const a of actions) set.add(a);
    actionsOf.set(el, set);
  };
  for (const [el, actions] of styledByState(root)) add(el.closest(INTERACTIVE) ?? el, actions);
  // A control no rule names can still answer the pointer — through a transition, or a script
  // (Framer Motion's whileHover) — and it announces that with a pointer cursor.
  for (const el of root.querySelectorAll(INTERACTIVE)) {
    const cs = getComputedStyle(el);
    if (cs.cursor === "pointer" || splitList(cs.transitionDuration).some((d) => parseFloat(d) > 0)) add(el, ["hover"]);
  }
  const ordered = [...actionsOf.keys()].filter((el) => !el.closest(`[${UI}]`) && visible(el))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const perSignature = new Map<string, number>();
  const out: InteractionTarget[] = [];
  for (const el of ordered) {
    if (out.length >= MAX_TARGETS) break;
    const actions = (["hover", "focus", "press"] as const).filter((a) => actionsOf.get(el)!.has(a));
    const signature = `${el.tagName}|${el.getAttribute("class") ?? ""}|${actions.join()}`;
    const seen = perSignature.get(signature) ?? 0;
    if (seen >= PER_SIGNATURE) continue;
    perSignature.set(signature, seen + 1);
    const index = targets.push(el) - 1;
    el.setAttribute(MARK, String(index));
    out.push({ index, mark: `[${MARK}="${index}"]`, selector: cssPath(el), label: labelOf(el), actions });
  }
  return out;
}

/** A point over the element that the pointer can actually reach — a sticky header can cover its centre. */
function reachable(el: Element): { x: number; y: number } | null {
  const r = el.getBoundingClientRect();
  for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
    const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit))) return { x, y };
  }
  return null;
}

function snapshot(target: Element, watched: Element[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  const read = (cs: CSSStyleDeclaration) => Object.fromEntries(INTERACTION_PROPS.map((p) => [p, cs.getPropertyValue(p)]));
  for (const el of watched) {
    if (!el.isConnected) continue;
    const at = rel(target, el);
    out.set(at, read(getComputedStyle(el)));
    for (const pseudo of ["::before", "::after"] as const) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content !== "none" && cs.content !== "normal") out.set(`${at}${pseudo}`, read(cs));
    }
  }
  return out;
}

function timingOf(target: Element, watched: Element[]): Timing[] {
  const out: Timing[] = [];
  for (const el of watched) {
    for (const pseudo of ["", "::before", "::after"] as const) {
      const cs = getComputedStyle(el, pseudo || null);
      const durations = splitList(cs.transitionDuration);
      if (!durations.some((d) => parseFloat(d) > 0)) continue;
      const easings = splitList(cs.transitionTimingFunction), delays = splitList(cs.transitionDelay);
      splitList(cs.transitionProperty).forEach((property, i) => out.push({
        at: `${rel(target, el)}${pseudo}`, property,
        duration: durations[i % durations.length], easing: easings[i % easings.length], delay: delays[i % delays.length],
      }));
    }
  }
  return out;
}

/** Snapshot the resting state and start watching for script writes; returns where to put the pointer. */
export function beginInteraction(index: number, action: InteractionAction): { x: number; y: number } {
  cancelInteraction();
  const el = targets[index];
  if (!el?.isConnected) throw new Error(`target ${index} is no longer on the page`);
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const point = reachable(el);
  if (!point && action !== "focus") throw new Error("another element covers it, so the pointer cannot reach it");
  const watched = [el, ...el.querySelectorAll("*")].filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase())).slice(0, MAX_WATCHED);
  const writes: StyleChange[] = [];
  // Every attribute, not just style and class: a hover that opens a menu shows up as the script
  // setting `data-popup-open` or `aria-expanded`, and CSS keyed on that is not reproducible by CSS alone.
  const observer = new MutationObserver((records) => { for (const m of records) noteWrite(el, writes, m); });
  observer.observe(el, { attributes: true, attributeOldValue: true, subtree: true });
  const animated = new Map(watched.map((e) => [rel(el, e), animatedProps(e)]));
  active = { index, watched, before: snapshot(el, watched), animated, unstable: new Map(), timing: timingOf(el, watched), observer, writes };
  return point ?? { x: 0, y: 0 };
}

/** An attribute that is not there — distinct from `""`, which is how `data-open` is set when it is. */
const ABSENT = "(absent)";

function noteWrite(target: Element, writes: StyleChange[], m: MutationRecord) {
  if (!m.attributeName || m.attributeName.startsWith("data-cp")) return;
  const t = m.target as Element;
  writes.push({ at: rel(target, t), property: m.attributeName, from: m.oldValue ?? ABSENT, to: t.getAttribute(m.attributeName) ?? ABSENT });
}

/**
 * A second resting read, taken by the worker a moment after `begin` and before it acts. Whatever
 * changed in between changes on its own — a gradient turned by an animated custom property, a
 * pseudo-element spinning, a dot a script pulses — and has no single before or after to record.
 */
export function restInteraction() {
  const a = active;
  if (!a) return;
  for (const [at, now] of snapshot(targets[a.index], a.watched)) {
    const was = a.before.get(at) ?? {};
    for (const p of INTERACTION_PROPS) {
      if ((was[p] ?? "") === now[p]) continue;
      const set = a.unstable.get(at) ?? new Set<string>();
      set.add(p);
      a.unstable.set(at, set);
    }
  }
}

/** Compare against the resting snapshot, once the worker has let the transitions finish. */
export function endInteraction(action: InteractionAction): InteractionRecord | null {
  const a = active;
  if (!a) return null;
  active = null;
  const pending = a.observer.takeRecords();
  a.observer.disconnect();
  const el = targets[a.index];
  for (const m of pending) noteWrite(el, a.writes, m);
  // An animation still running now (a loop; a transition past the worker's settle window) has no
  // single "after" value, so what it drives is left out, as the fingerprint does.
  for (const e of a.watched) {
    if (!e.isConnected) continue;
    const set = a.animated.get(rel(el, e)) ?? new Set<string>();
    for (const p of animatedProps(e)) set.add(p);
    a.animated.set(rel(el, e), set);
  }
  const changes: StyleChange[] = [];
  for (const [at, now] of snapshot(el, a.watched)) {
    const was = a.before.get(at) ?? {};
    const moving = new Set([...(a.animated.get(at.replace(/::(before|after)$/, "")) ?? []), ...(a.unstable.get(at) ?? [])]);
    for (const p of INTERACTION_PROPS) {
      if (!moving.has(p) && (was[p] ?? "") !== now[p]) changes.push({ at, property: p, from: was[p] ?? "", to: now[p] });
    }
  }
  const merged = new Map<string, StyleChange>();
  for (const w of a.writes) {
    const key = `${w.at}|${w.property}`;
    const seen = merged.get(key);
    merged.set(key, seen ? { ...seen, to: w.to } : w);
  }
  const script = [...merged.values()].filter((w) => w.from !== w.to);
  if (!changes.length && !script.length) return null;
  const carries = (t: Timing, c: StyleChange) => t.at === c.at &&
    (t.property === "all" || t.property === c.property || c.property.startsWith(`${t.property}-`) || t.property.startsWith(`${c.property}-`));
  return {
    selector: cssPath(el), label: labelOf(el), action,
    changes: changes.slice(0, 80),
    timing: a.timing.filter((t) => changes.some((c) => carries(t, c))).slice(0, 40),
    script: script.slice(0, 40),
  };
}

export function cancelInteraction() {
  active?.observer.disconnect();
  active = null;
}

/** Drop the focus a press leaves on a button, so the next resting snapshot is really at rest. */
export function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export function clearInteractive() {
  cancelInteraction();
  for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  targets = [];
}

/**
 * In a rebuild, the element a recorded interaction belongs to: the same selector when its label
 * agrees, else the first visible element with that tag and label. Marked like a discovered target.
 */
export function locateInteractive(selector: string, label: string): number | null {
  let el: Element | null = null;
  try { el = document.querySelector(selector); } catch { /* not valid in this document */ }
  if (!el || labelOf(el) !== label) {
    const tag = /^[a-z][\w-]*/i.exec(selector.split(" > ").pop() ?? "")?.[0];
    const pool = tag ? document.getElementsByTagName(tag) : document.querySelectorAll(INTERACTIVE);
    el = [...pool].find((e) => labelOf(e) === label && visible(e)) ?? null;
  }
  if (!el) return null;
  const index = targets.push(el) - 1;
  el.setAttribute(MARK, String(index));
  return index;
}

/** What the rebuild does differently from a recorded interaction, in numbers. */
export function compareInteraction(original: InteractionRecord, rebuild: InteractionRecord | null): InteractionDiff[] {
  const script = original.script.length > 0;
  const name = `${original.action} ${original.label ? `"${original.label}" ` : ""}(${original.selector})`;
  const where = (at: string) => (at ? ` ${at}` : "");
  const got = new Map((rebuild?.changes ?? []).map((c) => [`${c.at}|${c.property}`, c]));
  const out: InteractionDiff[] = [];
  for (const c of original.changes) {
    const r = got.get(`${c.at}|${c.property}`);
    if (!r) out.push({ script, message: `${name}${where(c.at)}: ${c.property} should change to ${c.to} (at rest ${c.from}); the rebuild does not change it` });
    else if (r.to !== c.to) out.push({ script, message: `${name}${where(c.at)}: ${c.property} changes to ${r.to}, original ${c.to}` });
  }
  const timing = (t?: Timing) => (t ? `${t.duration} ${t.easing}${t.delay !== "0s" ? ` delay ${t.delay}` : ""}` : "none");
  for (const t of original.timing) {
    const r = rebuild?.timing.find((x) => x.at === t.at && x.property === t.property);
    if (timing(r) !== timing(t)) out.push({ script, message: `${name}${where(t.at)}: transition ${t.property} ${timing(r)}, original ${timing(t)}` });
  }
  return out;
}
