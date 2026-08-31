/**
 * The side panel: the extension's whole surface, beside the page it is about.
 *
 * There used to be a toolbar popup as well, which meant the settings that shape a capture lived in
 * a window that closes the moment you click the page — the one thing you always do next. Clicking
 * the toolbar icon now shows the in-page dock and opens this panel, and everything lives here.
 *
 * The preview renders the captured HTML and CSS in a sandboxed iframe with nothing else on the
 * page, so what you see is exactly what the bundle carries. Anything that only looked right because
 * the real site's stylesheet was still loaded shows up here as wrong, which is the entire point.
 */

import { DEFAULT_OPTIONS, loadOptions } from "../shared/options";
import type { HistoryEntry, LibraryEntry, Options, Preview, Reference, Viewport } from "../shared/types";

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const ago = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
};

let options: Options = DEFAULT_OPTIONS;
const save = () => chrome.storage.local.set({ options });
let preview: Preview | null = null;

// ---------- the pick button ----------

$<HTMLButtonElement>("#pick").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#pick");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^(https?|file):/.test(tab.url || "")) {
    btn.textContent = "Not a page the picker can run on";
    setTimeout(() => (btn.textContent = "Pick on this page"), 2000);
    return;
  }
  // The dock is usually already there (a content script on every page). Ask it to start picking;
  // if nothing answers — a restricted page, or the script was injected before this tab loaded —
  // inject and ask again.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "start-pick" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["picker.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "start-pick" }).catch(() => {});
  }
});

// ---------- last capture ----------

function render() {
  const stage = $("#stage");
  stage.textContent = "";
  if (!preview) {
    stage.append(Object.assign(document.createElement("div"), { className: "empty", textContent: "Pick a component and its rendering appears here." }));
    return;
  }
  const width = Number($<HTMLSelectElement>("#width").value);
  const frame = document.createElement("iframe");
  // Same-origin is never granted: the captured markup is a stranger's, and it renders with no
  // script execution at all.
  frame.setAttribute("sandbox", "");
  frame.style.width = width ? `${width}px` : "100%";
  frame.style.height = `${Math.min(Math.max(preview.height + 40, 120), 900)}px`;
  frame.srcdoc = `<!doctype html><meta charset="utf-8">${preview.fontLinks.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}` +
    `<style>body{margin:8px;font:14px/1.4 system-ui}\n${preview.css}</style>${preview.html}`;
  stage.append(frame);

  const shot = $<HTMLImageElement>("#shot");
  shot.hidden = !preview.shot;
  if (preview.shot) shot.src = `data:image/png;base64,${preview.shot}`;
}

$("#width").addEventListener("change", render);

$("#assets").addEventListener("click", async () => {
  const btn = $("#assets");
  btn.textContent = "Collecting…";
  const res = await chrome.runtime.sendMessage({ type: "assets" }).catch(() => null);
  if (res?.dataUrl) {
    const a = document.createElement("a");
    a.href = res.dataUrl;
    a.download = "component-assets.zip";
    a.click();
    btn.textContent = `${res.count} assets`;
  } else {
    btn.textContent = "No assets / failed";
  }
  setTimeout(() => (btn.textContent = "Download assets"), 2500);
});

$("#copy").addEventListener("click", async () => {
  if (!preview) return;
  await navigator.clipboard.writeText(preview.bundle);
  $("#copy").textContent = "Copied";
  setTimeout(() => ($("#copy").textContent = "Copy bundle"), 1500);
});

// ---------- lists ----------

function renderViewports() {
  const host = $("#viewports");
  host.textContent = "";
  options.viewports.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "vp";
    row.append(Object.assign(document.createElement("b"), { textContent: v.name }));
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

const emptyLine = (text: string) => Object.assign(document.createElement("div"), { className: "empty", textContent: text });

async function renderReference() {
  const host = $("#reference");
  host.textContent = "";
  // Session-scoped since 1.7: a reference set and forgotten used to attach itself to every later
  // capture forever. Reading `local` here quietly showed "none" for a reference that was set.
  const { reference } = await chrome.storage.session.get("reference");
  const ref = reference as Reference | undefined;
  if (!ref) {
    host.append(emptyLine("None set. Compare diffs a later capture against an earlier one — how someone else built it versus how you did."));
    host.append(emptyLine("1. Click the compare button in the page dock (it lights up). 2. Pick the component to measure against. 3. Go anywhere, even another site, and pick again — that capture carries the differences."));
    return;
  }
  const row = document.createElement("div");
  row.className = "row";
  const what = Object.assign(document.createElement("span"), { textContent: `${ref.label} — ${new URL(ref.url).host}` });
  const clear = Object.assign(document.createElement("button"), { className: "link", textContent: "clear" });
  clear.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "clear-reference" }); renderReference(); });
  row.append(what, clear);
  host.append(row);
  host.append(emptyLine("Every capture from now on — any tab, any site — carries a “Compared with reference” section. Lasts until you clear it or close the browser."));
}

async function renderHistory() {
  const host = $("#history");
  host.textContent = "";
  const { history = [] } = await chrome.storage.local.get("history");
  const entries = history as HistoryEntry[];
  if (!entries.length) { host.append(emptyLine("Nothing picked yet.")); return; }
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "row";
    const what = Object.assign(document.createElement("span"), { textContent: `${e.label} — ${e.host}` });
    const when = Object.assign(document.createElement("time"), { textContent: ago(e.at) });
    const again = Object.assign(document.createElement("button"), { className: "link", textContent: "copy" });
    again.addEventListener("click", async () => {
      await navigator.clipboard.writeText(e.bundle);
      again.textContent = "copied";
      setTimeout(() => (again.textContent = "copy"), 1500);
    });
    row.append(what, when, again);
    host.append(row);
  }
}

async function renderLibrary() {
  const host = $("#library");
  host.textContent = "";
  const { library = [] } = await chrome.storage.local.get("library");
  const entries = library as LibraryEntry[];
  if (!entries.length) { host.append(emptyLine("Empty. Save a pick with + save latest.")); return; }
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "row";
    if (e.thumb) {
      const img = document.createElement("img");
      img.src = e.thumb;
      img.style.cssText = "width:28px;height:20px;object-fit:cover;border-radius:3px;flex:none";
      row.append(img);
    }
    const what = Object.assign(document.createElement("span"), { textContent: `${e.name} — ${e.host}` });
    const copy = Object.assign(document.createElement("button"), { className: "link", textContent: "copy" });
    copy.addEventListener("click", async () => { await navigator.clipboard.writeText(e.bundle); copy.textContent = "copied"; setTimeout(() => (copy.textContent = "copy"), 1500); });
    const del = Object.assign(document.createElement("button"), { className: "link", textContent: "×", title: "delete" });
    del.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "delete-from-library", id: e.id }); renderLibrary(); });
    row.append(what, copy, del);
    host.append(row);
  }
}

$<HTMLButtonElement>("#save-latest").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "save-last-to-library" });
  renderLibrary();
});

// ---------- wiring ----------

chrome.runtime.onMessage.addListener((msg: { type: string; preview?: Preview }) => {
  if (msg.type !== "preview" || !msg.preview) return;
  preview = msg.preview;
  render();
  // A capture also adds a history entry and may change what the library's thumbnail would be.
  void renderHistory();
  void renderReference();
});

async function init() {
  options = (await loadOptions()) ?? DEFAULT_OPTIONS;
  for (const box of document.querySelectorAll<HTMLInputElement>("input[data-opt]")) {
    const key = box.dataset.opt as keyof Options;
    box.checked = Boolean(options[key]);
    box.addEventListener("change", () => { (options[key] as boolean) = box.checked; save(); });
  }
  const inv = $<HTMLTextAreaElement>("#inventory");
  const { inventory = "" } = await chrome.storage.local.get("inventory");
  inv.value = inventory as string;
  inv.addEventListener("input", () => chrome.storage.local.set({ inventory: inv.value }));
  const bridge = $<HTMLInputElement>("#bridge");
  const { bridge: bridgeOn = false } = await chrome.storage.local.get("bridge");
  bridge.checked = Boolean(bridgeOn);
  // `<all_urls>` already covers 127.0.0.1, so there is no optional permission left to ask for.
  bridge.addEventListener("change", () => chrome.runtime.sendMessage({ type: "bridge", on: bridge.checked }));
  renderViewports();
  // A panel opened after a capture would otherwise be blank until the next one.
  const { preview: stored } = await chrome.storage.local.get("preview");
  if (stored && !preview) preview = stored as Preview;
  render();
  await Promise.all([renderReference(), renderHistory(), renderLibrary()]);
}

void init();

// Keeps the two Viewport keys the editor writes honest against the type.
export type _EditableViewportKeys = Extract<keyof Viewport, "width" | "height" | "dpr">;
