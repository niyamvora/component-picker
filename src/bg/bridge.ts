/**
 * The extension side of the MCP bridge (#39, #103).
 *
 * Off by default. When the user turns it on in the side panel, the service worker polls a localhost
 * endpoint the MCP server runs; the server hands back a request, and the finished bundle is POSTed
 * back. This is the one feature that opens a connection, so it is opt-in, announced in the panel,
 * and marked with the badge while a request is in flight.
 *
 * Two shapes of request. `pick` arms the crosshair and waits for a human click — the click is both
 * the selection and the consent. Everything else runs without a human, so the bridge toggle *is*
 * the consent: turning it on is what allows an agent to read this browser's pages. That trade is
 * deliberate (#102), which is why the badge stays lit for automatic captures too.
 */

import { runInActiveTab } from "./tab";
import { runInteraction } from "./interact";
import type { Step } from "../core/interaction";
import type { HistoryEntry, LibraryEntry } from "../shared/types";

const ENDPOINT = "http://127.0.0.1:8787";
const WS_ENDPOINT = "ws://127.0.0.1:8787";
const POLL_MS = 2000;

/** What the MCP server can ask for. Mirrors the tool list in `mcp/server.mjs`. */
export type BridgeRequest =
  | { type: "pick" }
  | { type: "selector"; selectors: string[]; all?: boolean }
  | { type: "page"; limit?: number }
  | { type: "interaction"; steps: Step[]; watch?: string }
  | { type: "captures" }
  | { type: "capture"; id: string };

let armed = false;   // a `pick` is waiting for a click
let busy = false;    // any request is in flight, so the poll does not start a second one
let socket: WebSocket | null = null;

export function startBridge() {
  connectSocket();               // real-time path
  chrome.alarms.create("cp-bridge", { periodInMinutes: POLL_MS / 60000 }); // fallback poll
}
export function stopBridge() {
  chrome.alarms.clear("cp-bridge");
  socket?.close();
  socket = null;
  armed = busy = false;
}

/** One socket to the MCP server; a pushed request is handled here. Reconnects on drop. */
function connectSocket() {
  try {
    socket = new WebSocket(WS_ENDPOINT);
    socket.onmessage = (e) => { try { void handle(JSON.parse(e.data) as BridgeRequest); } catch { /* ignore */ } };
    socket.onclose = () => { socket = null; };
  } catch { socket = null; }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cp-bridge" || busy) return;
  try {
    const r = await fetch(`${ENDPOINT}/next`, { signal: AbortSignal.timeout(1500) });
    const { req } = (await r.json()) as { req: BridgeRequest | null };
    if (req) await handle(req);
  } catch { /* server not running; try again next tick */ }
});

/** Route one request. `pick` hands off to the picker; everything else answers here. */
async function handle(req: BridgeRequest) {
  if (busy) return;
  busy = true;
  chrome.action.setBadgeText({ text: "MCP" });
  try {
    if (req.type === "pick") { await armPick(); return; } // stays busy until the click lands
    const bundle =
      req.type === "captures" ? await listCaptures()
      : req.type === "capture" ? await getCapture(req.id)
      : req.type === "page" ? await capturePage(req.limit)
      : req.type === "interaction" ? await runInteraction(req.steps, req.watch)
      : await captureBySelector(req);
    await deliver({ bundle });
  } catch (e) {
    await deliver({ error: e instanceof Error ? e.message : String(e) });
  }
}

async function armPick() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("no active tab");
  armed = true;
  // The picker routes the finished bundle here when armed by the bridge.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { (window as any).__cpBridge = true; } });
}

/**
 * Capture by selector, with no click (#103).
 *
 * The engine never needed the click — `extract` takes an element — so this is the same capture the
 * picker runs, addressed by `querySelector` instead of by pointer. A selector that matches nothing
 * is reported rather than silently returning an empty bundle, because "no output" and "no match"
 * are different problems for the agent to fix.
 */
async function captureBySelector({ selectors, all }: { selectors: string[]; all?: boolean }): Promise<string> {
  return runInActiveTab(async (tabId) => {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [selectors, !!all],
      func: (sels: string[], every: boolean) => {
        const cp = (window as { __cp?: { extractMany: (e: Element[]) => Promise<string> } }).__cp;
        if (!cp) return { error: "the picker did not load in this tab" };
        const els: Element[] = [];
        const missed: string[] = [];
        for (const s of sels) {
          let hits: Element[];
          try { hits = [...document.querySelectorAll(s)]; } catch { return { error: `not a valid CSS selector: ${s}` }; }
          if (!hits.length) { missed.push(s); continue; }
          els.push(...(every ? hits.slice(0, 12) : [hits[0]]));
        }
        if (!els.length) return { error: `no element matched: ${missed.join(", ")}` };
        return cp.extractMany(els).then((bundle) => ({
          bundle: missed.length ? `${bundle}\n\n<!-- no element matched: ${missed.join(", ")} -->` : bundle,
        }));
      },
    });
    const out = r.result as { bundle?: string; error?: string };
    if (out?.error) throw new Error(out.error);
    return out?.bundle ?? "";
  });
}

/** The whole active tab, section by section (#105). */
async function capturePage(limit?: number): Promise<string> {
  return runInActiveTab(async (tabId) => {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [limit ?? null],
      func: (n: number | null) => {
        const cp = (window as { __cp?: { capturePage: (n?: number) => Promise<string> } }).__cp;
        if (!cp) return { error: "the picker did not load in this tab" };
        return cp.capturePage(n ?? undefined).then((bundle) => ({ bundle }), (e: Error) => ({ error: e.message }));
      },
    });
    const out = r.result as { bundle?: string; error?: string };
    if (out?.error) throw new Error(out.error);
    return out?.bundle ?? "";
  });
}

/**
 * The captures already on disk (#110).
 *
 * The picker keeps the last ten picks and the library keeps what was saved deliberately, so an
 * agent can consume work the user did at the browser without re-arming anything. A history entry
 * has no id of its own, but `at` is already unique per pick and never changes — using it is one
 * less field to migrate than inventing one.
 */
const historyId = (h: HistoryEntry) => String(h.at);
const when = (at: number) => new Date(at).toISOString().replace("T", " ").slice(0, 19);

async function listCaptures(): Promise<string> {
  const { history = [], library = [] } = await chrome.storage.local.get(["history", "library"]);
  const h = history as HistoryEntry[];
  const l = library as LibraryEntry[];
  if (!h.length && !l.length) return "No captures yet. Use pick_component or capture_selector first.";
  const rows = [
    ...h.map((e) => `${historyId(e)}\trecent\t${e.label} — ${e.host} — ${when(e.at)} — ${(e.bundle.length / 1024).toFixed(0)} KB`),
    ...l.map((e) => `${e.id}\tlibrary\t${e.name} — ${e.host} — ${when(e.at)} — ${(e.bundle.length / 1024).toFixed(0)} KB`),
  ];
  return `# Captures (${rows.length})\n\nid\twhere\twhat\n${rows.join("\n")}\n\nCall get_capture with an id for the full bundle.`;
}

async function getCapture(id: string): Promise<string> {
  const { history = [], library = [] } = await chrome.storage.local.get(["history", "library"]);
  const hit = (history as HistoryEntry[]).find((e) => historyId(e) === id)
    ?? (library as LibraryEntry[]).find((e) => e.id === id);
  if (!hit) throw new Error(`no capture with id ${id} — call list_captures for the ids that exist`);
  return hit.bundle;
}

/** Called from the message router when a bridge-armed (or Alt-clicked) capture completes. */
export async function deliverToBridge(bundle: string, pushed = false) {
  // A pushed (Alt-click) bundle is delivered even when no pick_component is waiting.
  if (!armed && !pushed) return;
  armed = false;
  await deliver({ bundle });
}

/** One result back to the server, over the socket when there is one and HTTP otherwise. */
async function deliver(payload: { bundle?: string; error?: string }) {
  busy = false;
  chrome.action.setBadgeText({ text: "" });
  if (socket && socket.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify(payload)); return; } catch { /* fall through to HTTP */ }
  }
  try {
    await fetch(`${ENDPOINT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch { /* the agent will time out; nothing else to do */ }
}
