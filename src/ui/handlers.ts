/**
 * What the keys and the pointer do while the picker is armed.
 */

import { extractMany } from "../core/bundle";
import { commitEdits, revert, toggleEdit } from "./edit";
import { copyFigma, copyImage } from "./capture-extras";
import { label } from "../core/blocks";
import { UI } from "../core/const";
import { blocksOfLastPick } from "../core/state";
import { askForNote, copy } from "./note";
import { closeDrawerIfOpen, refreshDock } from "./hud";
import {
  clearMarks, clearMeasure, currentEl, drawMeasure, highlight, mark, mount, setCrumbHandler, setFrozenChrome, toast, unmark, unmount,
} from "./overlay";
import type { Message } from "../shared/types";

let active = false, frozen = false, measuring = false;
let selection: Element[] = [];
let lastXY: [number, number] | null = null, lockXY: [number, number] | null = null;

/** Sometimes the unit is "these three cards", not one element. */
function addToSelection(el: Element) {
  if (selection.includes(el)) return;
  selection.push(el);
  mark(el);
  highlight(el);
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
const pick = (e: Event): Element | null => { const t = e.composedPath()[0]; return t instanceof Element && !t.closest(`[${UI}]`) ? t : null; };
const SWALLOW = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "auxclick", "dblclick"];
const onMove = (e: PointerEvent) => {
  if (frozen) return;
  lastXY = [e.clientX, e.clientY];
  if (lockXY && Math.hypot(e.clientX - lockXY[0], e.clientY - lockXY[1]) < 8) return;
  lockXY = null;
  highlight(pick(e));
};
const onSwallow = (e: Event) => {
  if (frozen) return; // the page gets its clicks back, so menus can be opened
  if (e.target instanceof Element && e.target.closest(`[${UI}]`)) return; // the breadcrumb bar
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type !== "click" || !currentEl()) return;
  // Sometimes the unit is "these three cards", not one element.
  if ((e as MouseEvent).shiftKey) addToSelection(currentEl()!);
  else finish(currentEl()!);
};

const onKey = (e: KeyboardEvent) => {
  // One Esc dismisses one thing: the drawer if it is open, the picker otherwise.
  if (e.key === "Escape") { if (!closeDrawerIfOpen()) stop(); }
  else if (e.key === "Enter" && currentEl()) finish(currentEl()!);
  else if (e.key === "ArrowUp" && currentEl()?.parentElement && currentEl()!.parentElement !== document.documentElement) { lockXY = lastXY; highlight(currentEl()!.parentElement); }
  else if (e.key === "ArrowDown" && currentEl()?.firstElementChild) { lockXY = lastXY; highlight(currentEl()!.firstElementChild); }
  else if (e.key === "m" || e.key === "M") { measuring = !measuring; if (!measuring) clearMeasure(); else if (currentEl()) drawMeasure(currentEl()); }
    else if (e.key === "e" || e.key === "E") toggleEdit(currentEl());
    else if (e.key === "c" || e.key === "C") { const el = currentEl(); if (el) void copyImage(el); }
    else if (e.key === "g" || e.key === "G") { const el = currentEl(); if (el) void copyFigma(el); }
    else if (e.key === "f" || e.key === "F") setFrozen(!frozen);
  else if (e.key === "Backspace" && selection.length) { selection.pop(); unmark(); highlight(currentEl()); }
  else if (e.key === "p" || e.key === "P") {
    // A landing page, section by section: each one is its own component in the bundle.
    const host = document.querySelector("main") ?? document.body;
    const sections = [...host.children].filter((c) => !SKIP.has(c.tagName) && !c.closest(`[${UI}]`)).slice(0, 12);
    if (!sections.length) return;
    selection = []; clearMarks();
    for (const s of sections.slice(0, -1)) addToSelection(s);
    finish(sections[sections.length - 1]);
  }
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
};

const onScroll = () => currentEl() && highlight(currentEl());

/**
 * Freeze mode: stop swallowing clicks and stop tracking the pointer, so a menu, dropdown or modal
 * can be opened and then picked. Without it the picker eats the very click that would reveal it.
 */
function setFrozen(on: boolean) {
  frozen = on;
  setFrozenChrome(on);
}

export function start() {
  if (active) return;
  active = true;
  mount();
  setCrumbHandler((el) => { lockXY = lastXY; highlight(el); });
  window.addEventListener("pointermove", onMove as EventListener, true);
  for (const t of SWALLOW) window.addEventListener(t, onSwallow, true);
  window.addEventListener("keydown", onKey as EventListener, true);
  window.addEventListener("scroll", onScroll, true);
  chrome.runtime?.sendMessage?.({ type: "picking", on: true } satisfies Message).catch(() => {});
}

export function stop() {
  if (!active) return;
  active = false;
  unmount();
  window.removeEventListener("pointermove", onMove as EventListener, true);
  for (const t of SWALLOW) window.removeEventListener(t, onSwallow, true);
  window.removeEventListener("keydown", onKey as EventListener, true);
  window.removeEventListener("scroll", onScroll, true);
  frozen = false;
  selection = [];
  revert();
  chrome.runtime?.sendMessage?.({ type: "picking", on: false } satisfies Message).catch(() => {});
}

export const isActive = () => active;

// ---------- compare reference, as a mode rather than a key ----------
// `R` only worked while the copy toast was up, which is six seconds to notice a hint you were not
// looking for. The dock button is a mode you can see: arm it, pick the reference, and it stays lit
// while every later pick — any tab, any site — is diffed against it.
let armed = false, hasReference = false;

/** Lit when a reference is set, or while the next pick is going to become one. */
export const referenceOn = () => armed || hasReference;

/** A toast that clears itself — for dock buttons whose work leaves nothing on screen. */
export const flash = (text: string) => { const t = toast(text); setTimeout(() => t.remove(), 3500); };

/** The dock button: no reference → arm; armed → disarm; reference set → clear it. */
export function toggleReference() {
  if (hasReference) {
    chrome.runtime?.sendMessage?.({ type: "clear-reference" } satisfies Message).catch(() => {});
    hasReference = armed = false;
    flash("Compare reference cleared");
    return;
  }
  armed = !armed;
  if (!armed) { flash("Compare mode off"); return; }
  flash("Pick the component to compare against — it becomes the reference");
  start(); // arming without arming the crosshair would just be a lit button
}

const readReference = () => void chrome.storage?.session?.get?.("reference")
  ?.then(({ reference }) => { hasReference = !!reference; refreshDock(); })
  .catch(() => {});
readReference();
// The drawer can clear the reference too, and the panel can set one — one listener keeps the
// button honest whoever changed it.
chrome.storage?.onChanged?.addListener?.((changes, area) => {
  if (area === "session" && changes.reference) { hasReference = !!changes.reference.newValue; refreshDock(); }
});

async function finish(el: Element) {
  const selected = [...selection];
  stop();
  selection = selected; // stop() clears it; the capture below still needs what was picked
  const t = toast("Extracting…");
  try {
    // The capture and the note run together: the debugger work takes seconds, the typing does too.
    const made = commitEdits();
    const picks = [...selection.filter((s) => s !== el), el];
    selection = [];
    const [bundle, note] = await Promise.all([extractMany(picks, (s) => { t.textContent = s; }), askForNote(el)]);
    const editNote = made.length ? `> Edited before capture: ${made.join(", ")}` : "";
    const notes = [editNote, note ? `> Note: ${note}` : ""].filter(Boolean).join("\n");
    const full = notes ? bundle.replace(/\n/, `\n\n${notes}\n`) : bundle;
    if (window.__cp) window.__cp.last = full;
    await copy(full);
    chrome.runtime?.sendMessage?.({
      type: "remember",
      entry: { label: picks.length > 1 ? `${picks.length} components` : label(el), host: location.host, at: Date.now(), bundle: full.slice(0, 200_000) },
    } satisfies Message).catch(() => {});
    const what = picks.length > 1 ? `${picks.length} components` : label(el);
    if (armed) {
      // This pick was taken to become the reference; it still copies like any other.
      armed = false;
      hasReference = true;
      refreshDock();
      chrome.runtime?.sendMessage?.({ type: "set-reference", reference: { blocks: blocksOfLastPick(), label: label(el), url: location.href, at: Date.now() } } satisfies Message).catch(() => {});
      t.textContent = `Reference set: ${label(el)} — now pick a component anywhere to diff against it`;
    } else {
      t.textContent = `Copied ${what} — ${(full.length / 1024).toFixed(0)} KB · R to set as compare reference`;
    }
    // The reference offer is live only while the toast is: a key that silently does something
    // minutes later is worse than one that does nothing.
    const onRef = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      e.preventDefault();
      const clear = e.shiftKey;
      chrome.runtime?.sendMessage?.(clear
        ? { type: "clear-reference" }
        : { type: "set-reference", reference: { blocks: blocksOfLastPick(), label: label(el), url: location.href, at: Date.now() } } satisfies Message);
      hasReference = !clear;
      refreshDock();
      t.textContent = clear ? "Compare reference cleared" : "Reference set — the next pick will be compared against it";
    };
    window.addEventListener("keydown", onRef, true);
    setTimeout(() => { t.remove(); window.removeEventListener("keydown", onRef, true); }, 6000);
  } catch (e) {
    console.error("[Component Picker]", e);
    t.textContent = `Component Picker failed: ${e instanceof Error ? e.message : String(e)}`;
    setTimeout(() => t.remove(), 6000);
  }
}

/**
 * Alt/Option-click instant capture (#61): with the MCP bridge on, holding Alt and clicking any
 * element sends its bundle straight to the connected agent — no picker arming, no toolbar click.
 * MCP Pointer's UX. Enabled only while the bridge is on.
 */
let altOn = false;
const onAltClick = (e: MouseEvent) => {
  if (!altOn || !e.altKey) return;
  const t = e.composedPath()[0];
  if (!(t instanceof Element) || t.closest(`[${UI}]`)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const note = toast("Sent to agent");
  extractMany([t]).then((bundle) => {
    chrome.runtime?.sendMessage?.({ type: "bridge-result", bundle, pushed: true } satisfies Message).catch(() => {});
    note.textContent = `Sent ${label(t)} to agent`;
  });
};
chrome.storage?.local?.get?.("bridge").then((r) => setAlt(!!r.bridge));
chrome.storage?.onChanged?.addListener?.((c) => { if (c.bridge) setAlt(!!c.bridge.newValue); });
function setAlt(on: boolean) {
  altOn = on;
  if (on) window.addEventListener("click", onAltClick, true);
  else window.removeEventListener("click", onAltClick, true);
}

export { currentEl };
