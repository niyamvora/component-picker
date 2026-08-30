/**
 * Everything the picker draws on the page: the outline, the box-model bands, the breadcrumb bar,
 * the banner and the toasts. All of it is tagged `data-cp-ui` so a capture can never include it.
 */

import { label } from "../core/blocks";
import { UI } from "../core/const";

let current: Element | null = null;
export const currentEl = () => current;
let box!: HTMLDivElement, tip!: HTMLDivElement, banner!: HTMLDivElement, crumbs!: HTMLDivElement, cursorStyle!: HTMLStyleElement;
/** Eight bands: padding top/bottom/left/right, then margin. */
let bands: HTMLDivElement[] = [];
let marks: HTMLDivElement[] = [];
export const BANNER = "Component Picker — click/Enter copies · shift-click adds · ↑↓ parent/child · P whole page · F freeze · Esc exit";
export const PILL = "position:fixed;z-index:2147483647;pointer-events:none;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#fff;background:#111827;padding:4px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;";

export function toast(text: string): HTMLDivElement {
  const t = document.createElement("div");
  t.setAttribute(UI, "");
  t.style.cssText = PILL + "left:50%;bottom:24px;transform:translateX(-50%);font-size:13px;padding:8px 14px;background:#2563eb";
  t.textContent = text;
  document.body.append(t);
  return t;
}

/**
 * The box model, drawn the way DevTools draws it: content blue, padding green, margin orange.
 *
 * A single outline says where an element ends but not where its own space stops and its
 * spacing begins — which is exactly the question when rebuilding someone else's layout.
 */
const BAND = { padding: "rgba(16,185,129,.22)", margin: "rgba(245,158,11,.20)" };
function drawBoxModel(el: Element) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const px = (p: string) => parseFloat(cs.getPropertyValue(p)) || 0;
  let n = 0;
  for (const [kind, sign] of [["padding", 1], ["margin", -1]] as const) {
    const [t, rt, b, l] = ["top", "right", "bottom", "left"].map((s) => px(`${kind}-${s}`));
    // Padding bands sit inside the border box, margin bands outside it.
    const outer = { x: r.left - (sign < 0 ? l : 0), y: r.top - (sign < 0 ? t : 0), w: r.width + (sign < 0 ? l + rt : 0), h: r.height + (sign < 0 ? t + b : 0) };
    const inset = sign < 0 ? { t, r: rt, b, l } : { t, r: rt, b, l };
    const parts = [
      { x: outer.x, y: outer.y, w: outer.w, h: inset.t },
      { x: outer.x, y: outer.y + outer.h - inset.b, w: outer.w, h: inset.b },
      { x: outer.x, y: outer.y + inset.t, w: inset.l, h: outer.h - inset.t - inset.b },
      { x: outer.x + outer.w - inset.r, y: outer.y + inset.t, w: inset.r, h: outer.h - inset.t - inset.b },
    ];
    for (const p of parts) {
      const band = bands[n++];
      if (p.w <= 0 || p.h <= 0) { band.style.display = "none"; continue; }
      band.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;background:${BAND[kind]}`;
    }
  }
}

/** `main › section.pricing › div.card › button` — clickable, because ↑/↓ alone is slow. */
function drawCrumbs(el: Element) {
  const chain: Element[] = [];
  for (let a: Element | null = el; a && a !== document.body && chain.length < 8; a = a.parentElement) chain.unshift(a);
  crumbs.textContent = "";
  chain.forEach((a, i) => {
    if (i) crumbs.append(Object.assign(document.createElement("span"), { textContent: " › ", style: "opacity:.5" }));
    const b = document.createElement("button");
    b.textContent = label(a);
    b.style.cssText = `all:unset;cursor:pointer;padding:1px 4px;border-radius:4px;${a === el ? "background:#2563eb" : ""}`;
    b.addEventListener("mouseenter", () => highlight(a));
    // The handler is injected by the picker, which owns the pointer-lock state.
    b.addEventListener("click", (e) => { e.stopPropagation(); onCrumbPick(a); });
    crumbs.append(b);
  });
}

export function highlight(el: Element | null): void {
  current = el;
  if (!el) {
    box.style.display = "none";
    tip.style.display = "none";
    for (const b of bands) b.style.display = "none";
    crumbs.textContent = "";
    return;
  }
  const r = el.getBoundingClientRect();
  box.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #2563eb;outline-offset:-1px;background:rgba(37,99,235,.10)`;
  drawBoxModel(el);
  drawCrumbs(el);
  const extra = marks.length ? `  ·  ${marks.length} selected` : "";
  tip.textContent = `${label(el)}  ${Math.round(r.width)}×${Math.round(r.height)}${extra}`;
  tip.style.cssText = PILL + `left:${Math.max(4, r.left)}px;top:${r.top > 30 ? r.top - 26 : r.bottom + 4}px`;
}


/** Build the overlay. Returns nothing; `unmount()` takes it all away again. */
export function mount() {
  const el = (css: string) => {
    const d = document.createElement("div");
    d.setAttribute(UI, "");
    d.style.cssText = css;
    document.documentElement.append(d);
    return d;
  };
  box = el("");
  tip = el("display:none");
  banner = el(PILL + "left:50%;top:12px;transform:translateX(-50%);pointer-events:none");
  bands = Array.from({ length: 8 }, () => el("display:none"));
  // The one piece of picker chrome that takes clicks: a breadcrumb you cannot click is a label.
  crumbs = el(PILL + "left:50%;bottom:12px;transform:translateX(-50%);pointer-events:auto;padding:5px 9px;max-width:96vw");
  banner.textContent = BANNER;
  cursorStyle = document.createElement("style");
  cursorStyle.setAttribute(UI, "");
  document.documentElement.append(cursorStyle);
  cursorStyle.sheet!.insertRule("* { cursor: crosshair !important }");
}

export function unmount() {
  for (const el of [box, tip, banner, crumbs, cursorStyle, ...bands, ...marks]) el?.remove();
  bands = [];
  marks = [];
  current = null;
}

/** Freeze mode's amber banner and normal cursor, or back to picking. */
export function setFrozenChrome(on: boolean) {
  banner.textContent = on ? "FROZEN — open the menu you want, then press F to resume picking" : BANNER;
  banner.style.background = on ? "#b45309" : "#111827";
  cursorStyle.sheet!.deleteRule(0);
  cursorStyle.sheet!.insertRule(on ? "* { cursor: auto }" : "* { cursor: crosshair !important }");
  if (on) highlight(null);
}

/** A green outline that stays put, so you can see what is already in the selection. */
export function mark(el: Element) {
  const r = el.getBoundingClientRect();
  const m = document.createElement("div");
  m.setAttribute(UI, "");
  m.style.cssText = `position:fixed;z-index:2147483644;pointer-events:none;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #16a34a;background:rgba(22,163,74,.10)`;
  document.documentElement.append(m);
  marks.push(m);
}

export const unmark = () => marks.pop()?.remove();
export const clearMarks = () => marks.splice(0).forEach((m) => m.remove());

/** Let the crumb buttons drive selection without importing the picker (which imports us). */
export let onCrumbPick: (el: Element) => void = highlight;
export const setCrumbHandler = (fn: (el: Element) => void) => { onCrumbPick = fn; };
