/**
 * The service worker: injects the picker, and drives the one debugger session that every
 * measurement flows through — resting desktop, each viewport, each forced interaction state.
 */

import type { MeasureResult, Message, ProbeResult, Snapshot, StateIndices, StateName, Viewport } from "./types";

/** Injected by name, so this must match what build.mjs emits into dist/. */
const PICKER = "picker.js";

// Toolbar click → inject the picker into the active tab. It is idempotent:
// injecting it again toggles the picker off.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^(https?|file):/.test(tab.url || "")) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [PICKER] });
});

// Viewports we re-measure the picked subtree at. Same tab, same DOM state —
// CDP device emulation reflows the live page instead of reloading it.
const VIEWPORTS: Viewport[] = [
  { name: "mobile", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "tablet", width: 768, height: 1024, dpr: 2, mobile: true },
];

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const job = msg.type === "measure" ? measure(tabId, msg.states)
    : msg.type === "probe" ? probe(tabId) : null;
  if (!job) return;
  job.then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
  return true; // keeps the message channel open for the async reply
});

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
const snap = (tabId: number, settle: number): Promise<Snapshot> =>
  chrome.tabs.sendMessage(tabId, { type: "snapshot", settle } satisfies Message);

/**
 * One debugger session for the whole capture: resting desktop, each viewport, each forced state.
 * `states` is { hover: [elementIndex…], "focus-visible": […], active: […] } from the content script.
 */
async function measure(tabId: number, states: StateIndices): Promise<MeasureResult> {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  const out: MeasureResult = { viewports: [], states: [] };
  try {
    // The pointer is still sitting where the user clicked, so the site's :hover styles are live
    // and would be measured as if they were the resting state. Park it in the corner first.
    // ponytail: an element at (0,0) stays hovered; rare, and the alternative is guessing a free pixel.
    await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    out.viewports.push({ name: "desktop", ...(await snap(tabId, 400)) });
    for (const v of VIEWPORTS) {
      await send(target, "Emulation.setDeviceMetricsOverride", {
        width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile,
      });
      out.viewports.push({ ...v, ...(await snap(tabId, 400)) });
    }
    await send(target, "Emulation.clearDeviceMetricsOverride");
    await forceStates(target, tabId, states, out);
  } finally {
    await send(target, "Emulation.clearDeviceMetricsOverride").catch(() => {});
    await chrome.debugger.detach(target).catch(() => {});
  }
  return out;
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
