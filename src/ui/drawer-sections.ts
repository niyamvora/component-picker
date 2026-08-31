/**
 * The drawer's section list: one row per part of the last capture (#80), each with a checkbox that
 * decides whether it lands in the copy and a caret that shows what is actually inside it.
 *
 * "CSS" is a promise until you can see the 40 KB behind it, so every row can be opened in place.
 */

import { el } from "./hud";
import { state } from "../core/state";
import type { CaptureSection } from "../shared/types";

const DIM = "rgba(245,245,247,.7)";
const HAIRLINE = "1px solid rgba(255,255,255,.1)";
/** What a capture is usually wanted for; everything else is opt-in. */
export const DEFAULT_SELECTION = ["html", "css"];

/** The selection the rows mutate — module scope, so it survives the drawer being closed. */
const selected = new Set<string>(DEFAULT_SELECTION);

/** Fill the drawer's section area. Async because the last capture may have happened in another frame. */
export async function mountSections(host: HTMLElement) {
  const sections = await lastSections();
  host.append(Object.assign(el("div", `font-weight:600;padding:8px 0;border-bottom:${HAIRLINE}`), {
    textContent: "Sections of the last capture",
  }));
  if (!sections.length) {
    host.append(Object.assign(el("div", `font-size:12px;color:${DIM};padding:8px 0`), {
      textContent: "Pick a component first — its sections appear here.",
    }));
    return;
  }
  host.append(...sectionRows(sections, selected, () => {}));
}

/**
 * One row per section: a checkbox, the title, its weight, and a caret that expands the real body.
 * Pure — it reads and writes the `selected` set it is handed and touches nothing else, which is
 * what lets the self-check drive it with a fake list.
 */
export function sectionRows(sections: CaptureSection[], picked: Set<string>, onChange: () => void): HTMLElement[] {
  return sections.map((s) => {
    const wrap = el("div", `border-bottom:${HAIRLINE}`);
    const row = el("div", "display:flex;align-items:center;gap:8px;padding:7px 0;cursor:pointer");
    const box = el("span", "flex:none;width:16px;height:16px;border-radius:4px;display:grid;place-items:center;font-size:11px;line-height:1;color:#fff");
    const paint = () => {
      const on = picked.has(s.id);
      box.style.background = on ? "#2563eb" : "transparent";
      box.style.border = on ? "1px solid #2563eb" : "1px solid rgba(255,255,255,.25)";
      box.textContent = on ? "✓" : "";
    };
    paint();
    const name = Object.assign(el("span", "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"), { textContent: s.title, title: s.title });
    const size = Object.assign(el("span", `flex:none;font-size:11px;color:${DIM}`), { textContent: weigh(s.body) });
    const caret = Object.assign(el("button", `all:unset;flex:none;width:16px;text-align:center;color:${DIM};cursor:pointer`), { textContent: "▸", title: `Show ${s.title}` });
    const body = el("pre", "display:none;margin:0 0 8px;padding:8px;border-radius:8px;background:rgba(0,0,0,.3);font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:200px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(245,245,247,.85)");
    body.textContent = s.body;
    row.append(box, name, size, caret);
    wrap.append(row, body);
    row.addEventListener("click", () => {
      if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id);
      paint();
      onChange();
    });
    caret.addEventListener("click", (e) => {
      e.stopPropagation(); // the caret shows the section; it does not tick it
      const open = body.style.display === "none";
      body.style.display = open ? "block" : "none";
      caret.textContent = open ? "▾" : "▸";
    });
    return wrap;
  });
}

/**
 * The last capture's parts. The pick usually happened in this very frame, so the in-page state is
 * both the freshest and the cheapest source; storage is what covers a pick made inside an iframe.
 */
async function lastSections(): Promise<CaptureSection[]> {
  if (state.lastSections.length) return state.lastSections;
  try {
    const { sections } = await chrome.storage.session.get("sections");
    return (sections as CaptureSection[] | undefined) ?? [];
  } catch {
    return [];
  }
}

const weigh = (body: string) => (body.length < 1024 ? `${body.length} B` : `${Math.round(body.length / 1024)} KB`);
