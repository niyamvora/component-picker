/**
 * The two things that happen at the end of a capture: asking for a note, and getting the bundle
 * onto the clipboard.
 */

import { label } from "../core/blocks";
import { UI } from "../core/const";

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.setAttribute(UI, "");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}


/**
 * A sentence of intent, travelling with the pick.
 *
 * "Make this the pricing card, keep the badge" is the part of the request the DOM cannot carry,
 * and typing it here beats pasting the bundle and then explaining it. Shown while the capture is
 * already running, so the prompt costs no time.
 *
 * It opens against the element it is about — a box at the bottom of the window is a dialog about
 * nothing in particular, and by the time you have found it you have forgotten which card you clicked.
 */
export function askForNote(anchor?: Element | null): Promise<string> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute(UI, "");
    wrap.style.cssText = "position:fixed;z-index:2147483647;width:min(320px,90vw);font:13px/1.4 -apple-system,system-ui,sans-serif;" +
      "background:#111827;color:#fff;border:1px solid #2563eb;border-radius:10px;padding:8px;box-shadow:0 8px 28px rgba(0,0,0,.45)";
    const title = document.createElement("div");
    title.textContent = anchor ? `Note for ${label(anchor)}` : "Note for the AI";
    title.style.cssText = "font-size:11px;color:rgba(255,255,255,.65);padding:0 2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const input = document.createElement("input");
    input.placeholder = "What should the AI do with this?";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0b1220;color:#fff;outline:none;font:inherit";
    const foot = document.createElement("div");
    foot.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:6px";
    const hint = document.createElement("span");
    hint.textContent = "Esc to skip";
    hint.style.cssText = "font-size:11px;color:rgba(255,255,255,.55)";
    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.style.cssText = "all:unset;padding:4px 14px;border-radius:6px;background:#2563eb;color:#fff;font:600 12px/1.6 inherit;cursor:pointer";
    foot.append(hint, ok);
    wrap.append(title, input, foot);
    // A ring on the element itself, so "this box is about that thing" needs no explaining.
    const ring = anchor ? ringAround(anchor) : null;
    document.body.append(wrap);
    place(wrap, anchor);
    input.focus();

    const done = (value: string) => {
      wrap.remove();
      ring?.remove();
      window.removeEventListener("keydown", onNoteKey, true);
      resolve(value);
    };
    ok.addEventListener("click", () => done(input.value.trim()));
    const onNoteKey = (e: KeyboardEvent) => {
      if (e.target !== input) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); done(input.value.trim()); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); done(""); }
      else e.stopPropagation(); // the page must not see what is being typed here
    };
    window.addEventListener("keydown", onNoteKey, true);
  });
}

/** Below the element, flipped above when there is no room, and always inside the viewport. */
function place(wrap: HTMLElement, anchor?: Element | null) {
  const box = wrap.getBoundingClientRect();
  const clamp = (v: number, max: number) => Math.max(8, Math.min(v, max - 8));
  if (!anchor) {
    wrap.style.left = `${clamp((innerWidth - box.width) / 2, innerWidth - box.width)}px`;
    wrap.style.top = `${clamp(innerHeight - box.height - 56, innerHeight - box.height)}px`;
    return;
  }
  const r = anchor.getBoundingClientRect();
  const gap = 8;
  const below = r.bottom + gap;
  // Prefer below; go above when the element runs to the bottom of the window.
  const top = below + box.height <= innerHeight - 8 ? below : r.top - box.height - gap;
  wrap.style.left = `${clamp(r.left, innerWidth - box.width)}px`;
  wrap.style.top = `${clamp(top, innerHeight - box.height)}px`;
}

/**
 * The outline that survives the picker's own chrome being torn down on click.
 *
 * It re-reads the element rather than freezing one rect: the note is open while the capture runs,
 * and the capture resizes the viewport for its responsive snapshots — a ring measured once ends up
 * outlining empty space.
 */
function ringAround(el: Element): HTMLElement {
  const ring = document.createElement("div");
  ring.setAttribute(UI, "");
  ring.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #2563eb;border-radius:4px;box-shadow:0 0 0 9999px rgba(17,24,39,.12)";
  const track = () => {
    const r = el.getBoundingClientRect();
    ring.style.cssText += `;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  };
  track();
  addEventListener("scroll", track, true);
  addEventListener("resize", track);
  document.body.append(ring);
  const remove = ring.remove.bind(ring);
  ring.remove = () => { removeEventListener("scroll", track, true); removeEventListener("resize", track); remove(); };
  return ring;
}
