/**
 * The toolbar popup: what a capture includes, at what viewports, and the last ten picks.
 *
 * Declaring a popup stops `chrome.action.onClicked` from firing at all, so the Pick button here
 * *is* the toolbar click — it injects the picker and closes the popup, because the picker needs
 * the page, not this window.
 */

import { DEFAULT_OPTIONS, loadOptions } from "../shared/options";
import type { HistoryEntry, Options, Reference, Viewport } from "../shared/types";

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const ago = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
};

let options: Options = DEFAULT_OPTIONS;
const save = () => chrome.storage.local.set({ options });

$<HTMLButtonElement>("#pick").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^(https?|file):/.test(tab.url || "")) {
    $("#pick").textContent = "Not a page the picker can run on";
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["picker.js"] });
  window.close();
});

function renderViewports() {
  const host = $("#viewports");
  host.textContent = "";
  options.viewports.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "vp";
    const name = document.createElement("b");
    name.textContent = v.name;
    row.append(name);
    for (const key of ["width", "height", "dpr"] as const) {
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(v[key]);
      input.title = key;
      input.addEventListener("change", () => {
        const n = Number(input.value);
        if (!Number.isFinite(n) || n <= 0) { input.value = String(options.viewports[i][key]); return; }
        (options.viewports[i][key] as number) = n;
        save();
      });
      row.append(input);
      if (key !== "dpr") row.append(document.createTextNode("×"));
    }
    row.append(document.createTextNode("dpr"));
    host.append(row);
  });
}

async function renderReference() {
  const host = $("#reference");
  host.textContent = "";
  const { reference } = await chrome.storage.local.get("reference");
  const ref = reference as Reference | undefined;
  if (!ref) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "None. Press R while the copy toast is up to set the last pick as the reference.";
    host.append(p);
    return;
  }
  const row = document.createElement("div");
  row.className = "row";
  const what = document.createElement("span");
  what.textContent = `${ref.label} — ${new URL(ref.url).host}`;
  const clear = document.createElement("button");
  clear.className = "link";
  clear.textContent = "clear";
  clear.addEventListener("click", async () => { await chrome.storage.local.remove("reference"); renderReference(); });
  row.append(what, clear);
  host.append(row);
}

async function renderHistory() {
  const host = $("#history");
  host.textContent = "";
  const { history = [] } = await chrome.storage.local.get("history");
  const entries = history as HistoryEntry[];
  if (!entries.length) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "Nothing picked yet.";
    host.append(p);
    return;
  }
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "row";
    const what = document.createElement("span");
    what.textContent = `${e.label} — ${e.host}`;
    const when = document.createElement("time");
    when.textContent = ago(e.at);
    const again = document.createElement("button");
    again.className = "link";
    again.textContent = "copy";
    again.addEventListener("click", async () => {
      await navigator.clipboard.writeText(e.bundle);
      again.textContent = "copied";
      setTimeout(() => (again.textContent = "copy"), 1500);
    });
    row.append(what, when, again);
    host.append(row);
  }
}

async function init() {
  options = (await loadOptions()) ?? DEFAULT_OPTIONS;
  for (const box of document.querySelectorAll<HTMLInputElement>("input[data-opt]")) {
    const key = box.dataset.opt as keyof Options;
    box.checked = Boolean(options[key]);
    box.addEventListener("change", () => {
      (options[key] as boolean) = box.checked;
      save();
    });
  }
  const inv = $<HTMLTextAreaElement>("#inventory");
  const { inventory = "" } = await chrome.storage.local.get("inventory");
  inv.value = inventory as string;
  inv.addEventListener("input", () => chrome.storage.local.set({ inventory: inv.value }));
  const bridge = $<HTMLInputElement>("#bridge");
  const { bridge: bridgeOn = false } = await chrome.storage.local.get("bridge");
  bridge.checked = Boolean(bridgeOn);
  bridge.addEventListener("change", async () => {
    // The localhost host permission is requested only when the bridge is switched on.
    if (bridge.checked) { const ok = await chrome.permissions.request({ origins: ["http://127.0.0.1/*"] }); if (!ok) { bridge.checked = false; return; } }
    chrome.runtime.sendMessage({ type: "bridge", on: bridge.checked });
  });
  renderViewports();
  await Promise.all([renderReference(), renderHistory()]);
}

void init();

// Keeps the two Viewport keys the editor writes honest against the type.
export type _EditableViewportKeys = Extract<keyof Viewport, "width" | "height" | "dpr">;
