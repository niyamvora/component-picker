/**
 * Driving a real interaction from the service worker (#104).
 *
 * The page side observes; this side does. The distinction matters because a synthetic `mouseover`
 * dispatched from a content script does not set `:hover` in Chrome — a JS-driven menu would open
 * and every CSS hover rule would stay unapplied, which reports a subtly wrong component rather
 * than an obviously incomplete one. `Input.dispatchMouseEvent` moves the actual pointer.
 */

import { runInActiveTab } from "./tab";
import type { Action, Step } from "../core/interaction";

const send = (target: chrome.debugger.Debuggee, method: string, params?: object): Promise<unknown> =>
  chrome.debugger.sendCommand(target, method, params) as Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sampling window per step: long enough for a 300ms popup to finish, short enough to stay usable. */
const WATCH_MS = 700;
const TICK_MS = 25;

/** Run one page-side call on `window.__cp.interaction`, returning whatever it produced. */
async function page<T>(tabId: number, method: string, args: unknown[]): Promise<T> {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [method, args],
    func: (m: string, a: unknown[]) => {
      const cp = (window as { __cp?: { interaction: Record<string, (...x: unknown[]) => unknown> } }).__cp;
      if (!cp?.interaction) return { error: "the picker did not load in this tab" };
      try { return { value: cp.interaction[m](...a) }; }
      catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
    },
  });
  const out = r.result as { value?: T; error?: string };
  if (out?.error) throw new Error(out.error);
  return out?.value as T;
}

/**
 * Perform one step with the real pointer, then watch what follows.
 *
 * `hover` and `click` go through the debugger; `focus` and `leave` have no pointer to move, so the
 * page performs those itself. Either way the sampling loop is the same.
 */
async function step(target: chrome.debugger.Debuggee, tabId: number, s: Step, watch?: string) {
  const { x, y } = await page<{ x: number; y: number }>(tabId, "begin", [s.trigger, watch]);
  if (s.action === "hover" || s.action === "click") {
    await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    if (s.action === "click") {
      const btn = { x, y, button: "left", buttons: 1, clickCount: 1 };
      await send(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...btn });
      await send(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...btn, buttons: 0 });
    }
  } else {
    await page(tabId, "act", [s.trigger, s.action]);
  }
  for (let t = 0; t < WATCH_MS; t += TICK_MS) {
    await page(tabId, "tick", []);
    await sleep(TICK_MS);
  }
  await page(tabId, "end", [s]);
}

/**
 * A sequence of interactions on the active tab, as one timeline.
 *
 * A sequence rather than a single action because panel-to-panel motion — hover A, then hover B —
 * is one continuous animation, and capturing it as two independent calls would miss the transition
 * that only exists between them.
 */
export async function runInteraction(steps: Step[], watch?: string): Promise<string> {
  return runInActiveTab(async (tabId) => {
    const target = { tabId };
    await chrome.debugger.attach(target, "1.3");
    try {
      for (const s of steps) await step(target, tabId, s, watch);
      return await page<string>(tabId, "report", [steps]);
    } finally {
      // Park the pointer, or the last hovered element stays hovered for the next capture.
      await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 }).catch(() => {});
      await chrome.debugger.detach(target).catch(() => {});
    }
  });
}

export type { Action, Step };
