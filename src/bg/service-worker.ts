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

// With a popup declared, chrome.action.onClicked no longer fires — the popup's Pick button calls
// inject() instead. This listener stays for the case where the popup is disabled.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^(https?|file):/.test(tab.url || "")) return;
  await inject(tab.id);
});

chrome.storage.local.get("bridge").then((s) => { if (s.bridge) startBridge(); });

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
    : msg.type === "get-inventory" ? chrome.storage.local.get("inventory").then((s) => s.inventory ?? null)
    : msg.type === "bridge" ? (msg.on ? startBridge() : stopBridge(), chrome.storage.local.set({ bridge: msg.on }))
    : msg.type === "bridge-result" ? deliverToBridge(msg.bundle)
    : msg.type === "assets" ? collectAssetsFromTab()
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

/** Ask the active tab's picker to zip the last pick's assets (#44). */
async function collectAssetsFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__cp?.assets() ?? null });
  return r.result;
}

async function remember(entry: HistoryEntry) {
  const { history = [] } = await chrome.storage.local.get("history");
  await chrome.storage.local.set({ history: [entry, ...(history as HistoryEntry[])].slice(0, MAX_HISTORY) });
}
