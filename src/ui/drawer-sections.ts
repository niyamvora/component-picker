/**
 * The drawer's section list: one row per part of the last capture (#80), each with a checkbox that
 * decides whether it lands in the copy and a caret that shows what is actually inside it.
 *
 * "CSS" is a promise until you can see the 40 KB behind it, so every row can be opened in place.
 */

import { el } from "./hud";
import { copy } from "./note";
import { visualise } from "./viz";
import { state } from "../core/state";
import type { CaptureSection } from "../shared/types";

const DIM = "rgba(245,245,247,.7)";
const HAIRLINE = "1px solid rgba(255,255,255,.1)";
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
/** What a capture is usually wanted for; everything else is opt-in. */
export const DEFAULT_SELECTION = ["html", "css"];

/** The selection the rows mutate — module scope, so it survives the drawer being closed. */
const selected = new Set<string>(DEFAULT_SELECTION);

/** Is there a capture to show? Synchronous, so the drawer can pick its default group as it builds. */
export const haveCapture = () => state.lastSections.length > 0;

/** A one-line dim note. Every group says what it would hold rather than rendering a blank void. */
export const hint = (text: string) => Object.assign(el("div", `font-size:12px;color:${DIM};padding:6px 0`), { textContent: text });

/**
 * A collapsible drawer group whose body is built on first expand.
 *
 * Lazy on purpose: Design renders swatches, specimens and an SVG curve per animation for a whole
 * capture, and a drawer that pays for all four groups every time it opens is one nobody leaves open.
 */
export function group(title: string, mount: (host: HTMLElement) => void, onOpen?: () => void) {
  const node = el("div", "");
  const header = el("button", `all:unset;display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:9px 0;cursor:pointer;font:600 13px/1.5 -apple-system,system-ui,sans-serif;border-bottom:${HAIRLINE}`);
  const caret = Object.assign(el("span", `flex:none;width:12px;color:${DIM}`), { textContent: "▸" });
  header.append(caret, Object.assign(el("span", "flex:1"), { textContent: title }));
  // Set up front, not just on the first toggle: a collapsed group has to announce that it collapses.
  header.setAttribute("aria-expanded", "false");
  const body = el("div", "display:none;padding:2px 0 10px");
  node.append(header, body);
  let open = false, built = false;
  const setOpen = (on: boolean) => {
    open = on;
    // Shown before it is built, so anything measuring itself on mount measures a laid-out box.
    body.style.display = on ? "block" : "none";
    if (on && !built) { built = true; mount(body); }
    caret.textContent = on ? "▾" : "▸";
    header.setAttribute("aria-expanded", String(on));
  };
  header.addEventListener("click", () => { setOpen(!open); if (open) onOpen?.(); });
  return { title, node, setOpen, isOpen: () => open };
}

/** The sections that have a visual form, in the order a designer reads them. */
const DESIGN_ORDER = ["palette", "tokens", "fonts", "animations"];

/** The Design group: the capture drawn — colours, tokens, type, motion (#84, regrouped by #93). */
export async function mountDesign(host: HTMLElement) {
  const sections = await lastSections();
  if (!sections.length) return void host.append(hint("Pick a component first — its colours, type and motion appear here."));
  let drawn = 0;
  for (const id of DESIGN_ORDER) {
    const s = sections.find((x) => x.id === id);
    const node = s && visualise(s);
    if (!s || !node) continue;
    drawn++;
    host.append(Object.assign(el("div", `font-size:11px;color:${DIM};padding:8px 0 0`), { textContent: s.title }), capped(node));
  }
  if (!drawn) host.append(hint("This capture has no colours, type or motion to draw."));
}

/**
 * The same 200px cap a section body gets, for a visualization that could be forty token rows.
 * The fade goes on only when the content really is taller — a fade over content that has already
 * ended is a lie about there being more.
 */
function capped(node: HTMLElement): HTMLElement {
  const box = el("div", "max-height:200px;overflow:auto;scrollbar-width:thin");
  box.append(node);
  requestAnimationFrame(() => {
    const fade = box.scrollHeight > box.clientHeight ? FADE : "";
    box.style.setProperty("mask-image", fade);
    box.style.setProperty("-webkit-mask-image", fade);
  });
  return box;
}

/** Fill the drawer's section area. Async because the last capture may have happened in another frame. */
export async function mountSections(host: HTMLElement) {
  const sections = await lastSections();
  if (!sections.length) {
    host.append(hint("Pick a component first — its sections appear here."));
    return;
  }
  let store = await loadStore();
  // Ids are stable but captures differ: what this site wanted last time, minus anything this
  // capture does not have. A section that is simply absent is not worth saying anything about.
  const wanted = recallSelection(location.host, store) ?? DEFAULT_SELECTION;
  selected.clear();
  for (const s of sections) if (wanted.includes(s.id)) selected.add(s.id);

  // The output box comes first: what you are about to copy, then the switches that decide it.
  const { box, refresh } = copyBox(sections, () => [...selected]);
  const rows = el("div", "");
  const changed = () => {
    refresh();
    store = rememberSelection(location.host, [...selected], store);
    void chrome.storage?.local?.set?.({ sectionSelection: store });
  };
  const draw = () => rows.replaceChildren(...sectionRows(sections, selected, changed));
  const setAll = (ids: string[]) => {
    selected.clear();
    for (const id of ids) selected.add(id);
    draw(); // the rows paint their own checkbox, so a bulk change redraws them
    changed();
  };
  draw();
  host.append(box, heading(() => setAll(sections.map((s) => s.id)), () => setAll([])), rows);
}

/** The "Sections" heading, with the two bulk actions that save ticking eight boxes every pick. */
function heading(all: () => void, none: () => void): HTMLElement {
  const row = el("div", `display:flex;align-items:center;gap:6px;font-weight:600;padding:8px 0;border-bottom:${HAIRLINE}`);
  row.append(
    Object.assign(el("span", "flex:1"), { textContent: "Sections of the last capture" }),
    linkButton("all", all),
    Object.assign(el("span", `color:${DIM};font-size:12px`), { textContent: "·" }),
    linkButton("none", none),
  );
  return row;
}

/**
 * The prompt, a live view of what a copy would produce, and the button that produces it.
 *
 * The preview is the whole point: "copy only the HTML" is a promise you should be able to check
 * before you paste, so the box shows the assembled text as the checkboxes and the prompt change.
 */
export function copyBox(sections: CaptureSection[], getSelected: () => string[]): { box: HTMLElement; refresh: () => void } {
  const box = el("div", "padding-bottom:8px");
  const prompt = el("input", `width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:${HAIRLINE};background:rgba(0,0,0,.25);color:#f5f5f7;font:13px/1.4 -apple-system,system-ui,sans-serif;outline:none`);
  prompt.placeholder = "Prompt — e.g. rebuild this as a React component";
  const out = el("pre", `margin:8px 0;padding:8px;border-radius:8px;background:rgba(0,0,0,.3);font:11px/1.45 ${MONO};max-height:160px;overflow:auto;scrollbar-width:thin;white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(245,245,247,.85)`);
  const button = el("button", "all:unset;display:block;width:100%;box-sizing:border-box;text-align:center;padding:8px 0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600");
  const status = el("div", `font-size:11px;color:${DIM};min-height:15px;padding-top:4px;text-align:center`);
  box.append(prompt, out, button, status);

  const refresh = () => {
    const ids = new Set(getSelected());
    const count = sections.filter((s) => ids.has(s.id)).length;
    const text = assembleSelection(prompt.value, sections, [...ids]);
    // A preview, not the full render: 2000 chars is enough to see which sections came along.
    const head = text.slice(0, 2000);
    out.textContent = head + (text.length > head.length ? `\n… (+${Math.max(1, Math.round((text.length - head.length) / 1024))} KB)` : "");
    button.textContent = count ? `Copy selected · ${(text.length / 1024).toFixed(1)} KB` : "Select at least one section";
    button.disabled = !count;
    button.style.opacity = count ? "1" : ".45";
    button.style.cursor = count ? "pointer" : "default";
    const fade = out.scrollHeight > out.clientHeight ? FADE : "";
    out.style.setProperty("mask-image", fade);
    out.style.setProperty("-webkit-mask-image", fade);
  };

  prompt.addEventListener("input", () => {
    refresh();
    void chrome.storage?.local?.set?.({ copyPrompt: prompt.value });
  });
  // Keystrokes must not reach the page — the drawer opens over sites with their own hotkeys.
  prompt.addEventListener("keydown", (e) => e.stopPropagation());
  button.addEventListener("click", () => {
    const ids = new Set(getSelected());
    const count = sections.filter((s) => ids.has(s.id)).length;
    if (!count) return;
    const text = assembleSelection(prompt.value, sections, [...ids]);
    void copy(text).then(() => {
      status.textContent = `Copied ${count} section${count === 1 ? "" : "s"} · ${(text.length / 1024).toFixed(1)} KB`;
      setTimeout(() => { status.textContent = ""; }, 3000);
    });
  });
  refresh();
  // The last prompt outlives the drawer: it is usually the same request on the next component too.
  void chrome.storage?.local?.get?.("copyPrompt")?.then(({ copyPrompt }) => {
    if (typeof copyPrompt === "string" && copyPrompt) { prompt.value = copyPrompt; refresh(); }
  }).catch(() => {});
  return { box, refresh };
}

/**
 * The prompt and the ticked sections, in capture order — never in the order the boxes were clicked,
 * because a bundle whose HTML follows its CSS reads as a different document.
 */
export function assembleSelection(prompt: string, sections: CaptureSection[], selectedIds: string[]): string {
  const ids = new Set(selectedIds);
  return [prompt.trim(), ...sections.filter((s) => ids.has(s.id)).map((s) => s.body)].filter(Boolean).join("\n\n");
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
    const body = el("pre", `display:none;margin:0 0 8px;padding:8px;border-radius:8px;background:rgba(0,0,0,.3);font:11px/1.45 ${MONO};max-height:200px;overflow:auto;scrollbar-width:thin;white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(245,245,247,.85)`);
    body.textContent = s.body;
    row.append(box, name, size, caret);
    wrap.append(row, body);
    row.addEventListener("click", () => {
      if (picked.has(s.id)) picked.delete(s.id); else picked.add(s.id);
      paint();
      onChange();
    });
    let open = false;
    caret.addEventListener("click", (e) => {
      e.stopPropagation(); // the caret shows the section; it does not tick it
      open = !open;
      caret.textContent = open ? "▾" : "▸";
      body.style.display = open ? "block" : "none";
      // Fade the cut edge only when the body really is taller than its cap — a fade over content
      // that has already ended is a lie about there being more.
      const fade = open && body.scrollHeight > body.clientHeight ? FADE : "";
      body.style.setProperty("mask-image", fade);
      body.style.setProperty("-webkit-mask-image", fade);
    });
    return wrap;
  });
}

const FADE = "linear-gradient(to bottom,#000 calc(100% - 18px),transparent)";

/** The drawer's text button — `all`, `none`, `text`. The one link style the popup already uses. */
function linkButton(text: string, run: () => void): HTMLButtonElement {
  const b = Object.assign(el("button", "all:unset;flex:none;color:#93c5fd;cursor:pointer;font-weight:400;font-size:11px"), { textContent: text });
  b.addEventListener("click", (e) => { e.stopPropagation(); run(); });
  return b;
}

/**
 * Which sections a site was last copied with, newest last (#83).
 *
 * The selection you want on a docs site is not the one you want on a marketing page, and re-ticking
 * it every pick is the friction the whole drawer exists to remove.
 */
export type SelectionStore = [host: string, ids: string[]][];
const MAX_HOSTS = 50;

/** The host's selection, moved to the end — so the cap drops the host you have not used in longest. */
export function rememberSelection(host: string, ids: string[], store: SelectionStore): SelectionStore {
  return [...store.filter(([h]) => h !== host), [host, [...ids]] as SelectionStore[number]].slice(-MAX_HOSTS);
}

/** What this host was last copied with, or null when it has never been picked on. */
export function recallSelection(host: string, store: SelectionStore): string[] | null {
  return store.find(([h]) => h === host)?.[1] ?? null;
}

async function loadStore(): Promise<SelectionStore> {
  try {
    const { sectionSelection } = await chrome.storage.local.get("sectionSelection");
    return Array.isArray(sectionSelection) ? (sectionSelection as SelectionStore) : [];
  } catch {
    return [];
  }
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
