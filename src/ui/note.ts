/**
 * The two things that happen at the end of a capture: asking for a note, and getting the bundle
 * onto the clipboard.
 */

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
 */
export function askForNote(): Promise<string> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute(UI, "");
    wrap.style.cssText = "position:fixed;z-index:2147483647;left:50%;bottom:64px;transform:translateX(-50%);width:min(480px,90vw);font:13px/1.4 -apple-system,system-ui,sans-serif";
    const input = document.createElement("input");
    input.placeholder = "Note for the AI (Enter to include, Esc to skip)";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2563eb;background:#111827;color:#fff;outline:none;box-shadow:0 4px 16px rgba(0,0,0,.35)";
    wrap.append(input);
    document.body.append(wrap);
    input.focus();
    const done = (value: string) => { wrap.remove(); window.removeEventListener("keydown", onNoteKey, true); resolve(value); };
    const onNoteKey = (e: KeyboardEvent) => {
      if (e.target !== input) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); done(input.value.trim()); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); done(""); }
      else e.stopPropagation(); // the page must not see what is being typed here
    };
    window.addEventListener("keydown", onNoteKey, true);
  });
}
