/**
 * Everything a page only shows after a click (#116).
 *
 * A DOM export sees the default state. On resend.com that leaves out eight of the nine framework
 * code samples, every header menu and every FAQ answer — and an agent rebuilding from it invents
 * them. So the export opens each tab, disclosure and menu in turn, records what the click changed,
 * and puts the page back.
 *
 * The page side is here: finding the triggers, observing a click's effect, and working out how to
 * undo it. The click itself comes from the service worker through the debugger, because a synthetic
 * `click()` does not move the pointer and so never applies `:hover` or pointer-driven menus.
 */

import { UI } from "../shared/const";
import { cssPath } from "../shared/selector";
import { noteStateMatches, resetStateMatches } from "./used-css";

const MAX_TRIGGERS = 60;
const MARK = "data-cp-trigger";
const TRIGGERS = '[role="tab"], [aria-expanded], [aria-haspopup]:not([aria-haspopup="false"]), summary, button[data-state="closed"], [role="button"][data-state="closed"]';

export type TriggerKind = "tab" | "summary" | "disclosure";
export interface Trigger { index: number; mark: string; selector: string; label: string; kind: TriggerKind }
export interface StateRecord {
  trigger: string;
  label: string;
  kind: TriggerKind;
  /** Elements that entered the page, as markup — a portal-mounted popup is the usual one. */
  added: string[];
  removed: number;
  attributes: { selector: string; name: string; from: string | null; to: string | null }[];
  text: { selector: string; from: string; to: string }[];
  /** Changed elements that are visible now, with their text: what the click revealed. */
  revealed: { selector: string; text: string }[];
}
/** How to put the page back: click here, press Escape, or nothing to do. */
export type Undo = { selector: string; x: number; y: number } | "escape" | null;

interface Active {
  index: number;
  observer: MutationObserver;
  records: MutationRecord[];
  tabDefault: { el: Element; label: string; selector: string } | null;
  expandedBefore: string | null;
  openBefore: boolean;
}

let triggers: Trigger[] = [];
let elements: Element[] = [];
let active: Active | null = null;
let last: (Active & { addedTop: Element[] }) | null = null;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
};

/** A link to another page is navigation, not state — following it would end the export. */
function leavesPage(el: Element): boolean {
  const a = el.closest<HTMLAnchorElement>("a[href]");
  if (!a || (a.getAttribute("href") ?? "").startsWith("#")) return false;
  try {
    const u = new URL(a.href);
    return u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search;
  } catch { return true; }
}

const labelOf = (el: Element) =>
  (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)
  || document.getElementById(el.getAttribute("aria-controls") ?? "")?.querySelector("h1, h2, h3, h4")?.textContent?.trim().slice(0, 40)
  || cssPath(el);

const kindOf = (el: Element): TriggerKind => el.matches('[role="tab"]') ? "tab" : el.matches("summary") ? "summary" : "disclosure";

/**
 * The live element for a control a re-render replaced. A framework rebuilds a tab list when a
 * sibling control changes — resend.com's framework tabs are new elements after every language click —
 * so a stored reference goes stale while the control it named is still on screen. Same kind and
 * label, preferring the same place in the tree when two lists share a label ("Node.js" is in both).
 */
function relocate(label: string, kind: TriggerKind, selector: string): Element | null {
  const candidates = [...document.querySelectorAll(TRIGGERS)]
    .filter((e) => !e.closest(`[${UI}]`) && kindOf(e) === kind && labelOf(e) === label && visible(e));
  return candidates.find((e) => cssPath(e) === selector) ?? candidates[0] ?? null;
}

/** The element for trigger `index`, found again (and re-marked) if a re-render replaced it. */
function live(index: number): Element | null {
  const stored = elements[index];
  if (stored?.isConnected) return stored;
  const t = triggers[index];
  const found = t && relocate(t.label, t.kind, t.selector);
  if (found) { found.setAttribute(MARK, String(index)); elements[index] = found; }
  return found ?? null;
}

/** Every trigger whose state is not already the one on screen, marked so the worker can find it. */
export function discover(root: Element = document.body): Trigger[] {
  clear();
  resetStateMatches();
  for (const el of root.querySelectorAll(TRIGGERS)) {
    if (triggers.length >= MAX_TRIGGERS) break;
    if (el.closest(`[${UI}]`) || !visible(el) || leavesPage(el) || el.matches('[type="submit"], [disabled], [aria-disabled="true"]')) continue;
    const kind = kindOf(el);
    if (kind === "tab" && el.getAttribute("aria-selected") === "true") continue;
    if (kind === "disclosure" && el.getAttribute("aria-expanded") === "true") continue;
    if (kind === "summary" && (el.parentElement as HTMLDetailsElement | null)?.open) continue;
    const index = elements.push(el) - 1;
    el.setAttribute(MARK, String(index));
    triggers.push({ index, mark: `[${MARK}="${index}"]`, selector: cssPath(el), label: labelOf(el), kind });
  }
  return [...triggers];
}

/** Start watching, and return where to click. */
export function begin(index: number): { x: number; y: number } {
  end();
  const el = live(index);
  if (!el) throw new Error(`trigger ${index} is no longer on the page`);
  if (triggers[index].kind === "tab" && el.getAttribute("aria-selected") === "true") throw new Error("its tab is already the one showing");
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const tablist = el.closest('[role="tablist"]');
  const selected = triggers[index].kind === "tab" && tablist ? tablist.querySelector('[role="tab"][aria-selected="true"]') : null;
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(document.body, { attributes: true, attributeOldValue: true, childList: true, characterData: true, characterDataOldValue: true, subtree: true });
  active = {
    index, observer, records,
    tabDefault: selected ? { el: selected, label: labelOf(selected), selector: cssPath(selected) } : null,
    expandedBefore: el.getAttribute("aria-expanded"),
    openBefore: !!(el.parentElement as HTMLDetailsElement | null)?.open,
  };
  return center(el);
}

/** A detached copy of added markup with nothing runnable left in it. */
function fragment(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const s of copy.querySelectorAll("script, style")) s.remove();
  for (const e of [copy, ...copy.querySelectorAll("*")]) for (const a of [...e.attributes]) if (/^on/i.test(a.name)) e.removeAttribute(a.name);
  return copy.outerHTML.slice(0, 20_000);
}

/** Stop watching and report what the click changed. */
export function end(): StateRecord | null {
  if (!active) return null;
  const a = active;
  active = null;
  a.records.push(...a.observer.takeRecords());
  a.observer.disconnect();

  const firstValue = new Map<Element, Map<string, string | null>>();
  const texts = new Map<Node, string>();
  const added = new Set<Element>();
  let removed = 0;
  for (const m of a.records) {
    if (m.type === "attributes") {
      const t = m.target as Element;
      const name = m.attributeName!;
      if (name === "style" || name.startsWith("data-cp") || t.closest(`[${UI}]`)) continue;
      const seen = firstValue.get(t) ?? new Map<string, string | null>();
      if (!seen.has(name)) seen.set(name, m.oldValue);
      firstValue.set(t, seen);
    } else if (m.type === "characterData") {
      if (!texts.has(m.target)) texts.set(m.target, m.oldValue ?? "");
    } else {
      for (const n of m.addedNodes) if (n instanceof Element && !n.closest(`[${UI}]`)) added.add(n);
      removed += [...m.removedNodes].filter((n) => n instanceof Element).length;
    }
  }

  const attributes: StateRecord["attributes"] = [];
  for (const [el, names] of firstValue) {
    if (!el.isConnected) continue;
    for (const [name, from] of names) {
      const to = el.getAttribute(name);
      if (to !== from && attributes.length < 100) attributes.push({ selector: cssPath(el), name, from, to });
    }
  }
  const addedTop = [...added].filter((n) => n.isConnected && ![...added].some((o) => o !== n && o.contains(n)));
  const changed = [...firstValue.keys(), ...addedTop].filter((e) => e.isConnected);
  const shown = changed.filter((e) => visible(e) && (e as HTMLElement).innerText?.trim());
  const revealed = shown.filter((e) => !shown.some((o) => o !== e && o.contains(e))).slice(0, 20)
    .map((e) => ({ selector: cssPath(e), text: (e as HTMLElement).innerText.trim().slice(0, 300) }));
  noteStateMatches(changed);

  const t = triggers[a.index];
  last = { ...a, addedTop };
  return {
    trigger: t.selector, label: t.label, kind: t.kind,
    added: addedTop.slice(0, 20).map(fragment), removed, attributes,
    text: [...texts].filter(([node, from]) => node.parentElement?.isConnected && node.textContent !== from).slice(0, 50)
      .map(([node, from]) => ({ selector: cssPath(node.parentElement!), from, to: node.textContent ?? "" })),
    revealed,
  };
}

/** How to return to the state before the last trigger: the default tab, the same toggle, or Escape. */
export function restore(): Undo {
  const l = last;
  last = null;
  if (!l) return null;
  const at = (e: Element): Undo => ({ selector: cssPath(e), ...center(e) });
  if (l.tabDefault) {
    const tab = l.tabDefault.el.isConnected ? l.tabDefault.el : relocate(l.tabDefault.label, "tab", l.tabDefault.selector);
    if (tab) return at(tab);
  }
  const el = live(l.index);
  if (el?.matches("summary")) return (el.parentElement as HTMLDetailsElement).open !== l.openBefore ? at(el) : null;
  if (el && el.getAttribute("aria-expanded") !== l.expandedBefore) return at(el);
  return l.addedTop.some((n) => n.isConnected) ? "escape" : null;
}

/** Finite animations still running — the worker waits for these before recording a state. */
export const busy = () => document.getAnimations()
  .some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity);

/** Remove every mark and forget the triggers. The state matches stay, for the final used-CSS pass. */
export function clear() {
  end();
  for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  triggers = [];
  elements = [];
  last = null;
}
