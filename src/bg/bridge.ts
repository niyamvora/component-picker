/**
 * The extension side of the MCP bridge (#39).
 *
 * Off by default. When the user turns it on in the popup, the service worker polls a localhost
 * endpoint the MCP server runs; when the agent has requested a pick, the picker is armed and the
 * finished bundle is POSTed back. This is the one feature that opens a connection, so it is opt-in,
 * announced in the popup, and marked with the badge while a pick is in flight.
 */

const ENDPOINT = "http://127.0.0.1:8787";
const WS_ENDPOINT = "ws://127.0.0.1:8787";
const POLL_MS = 2000;

let armed = false; // a pick was requested by the agent and is waiting for a click
let socket: WebSocket | null = null;

export function startBridge() {
  connectSocket();               // real-time path
  chrome.alarms.create("cp-bridge", { periodInMinutes: POLL_MS / 60000 }); // fallback poll
}
export function stopBridge() {
  chrome.alarms.clear("cp-bridge");
  socket?.close();
  socket = null;
  armed = false;
}

/** One socket to the MCP server; a pushed "pick" arms the picker. Reconnects on drop. */
function connectSocket() {
  try {
    socket = new WebSocket(WS_ENDPOINT);
    socket.onmessage = (e) => { try { if (JSON.parse(e.data).type === "pick") void armPick(); } catch { /* ignore */ } };
    socket.onclose = () => { socket = null; };
  } catch { socket = null; }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cp-bridge" || armed) return;
  try {
    const r = await fetch(`${ENDPOINT}/next`, { signal: AbortSignal.timeout(1500) });
    const { pick } = await r.json();
    if (pick) await armPick();
  } catch { /* server not running; try again next tick */ }
});

async function armPick() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  armed = true;
  chrome.action.setBadgeText({ text: "MCP" });
  // The picker routes the finished bundle here when armed by the bridge.
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { (window as any).__cpBridge = true; } });
}

/** Called from the message router when a bridge-armed capture completes. */
export async function deliverToBridge(bundle: string, pushed = false) {
  // A pushed (Alt-click) bundle is delivered even when no pick_component is waiting.
  if (!armed && !pushed) return;
  armed = false;
  chrome.action.setBadgeText({ text: "" });
  if (socket && socket.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ bundle })); return; } catch { /* fall through to HTTP */ }
  }
  try {
    await fetch(`${ENDPOINT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundle }) });
  } catch { /* the agent will time out; nothing else to do */ }
}
