/**
 * The picker itself: the overlay you hover, the keys you press, and the wiring to the
 * service worker. Injected by name on toolbar click — injecting it again toggles it off.
 */

import { extract, label, options, snapshot, UI } from "./extract";
import type { Message } from "./types";

declare global {
  interface Window {
    /** The picker's handle on the page, also used to detect a second injection. */
    __cp?: { extract: typeof extract; start: () => void; stop: () => void; toggle: () => void; last: string; opts: typeof options };
    /** Set by the test fixture so the picker can be driven without the overlay. */
    __cpNoAutostart?: boolean;
  }
}

if (window.__cp) {
  window.__cp.toggle();
} else {
  // The service worker asks for a measurement whenever it changes the viewport or forces a state.
  chrome.runtime?.onMessage?.addListener((msg: Message, _sender, reply) => {
    if (msg.type !== "snapshot") return;
    snapshot(msg.settle ?? 400).then(reply);
    return true; // keeps the message channel open for the async reply
  });

  async function copy(text: string) {
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

  // ---------- picker UI ----------
  let active = false;
  let current: Element | null = null;
  let box: HTMLDivElement, tip: HTMLDivElement, banner: HTMLDivElement, cursorStyle: HTMLStyleElement;
  let lastXY: [number, number] | null = null, lockXY: [number, number] | null = null;
  const PILL = "position:fixed;z-index:2147483647;pointer-events:none;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#fff;background:#111827;padding:4px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;";

  function toast(text: string): HTMLDivElement {
    const t = document.createElement("div");
    t.setAttribute(UI, "");
    t.style.cssText = PILL + "left:50%;bottom:24px;transform:translateX(-50%);font-size:13px;padding:8px 14px;background:#2563eb";
    t.textContent = text;
    document.body.append(t);
    return t;
  }

  function highlight(el: Element | null): void {
    current = el;
    if (!el) { box.style.display = "none"; tip.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    box.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #2563eb;outline-offset:-1px;background:rgba(37,99,235,.10)`;
    tip.textContent = `${label(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    tip.style.cssText = PILL + `left:${Math.max(4, r.left)}px;top:${r.top > 30 ? r.top - 26 : r.bottom + 4}px`;
  }

  const pick = (e: Event): Element | null => { const t = e.composedPath()[0]; return t instanceof Element && !t.closest(`[${UI}]`) ? t : null; };
  const SWALLOW = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "auxclick", "dblclick"];
  const onMove = (e: PointerEvent) => {
    lastXY = [e.clientX, e.clientY];
    if (lockXY && Math.hypot(e.clientX - lockXY[0], e.clientY - lockXY[1]) < 8) return;
    lockXY = null;
    highlight(pick(e));
  };
  const onSwallow = (e: Event) => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === "click" && current) finish(current);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stop();
    else if (e.key === "Enter" && current) finish(current);
    else if (e.key === "ArrowUp" && current?.parentElement && current.parentElement !== document.documentElement) { lockXY = lastXY; highlight(current.parentElement); }
    else if (e.key === "ArrowDown" && current?.firstElementChild) { lockXY = lastXY; highlight(current.firstElementChild); }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  const onScroll = () => current && highlight(current);

  function start() {
    if (active) return;
    active = true;
    for (const [n, css] of [["box", ""], ["tip", "display:none"], ["banner", PILL + "left:50%;top:12px;transform:translateX(-50%);pointer-events:none"]]) {
      const d = document.createElement("div");
      d.setAttribute(UI, "");
      d.style.cssText = css;
      document.documentElement.append(d);
      if (n === "box") box = d; else if (n === "tip") tip = d; else banner = d;
    }
    banner.textContent = "Component Picker — hover, click/Enter to copy · ↑ parent · ↓ child · Esc to exit";
    cursorStyle = document.createElement("style");
    cursorStyle.setAttribute(UI, "");
    document.documentElement.append(cursorStyle);
    cursorStyle.sheet!.insertRule("* { cursor: crosshair !important }");
    window.addEventListener("pointermove", onMove as EventListener, true);
    for (const t of SWALLOW) window.addEventListener(t, onSwallow, true);
    window.addEventListener("keydown", onKey as EventListener, true);
    window.addEventListener("scroll", onScroll, true);
  }

  function stop() {
    if (!active) return;
    active = false;
    current = null;
    for (const el of [box, tip, banner, cursorStyle]) el?.remove();
    window.removeEventListener("pointermove", onMove as EventListener, true);
    for (const t of SWALLOW) window.removeEventListener(t, onSwallow, true);
    window.removeEventListener("keydown", onKey as EventListener, true);
    window.removeEventListener("scroll", onScroll, true);
  }

  async function finish(el: Element) {
    stop();
    const t = toast("Extracting…");
    try {
      const bundle = await extract(el, (s) => { t.textContent = s; });
      window.__cp!.last = bundle;
      await copy(bundle);
      t.textContent = `Copied ${label(el)} — ${(bundle.length / 1024).toFixed(0)} KB`;
      setTimeout(() => t.remove(), 3000);
    } catch (e) {
      console.error("[Component Picker]", e);
      t.textContent = `Component Picker failed: ${e instanceof Error ? e.message : String(e)}`;
      setTimeout(() => t.remove(), 6000);
    }
  }

  window.__cp = { extract, start, stop, toggle: () => (active ? stop() : start()), last: "", opts: options };
  if (!window.__cpNoAutostart) start();
}
