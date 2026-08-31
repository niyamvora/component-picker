/**
 * The in-page HUD: a glass floating dock (bottom-center) and a right settings drawer.
 *
 * Apple-style glass — a dark translucent surface with a backdrop blur, a hairline border and a
 * soft shadow — that recedes at rest and brightens on hover, legible on light and dark pages.
 * Everything is tagged `data-cp-ui` so a capture never includes it.
 */

import { ICONS } from "./icons-ui";
import { options, saveOptions } from "../shared/options";
import type { Options } from "../shared/types";

const UI = "data-cp-ui";
const GLASS = "background:rgba(22,22,26,.55);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 32px rgba(0,0,0,.35);color:#f5f5f7";

let dock: HTMLDivElement | null = null;
let drawer: HTMLDivElement | null = null;

interface Action { icon: string; label: string; run: () => void; toggle?: () => boolean }

/** Mount the dock with the given actions. Idempotent. */
export function showDock(actions: Action[]) {
  if (dock) return;
  dock = el("div", `position:fixed;z-index:2147483646;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border-radius:16px;font:13px/1 -apple-system,system-ui,sans-serif;${GLASS}`);
  for (const a of actions) {
    const b = iconButton(a.icon, a.label);
    if (a.toggle) b.dataset.on = String(a.toggle());
    b.addEventListener("click", () => { a.run(); if (a.toggle) b.dataset.on = String(a.toggle()); });
    dock.append(b);
  }
  dock.append(divider());
  const gear = iconButton(ICONS.sliders, "Settings");
  gear.addEventListener("click", toggleDrawer);
  const close = iconButton(ICONS.x, "Hide toolbar");
  close.addEventListener("click", hideDock);
  dock.append(gear, close);
  document.documentElement.append(dock);
}

export function hideDock() {
  dock?.remove(); dock = null;
  drawer?.remove(); drawer = null;
}

const el = (tag: string, css: string) => {
  const d = document.createElement(tag) as HTMLDivElement;
  d.setAttribute(UI, "");
  d.style.cssText = css;
  return d;
};

function iconButton(icon: string, label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.setAttribute(UI, "");
  b.title = label;
  b.innerHTML = icon;
  b.style.cssText = "all:unset;display:grid;place-items:center;width:38px;height:38px;border-radius:11px;color:rgba(245,245,247,.72);cursor:pointer;transition:background .15s,color .15s,transform .15s";
  b.addEventListener("mouseenter", () => { b.style.background = "rgba(255,255,255,.12)"; b.style.color = "#fff"; b.style.transform = "translateY(-1px)"; });
  b.addEventListener("mouseleave", () => { b.style.background = b.dataset.on === "true" ? "rgba(37,99,235,.9)" : "transparent"; b.style.color = b.dataset.on === "true" ? "#fff" : "rgba(245,245,247,.72)"; b.style.transform = "none"; });
  const paint = () => { b.style.background = b.dataset.on === "true" ? "rgba(37,99,235,.9)" : "transparent"; b.style.color = b.dataset.on === "true" ? "#fff" : "rgba(245,245,247,.72)"; };
  new MutationObserver(paint).observe(b, { attributes: true, attributeFilter: ["data-on"] });
  return b;
}

const divider = () => el("div", "width:1px;height:22px;background:rgba(255,255,255,.14);margin:0 3px");

const OUTPUT_TOGGLES: { key: keyof Options; label: string }[] = [
  { key: "screenshots", label: "Screenshots" }, { key: "states", label: "Interaction states" },
  { key: "themes", label: "Light/dark themes" }, { key: "a11y", label: "Accessibility" },
  { key: "tailwind", label: "Tailwind classes" }, { key: "jsx", label: "JSX component" },
  { key: "tokensJson", label: "Tokens JSON" }, { key: "fast", label: "Fast mode (no debugger)" },
  { key: "vue", label: "Vue SFC" }, { key: "svelte", label: "Svelte" },
  { key: "styled", label: "styled-components" }, { key: "cssModules", label: "CSS Modules" },
  { key: "fontFace", label: "@font-face" }, { key: "js", label: "JS / handlers" },
];

function toggleDrawer() {
  if (drawer) { drawer.remove(); drawer = null; return; }
  drawer = el("div", `position:fixed;z-index:2147483646;right:16px;top:16px;bottom:16px;width:300px;border-radius:18px;padding:16px;overflow:auto;font:13px/1.5 -apple-system,system-ui,sans-serif;${GLASS}`);
  drawer.append(Object.assign(el("div", "font-weight:600;font-size:14px;margin-bottom:6px"), { textContent: "Component Picker" }));
  // The compare reference is global (storage.local) — shown here so it is obviously retained
  // across tabs, not lost on a switch (#73).
  const refLine = el("div", "font-size:12px;color:rgba(245,245,247,.7);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:8px");
  drawer.append(refLine);
  void chrome.storage?.session?.get?.("reference").then(({ reference }) => {
    if (reference) {
      refLine.textContent = `Comparing against ${reference.label} · ${new URL(reference.url).host}`;
      const clear = document.createElement("button");
      clear.textContent = "clear";
      clear.style.cssText = "all:unset;color:#93c5fd;cursor:pointer;margin-left:6px";
      clear.addEventListener("click", () => { void chrome.runtime.sendMessage({ type: "clear-reference" }); refLine.textContent = "No compare reference set — press R after a pick."; clear.remove(); });
      refLine.append(clear);
    } else refLine.textContent = "No compare reference set — press R after a pick.";
  });
  drawer.append(switchRow("Show dock on every page", options.dockEverywhere, (on) => { options.dockEverywhere = on; saveOptions(); }));
  for (const t of OUTPUT_TOGGLES) drawer.append(switchRow(t.label, Boolean(options[t.key]), (on) => { (options[t.key] as boolean) = on; saveOptions(); }));
  document.documentElement.append(drawer);
}

function switchRow(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = el("label", "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;cursor:pointer");
  row.append(Object.assign(document.createElement("span"), { textContent: label }));
  const track = el("span", `flex:none;width:38px;height:22px;border-radius:11px;position:relative;transition:background .18s;background:${on ? "#2563eb" : "rgba(255,255,255,.18)"}`);
  const knob = el("span", `position:absolute;top:2px;left:${on ? "18px" : "2px"};width:18px;height:18px;border-radius:50%;background:#fff;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)`);
  track.append(knob);
  row.append(track);
  row.addEventListener("click", (e) => {
    e.preventDefault();
    on = !on;
    track.style.background = on ? "#2563eb" : "rgba(255,255,255,.18)";
    knob.style.left = on ? "18px" : "2px";
    onChange(on);
  });
  return row;
}
