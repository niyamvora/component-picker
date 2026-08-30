/**
 * The service worker: injects the picker, drives the one debugger session that every measurement
 * flows through — resting desktop, each viewport, each forced state, the other theme, the
 * screenshots — and owns the two things that must outlive a page: the options and the reference
 * pick everything else is diffed against.
 */

import { DEFAULT_OPTIONS } from "./options";
import type {
  HistoryEntry, MeasureResult, Message, Options, Preview, ProbeResult, Snapshot, StateIndices, StateName, ThemeInfo,
} from "./types";

/** Injected by name, so this must match what build.mjs emits into dist/. */
const PICKER = "picker.js";
const MAX_HISTORY = 10;

export async function inject(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: [PICKER] });
}

// With a popup declared, chrome.action.onClicked no longer fires — the popup's Pick button calls
// inject() instead. This listener stays for the case where the popup is disabled.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^(https?|file):/.test(tab.url || "")) return;
  await inject(tab.id);
});

chrome.runtime.onInstalled.addListener(async () => {
  const { options } = await chrome.storage.local.get("options");
  if (!options) await chrome.storage.local.set({ options: DEFAULT_OPTIONS });
});

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  const tabId = sender.tab?.id;
  const job =
    msg.type === "measure" && tabId !== undefined ? measure(tabId, msg)
    : msg.type === "probe" && tabId !== undefined ? probe(tabId)
    : msg.type === "set-reference" ? chrome.storage.local.set({ reference: msg.reference })
    : msg.type === "clear-reference" ? chrome.storage.local.remove("reference")
    : msg.type === "get-reference" ? chrome.storage.local.get("reference").then((s) => s.reference ?? null)
    : msg.type === "remember" ? remember(msg.entry)
    : msg.type === "picking" ? chrome.action.setBadgeText({ tabId, text: msg.on ? "ON" : "" })
    : msg.type === "preview" ? showPreview(tabId, msg.preview)
    : null;
  if (!job) return;
  job.then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
  return true; // keeps the message channel open for the async reply
});

/**
 * Hand the capture to the side panel, and open the panel if it is not already there.
 *
 * The payload is stored as well as sent: a panel opened later would otherwise sit empty until the
 * next pick, and the message it missed is not replayed.
 */
async function showPreview(tabId: number | undefined, preview: Preview) {
  await chrome.storage.local.set({ preview });
  if (tabId !== undefined) await chrome.sidePanel.open({ tabId }).catch(() => {});
  await chrome.runtime.sendMessage({ type: "preview", preview }).catch(() => {});
}

async function remember(entry: HistoryEntry) {
  const { history = [] } = await chrome.storage.local.get("history");
  await chrome.storage.local.set({ history: [entry, ...(history as HistoryEntry[])].slice(0, MAX_HISTORY) });
}

// Runs in the page's MAIN world, where React's __reactFiber$ expandos are visible.
// Self-contained: executeScript serializes it. Elements arrive tagged data-cp-tmp="<index>".
function pageProbe(): ProbeResult {
  const fiberOf = (el: any) => { const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$")); return k ? el[k] : null; };
  const typeName = (t: any): string | undefined => t && typeof t !== "string" &&
    (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)));
  const els = [...document.querySelectorAll<HTMLElement>("[data-cp-tmp]")]
    .sort((a, b) => Number(a.dataset.cpTmp) - Number(b.dataset.cpTmp));
  const root = els[0];
  const out: ProbeResult = { framework: "not detected", chain: [], handlers: [] };
  if (!root) return out;
  if (fiberOf(root)) {
    const next = (window as any).__NEXT_DATA__ || document.getElementById("__next") || document.querySelector('script[src*="/_next/"]');
    out.framework = next ? "React (Next.js)" : "React";
    for (let f = fiberOf(root); f && out.chain.length < 8; f = f.return) { const n = typeName(f.type); if (n) out.chain.push(n); }
    for (const el of els) {
      const p = fiberOf(el)?.memoizedProps;
      if (!p || typeof p !== "object") continue;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "function" && out.handlers.length < 25) out.handlers.push(`[data-cp="${Number(el.dataset.cpTmp) + 1}"] ${k}: ${v.toString().replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  } else if ((root as any).__vueParentComponent || (root as any).__vue__) {
    const vue = (root as any).__vueParentComponent || (root as any).__vue__;
    out.framework = `Vue (${vue.type?.name || vue.$options?.name || "component"})`;
  }
  return out;
}

async function probe(tabId: number): Promise<ProbeResult> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageProbe });
  return r.result as ProbeResult;
}

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
async function measure(tabId: number, msg: { states: StateIndices; theme: ThemeInfo | null; options: Options }): Promise<MeasureResult> {
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
