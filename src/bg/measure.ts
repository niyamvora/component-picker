/**
 * The one debugger session every measurement flows through.
 *
 * Everything shares it deliberately: attaching shows the user a "Component Picker started
 * debugging this browser" bar, and doing it once per section would flash that bar five times and
 * re-run the page's resize handlers in between.
 */

import type { MeasureResult, Message, Options, Snapshot, StateIndices, StateName, ThemeInfo } from "../shared/types";

const send = (target: chrome.debugger.Debuggee, method: string, params?: object): Promise<any> =>
  chrome.debugger.sendCommand(target, method, params) as Promise<any>;
/** Ask the content script to measure the picked subtree once the page has settled. */
const snap = (tabId: number, settle: number, theme?: "flip"): Promise<Snapshot> =>
  chrome.tabs.sendMessage(tabId, { type: "snapshot", settle, theme } satisfies Message);

/**
 * One debugger session for the whole capture.
 *
 * Everything shares it deliberately: attaching shows the user a "Component Picker started
 * debugging this browser" bar, and doing it once per section would flash that bar five times and
 * re-run the page's resize handlers in between.
 */
export async function measure(tabId: number, msg: { states: StateIndices; theme: ThemeInfo | null; options: Options }): Promise<MeasureResult> {
  const { states, theme, options } = msg;
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  const out: MeasureResult = { viewports: [], states: [], shots: [] };
  try {
    // The pointer is still sitting where the user clicked, so the site's :hover styles are live
    // and would be measured as if they were the resting state. Park it in the corner first.
    // ponytail: an element at (0,0) stays hovered; rare, and the alternative is guessing a free pixel.
    await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });

    const desktop = await snap(tabId, 400);
    out.viewports.push({ name: "desktop", ...desktop });
    if (options.screenshots) await shoot(target, out, "desktop", desktop, devicePixelRatioOf(1));

    for (const v of options.viewports ?? []) {
      await send(target, "Emulation.setDeviceMetricsOverride", {
        width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile,
      });
      const shot = await snap(tabId, 400);
      out.viewports.push({ ...v, ...shot });
      if (options.screenshots) await shoot(target, out, v.name, shot, v.dpr);
    }
    await send(target, "Emulation.clearDeviceMetricsOverride");

    if (options.states) await forceStates(target, tabId, states, out);
    if (options.themes && theme) out.theme = await otherTheme(target, tabId, theme);
  } finally {
    await send(target, "Emulation.clearDeviceMetricsOverride").catch(() => {});
    await send(target, "Emulation.setEmulatedMedia", { features: [] }).catch(() => {});
    await chrome.debugger.detach(target).catch(() => {});
  }
  return out;
}

const devicePixelRatioOf = (fallback: number) => fallback;

/** A screenshot big enough to see, small enough to paste: the element plus a little air. */
const SHOT_PAD = 8;
const SHOT_MAX_PX = 4_000_000;

async function shoot(target: chrome.debugger.Debuggee, out: MeasureResult, name: string, snapshot: Snapshot, dpr: number) {
  const { x, y, width, height } = snapshot.rect;
  if (width < 1 || height < 1) return;
  if ((width + SHOT_PAD * 2) * (height + SHOT_PAD * 2) * dpr * dpr > SHOT_MAX_PX) return;
  try {
    const { data } = await send(target, "Page.captureScreenshot", {
      format: "png",
      // captureBeyondViewport reaches an element scrolled out of view instead of returning blank.
      captureBeyondViewport: true,
      clip: { x: Math.max(0, x - SHOT_PAD), y: Math.max(0, y - SHOT_PAD), width: width + SHOT_PAD * 2, height: height + SHOT_PAD * 2, scale: dpr },
    });
    out.shots.push({ name, png: data, width: Math.round(width), height: Math.round(height), dpr });
  } catch { /* a screenshot is a bonus; never fail the capture for one */ }
}

// :focus-visible only applies while :focus does, so it is forced as a pair.
const PSEUDO: Record<StateName, string[]> = { hover: ["hover"], "focus-visible": ["focus", "focus-visible"], active: ["active"] };
const MAX_FORCED = 20;

/**
 * Measure the picked subtree with interaction states forced on, the way DevTools does it.
 * Every element the site has a state rule for is forced — not just the picked root — because a
 * card's hover styling usually lives on a child. They are forced together, so what comes back is
 * "this component with everything hovered", not one pointer position.
 */
async function forceStates(target: chrome.debugger.Debuggee, tabId: number, states: StateIndices, out: MeasureResult) {
  const wanted = (Object.keys(PSEUDO) as StateName[]).filter((s) => states[s]?.length);
  if (!wanted.length) return;
  await send(target, "DOM.enable");
  await send(target, "CSS.enable");
  const { root } = await send(target, "DOM.getDocument", { depth: 0 });
  for (const state of wanted) {
    const nodes: number[] = [];
    for (const i of states[state].slice(0, MAX_FORCED)) {
      const { nodeId } = await send(target, "DOM.querySelector", { nodeId: root.nodeId, selector: `[data-cp-tmp="${i}"]` });
      if (nodeId) nodes.push(nodeId);
    }
    if (!nodes.length) continue;
    for (const nodeId of nodes) await send(target, "CSS.forcePseudoState", { nodeId, forcedPseudoClasses: PSEUDO[state] });
    // A forced state does not reflow, so the only wait needed is the page's own transition,
    // which the content script measures for itself.
    out.states.push({ name: state, ...(await snap(tabId, 0)) });
    for (const nodeId of nodes) await send(target, "CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
  }
}

/**
 * The same component in the theme you are not looking at.
 *
 * Two mechanisms, because sites use two: `prefers-color-scheme` is emulated from here, while a
 * `.dark` class or `data-theme` attribute has to be flipped in the page — and a site whose
 * framework re-applies the theme on mutation will flip it straight back, which the content script
 * detects and reports rather than returning a snapshot of the theme we already had.
 */
async function otherTheme(target: chrome.debugger.Debuggee, tabId: number, theme: ThemeInfo) {
  const other = theme.current === "dark" ? "light" : "dark";
  try {
    if (theme.kind === "media") {
      await send(target, "Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: other }] });
      const shot = await snap(tabId, 400);
      await send(target, "Emulation.setEmulatedMedia", { features: [] });
      return { name: other, how: "prefers-color-scheme", ...shot } as const;
    }
    const shot = await snap(tabId, 400, "flip");
    return { name: other, how: theme.kind === "class" ? `html.${other}` : `html[${theme.attr}]`, ...shot } as const;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
