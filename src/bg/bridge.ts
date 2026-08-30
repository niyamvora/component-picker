/**
 * The extension side of the MCP bridge (#39).
 *
 * Off by default. When the user turns it on in the popup, the service worker polls a localhost
 * endpoint the MCP server runs; when the agent has requested a pick, the picker is armed and the
 * finished bundle is POSTed back. This is the one feature that opens a connection, so it is opt-in,
 * announced in the popup, and marked with the badge while a pick is in flight.
 */

const ENDPOINT = "http://127.0.0.1:8787";
const POLL_MS = 2000;

let armed = false; // a pick was requested by the agent and is waiting for a click

export function startBridge() {
  chrome.alarms.create("cp-bridge", { periodInMinutes: POLL_MS / 60000 });
}
export function stopBridge() {
  chrome.alarms.clear("cp-bridge");
  armed = false;
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
export async function deliverToBridge(bundle: string) {
  if (!armed) return;
  armed = false;
  chrome.action.setBadgeText({ text: "" });
  try {
    await fetch(`${ENDPOINT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundle }) });
  } catch { /* the agent will time out; nothing else to do */ }
}
