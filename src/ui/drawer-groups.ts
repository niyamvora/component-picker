/**
 * The two drawer groups that are about settings rather than about a capture: what the next capture
 * will contain, and the extension itself. Split out of `hud.ts` so that file stays the HUD's chrome.
 */

import { el } from "./hud";
import { options, saveOptions } from "../shared/options";
import type { Options } from "../shared/types";

const DIM_ROW = "font-size:12px;color:rgba(245,245,247,.7);padding:6px 0";

const OUTPUT_TOGGLES: { key: keyof Options; label: string }[] = [
  { key: "screenshots", label: "Screenshots" }, { key: "states", label: "Interaction states" },
  { key: "themes", label: "Light/dark themes" }, { key: "a11y", label: "Accessibility" },
  { key: "tailwind", label: "Tailwind classes" }, { key: "jsx", label: "JSX component" },
  { key: "tokensJson", label: "Tokens JSON" }, { key: "fast", label: "Fast mode (no debugger)" },
  { key: "vue", label: "Vue SFC" }, { key: "svelte", label: "Svelte" },
  { key: "styled", label: "styled-components" }, { key: "cssModules", label: "CSS Modules" },
  { key: "fontFace", label: "@font-face" }, { key: "js", label: "JS / handlers" },
];

/** What the next capture will contain. The popup owns the viewport inputs; this links, never copies. */
export const mountCaptureOptions = (host: HTMLElement) => {
  for (const t of OUTPUT_TOGGLES) host.append(switchRow(t.label, Boolean(options[t.key]), (on) => { (options[t.key] as boolean) = on; saveOptions(); }));
  host.append(Object.assign(el("div", `${DIM_ROW};border-top:1px solid rgba(255,255,255,.1);margin-top:6px`), {
    textContent: `Viewports (${options.viewports?.length ?? 0}) — edit them in the toolbar popup.`,
  }));
};

/** The extension itself, rather than any one capture. */
export const mountExtension = (host: HTMLElement) => {
  host.append(switchRow("Show dock on every page", options.dockEverywhere, (on) => { options.dockEverywhere = on; saveOptions(); }));
  const bridge = Object.assign(el("div", DIM_ROW), { textContent: "MCP bridge: checking…" });
  host.append(bridge);
  void chrome.storage?.local?.get?.("bridge")?.then(({ bridge: on }) => {
    bridge.textContent = on
      ? "MCP bridge: on — Alt-click any element to send it to the agent."
      : "MCP bridge: off — turn it on from the toolbar popup.";
  }).catch(() => { bridge.textContent = "MCP bridge: unavailable."; });
  host.append(Object.assign(el("div", DIM_ROW), { textContent: "Saved library and recent picks live in the toolbar popup." }));
};


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
