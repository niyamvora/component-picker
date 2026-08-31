/**
 * The service worker: injects the picker, drives the one debugger session that every measurement
 * flows through — resting desktop, each viewport, each forced state, the other theme, the
 * screenshots — and owns the two things that must outlive a page: the options and the reference
 * pick everything else is diffed against.
 */

import { DEFAULT_OPTIONS } from "../shared/options";
import { deliverToBridge, startBridge, stopBridge } from "./bridge";
import { measure } from "./measure";
import { probe } from "./probe";
import type { HistoryEntry, Message, Preview } from "../shared/types";

/** Injected by name, so this must match what build.mjs emits into dist/. */
const PICKER = "picker.js";
const MAX_HISTORY = 10;

/**
 * Inject into every frame, not just the top one.
 *
 * Stripe fields, cookie banners and docs demos live in iframes; a picker that only runs in the top
 * document simply cannot see them. Each frame gets its own picker, and the one that receives the
 * click owns the capture — a cross-origin frame could not be reached from the parent anyway.
 */
export async function inject(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [PICKER] });
}

/**
 * The toolbar click shows the in-page dock and opens the side panel beside it.
 *
 * There used to be a popup here, which put the settings that shape a capture in a window that
 * closes the moment you click the page — the one thing you always do next. `sidePanel.open()` needs
 * a user gesture, and this listener is one; it must be called before the first `await`, because a
 * gesture does not survive one.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !/^(https?|file):/.test(tab.url || "")) return;
  const opened = chrome.sidePanel?.open?.({ tabId: tab.id })?.catch(() => {});
  void Promise.all([opened, inject(tab.id).catch(() => {})]);
});

chrome.storage.local.get("bridge").then((s) => { if (s.bridge) startBridge(); });
// The side panel opens from Chrome's side-panel button; it is never force-opened on a capture.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
// Let the in-page drawer read the (session-scoped) compare reference.
chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  const { options } = await chrome.storage.local.get("options");
  if (!options) await chrome.storage.local.set({ options: DEFAULT_OPTIONS });
});

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  const tabId = sender.tab?.id;
  const job =
    msg.type === "measure" && tabId !== undefined ? measure(tabId, msg)
    : msg.type === "probe" && tabId !== undefined ? probe(tabId)
    : msg.type === "set-reference" ? chrome.storage.session.set({ reference: msg.reference })
    : msg.type === "clear-reference" ? chrome.storage.session.remove("reference")
    : msg.type === "get-reference" ? chrome.storage.session.get("reference").then((s) => s.reference ?? null)
    : msg.type === "get-inventory" ? chrome.storage.local.get("inventory").then((s) => s.inventory ?? null)
    : msg.type === "bridge" ? (msg.on ? startBridge() : stopBridge(), chrome.storage.local.set({ bridge: msg.on }))
    : msg.type === "bridge-result" ? deliverToBridge(msg.bundle, msg.pushed)
    : msg.type === "assets" ? collectAssetsFromTab()
    : msg.type === "screenshot" && tabId !== undefined ? screenshotElement(tabId)
    : msg.type === "remember" ? remember(msg.entry)
    : msg.type === "save-to-library" ? saveToLibrary(msg.entry)
    : msg.type === "save-last-to-library" ? saveLastToLibrary()
    : msg.type === "get-library" ? chrome.storage.local.get("library").then((s) => s.library ?? [])
    : msg.type === "delete-from-library" ? deleteFromLibrary(msg.id)
    : msg.type === "picking" ? chrome.action.setBadgeText({ tabId, text: msg.on ? "ON" : "" })
    : msg.type === "preview" ? showPreview(tabId, msg.preview)
    : null;
  if (!job) return;
  job.then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
  return true; // keeps the message channel open for the async reply
});

/** Store the latest capture for the side panel, and push it to the panel if it is already open. */
async function showPreview(_tabId: number | undefined, preview: Preview) {
  // Store it and push it to the panel if it is already open. Do NOT call sidePanel.open() here:
  // this runs in an async message handler with no user gesture, so Chrome refuses it and flashes
  // the panel open-then-shut — a flicker with nothing to show for it. The panel reads the stored
  // preview when the user opens it themselves from Chrome's side-panel button.
  await chrome.storage.local.set({ preview });
  // The drawer's section rows read these (#80). Session-scoped, and readable from the content
  // script, so a pick made inside an iframe still reaches a drawer mounted in the top document.
  await chrome.storage.session.set({ sections: preview.sections ?? [] });
  await chrome.runtime.sendMessage({ type: "preview", preview }).catch(() => {});
}

/** A one-off PNG of the highlighted element, for copy-as-image (#63). */
async function screenshotElement(tabId: number) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const el = (window as any).__cp?.current?.() as Element | null;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, dpr: window.devicePixelRatio };
  } });
  const rect = r.result as { x: number; y: number; width: number; height: number; dpr: number } | null;
  if (!rect || rect.width < 1) return { error: "nothing highlighted" };
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const pad = 8;
    const shot = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + pad * 2, height: rect.height + pad * 2, scale: rect.dpr },
    }) as { data: string };
    return { png: shot.data };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

/** Ask the active tab's picker to zip the last pick's assets (#44). */
async function collectAssetsFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__cp?.assets() ?? null });
  return r.result;
}

const MAX_LIBRARY = 60;
async function saveToLibrary(entry: import("../shared/types").LibraryEntry) {
  const { library = [] } = await chrome.storage.local.get("library");
  // Evict oldest when near storage.local's budget; a thumbnail data-URI is the heavy part.
  const next = [entry, ...(library as import("../shared/types").LibraryEntry[])].slice(0, MAX_LIBRARY);
  await chrome.storage.local.set({ library: next });
}
/** Save the most recent pick (from history) to the library — the dock's bookmark button. */
async function saveLastToLibrary() {
  const { history = [], preview } = await chrome.storage.local.get(["history", "preview"]);
  const h = (history as HistoryEntry[])[0];
  if (!h) return;
  const thumb = (preview as { shot?: string } | undefined)?.shot;
  await saveToLibrary({ id: `${Date.now()}`, name: h.label, host: h.host, url: "", at: h.at, bundle: h.bundle, thumb: thumb ? `data:image/png;base64,${thumb}` : undefined });
}

async function deleteFromLibrary(id: string) {
  const { library = [] } = await chrome.storage.local.get("library");
  await chrome.storage.local.set({ library: (library as import("../shared/types").LibraryEntry[]).filter((e) => e.id !== id) });
}

async function remember(entry: HistoryEntry) {
  const { history = [] } = await chrome.storage.local.get("history");
  await chrome.storage.local.set({ history: [entry, ...(history as HistoryEntry[])].slice(0, MAX_HISTORY) });
}
