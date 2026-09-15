/**
 * Performing hovers, focuses and presses for real, for the export and for verify_rebuild (#125).
 *
 * The pointer moves through the debugger, so CSS `:hover` and `:active` apply and a script's
 * mouseenter fires — neither happens for a synthetic event. Focus is forced as `:focus-visible` with
 * `CSS.forcePseudoState`, the keyboard-focus look, without tabbing through the page. A press is
 * released away from the element, so it never completes into a click and never follows a link.
 */

import type { InteractionAction, InteractionRecord } from "../../core/export/interactions";

type Target = chrome.debugger.Debuggee;
export type PageCall = <T>(path: string, ...args: unknown[]) => Promise<T>;
export interface Planned { index: number; label: string; action: InteractionAction }

const send = <T = unknown>(target: Target, method: string, params?: object) => chrome.debugger.sendCommand(target, method, params) as Promise<T>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CORNER = { x: 0, y: 0 };
/** Gap between the two resting reads: long enough to see a loop move, short enough to repeat 150 times. */
const REST_SAMPLE_MS = 250;

/** Wait at least `min`, then until no finite animation or transition is running, up to `max`. */
export async function settle(page: PageCall, min = 150, max = 1500) {
  const start = Date.now();
  await sleep(min);
  while (Date.now() - start < max && await page<boolean>("rebuild.sweep.busy")) await sleep(50);
}

const mouse = (target: Target, type: string, at: { x: number; y: number }, buttons = 0) =>
  send(target, "Input.dispatchMouseEvent", { type, x: at.x, y: at.y, buttons, ...(type === "mouseMoved" ? {} : { button: "left", clickCount: 1 }) });

/** Move the pointer to the corner, so nothing stays hovered for the next measurement. */
export const parkPointer = (target: Target) => mouse(target, "mouseMoved", CORNER).catch(() => {});

/**
 * The node id each forced focus was set on. Clearing must use the same id: `DOM.getDocument` hands out
 * fresh ids, and the forced state stays on the old one — the export's fingerprint then recorded a
 * focus ring on a button nothing had focused.
 */
const forced = new Map<number, number>();

async function forceFocus(target: Target, index: number, on: boolean) {
  let nodeId = forced.get(index);
  if (on) {
    const { root } = await send<{ root: { nodeId: number } }>(target, "DOM.getDocument", { depth: 0 });
    ({ nodeId } = await send<{ nodeId: number }>(target, "DOM.querySelector", { nodeId: root.nodeId, selector: `[data-cp-interact="${index}"]` }));
    if (!nodeId) return;
    forced.set(index, nodeId);
  } else {
    forced.delete(index);
    if (!nodeId) return;
  }
  await send(target, "CSS.forcePseudoState", { nodeId, forcedPseudoClasses: on ? ["focus", "focus-visible"] : [] });
}

async function perform(target: Target, p: Planned, at: { x: number; y: number }) {
  if (p.action === "focus") return forceFocus(target, p.index, true);
  await mouse(target, "mouseMoved", at);
  if (p.action === "press") await mouse(target, "mousePressed", at, 1);
}

async function undo(target: Target, page: PageCall, p: Planned) {
  if (p.action === "focus") return forceFocus(target, p.index, false);
  if (p.action === "press") {
    await mouse(target, "mouseMoved", CORNER, 1);
    await mouse(target, "mouseReleased", CORNER, 0);
    await page("rebuild.interact.blur");
  }
  await parkPointer(target);
}

/** Run each planned interaction and return its record, or null where it was skipped or changed nothing. */
export async function runInteractions(target: Target, page: PageCall, plan: Planned[], notes: string[]): Promise<(InteractionRecord | null)[]> {
  await send(target, "DOM.enable");
  await send(target, "CSS.enable");
  const out: (InteractionRecord | null)[] = [];
  try {
    for (const p of plan) {
      try {
        const at = await page<{ x: number; y: number }>("rebuild.interact.begin", p.index, p.action);
        await sleep(REST_SAMPLE_MS);
        await page("rebuild.interact.rest");
        await perform(target, p, at);
        await settle(page);
        out.push(await page<InteractionRecord | null>("rebuild.interact.end", p.action));
      } catch (e) {
        out.push(null);
        notes.push(`The ${p.action} on "${p.label}" was skipped: ${message(e)}`);
        await page("rebuild.interact.cancel").catch(() => {});
      } finally {
        await undo(target, page, p).catch(() => {});
        await settle(page, 100).catch(() => {});
      }
    }
  } finally {
    await page("rebuild.interact.clear").catch(() => {});
    // Disabling the CSS domain drops every forced pseudo-state, whatever a skipped step left behind.
    forced.clear();
    await send(target, "CSS.disable").catch(() => {});
    await parkPointer(target);
  }
  return out;
}
