/**
 * Tweak a few values before capturing.
 *
 * CSS Scan sells real-time editing; VisBug is built around it. The workflow is specific: you like a
 * component but want a wider gap, a bigger radius, your brand colour — and you would rather capture
 * the version you want than capture theirs and edit the code after. Six fields, not a CSS editor.
 * Changes apply as inline styles and revert on Esc; the bundle records what was changed.
 */

import { UI } from "../core/const";

const FIELDS: { prop: string; label: string; type: "px" | "color" }[] = [
  { prop: "padding", label: "padding", type: "px" },
  { prop: "gap", label: "gap", type: "px" },
  { prop: "border-radius", label: "radius", type: "px" },
  { prop: "font-size", label: "font size", type: "px" },
  { prop: "background-color", label: "background", type: "color" },
  { prop: "color", label: "text colour", type: "color" },
];

/** The edits made to the element being captured, so the bundle can state them. Cleared per pick. */
export const edits: string[] = [];

let panel: HTMLDivElement | null = null;
let original: Record<string, string> = {};
let target: HTMLElement | null = null;

/** Toggle the edit panel for `el`. A second call (or Esc) reverts and closes. */
export function toggleEdit(el: Element | null) {
  if (panel) { revert(); return; }
  if (!(el instanceof HTMLElement)) return;
  target = el;
  original = {};
  edits.length = 0;
  const cs = getComputedStyle(el);
  panel = document.createElement("div");
  panel.setAttribute(UI, "");
  panel.style.cssText = "position:fixed;z-index:2147483647;right:12px;top:48px;width:220px;padding:10px;border-radius:8px;background:#111827;color:#fff;font:12px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)";
  panel.append(Object.assign(document.createElement("div"), { textContent: "Edit before capture (E to close)", style: "font-weight:600;margin-bottom:8px" }));
  for (const f of FIELDS) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0";
    row.append(Object.assign(document.createElement("span"), { textContent: f.label }));
    const input = document.createElement("input");
    if (f.type === "color") {
      input.type = "color";
      input.value = rgbToHex(cs.getPropertyValue(f.prop));
    } else {
      input.type = "number";
      input.value = String(Math.round(parseFloat(cs.getPropertyValue(f.prop)) || 0));
      input.style.width = "56px";
    }
    input.addEventListener("input", () => applyEdit(f.prop, f.type === "px" ? `${input.value}px` : input.value));
    row.append(input);
    panel.append(row);
  }
  document.documentElement.append(panel);
}

export function applyEdit(prop: string, value: string) {
  if (!target) return;
  if (!(prop in original)) original[prop] = target.style.getPropertyValue(prop);
  const before = getComputedStyle(target).getPropertyValue(prop);
  target.style.setProperty(prop, value);
  const idx = edits.findIndex((e) => e.startsWith(`${prop} `));
  const line = `${prop} ${before} → ${value}`;
  if (idx >= 0) edits[idx] = line; else edits.push(line);
}

/** Undo every applied edit and close the panel — the page is someone else's, left as found. */
export function revert() {
  if (target) for (const [prop, v] of Object.entries(original)) v ? target.style.setProperty(prop, v) : target.style.removeProperty(prop);
  panel?.remove();
  panel = null;
  target = null;
  original = {};
  edits.length = 0;
}

/** Keep the edits (do not revert), for when a capture starts — the bundle records them. */
export function commitEdits(): string[] {
  const made = [...edits];
  panel?.remove();
  panel = null;
  target = null;
  return made;
}

const rgbToHex = (rgb: string) => {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return "#000000";
  return "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
};
