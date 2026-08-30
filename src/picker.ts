/**
 * The picker itself: the overlay you hover, the keys you press, and the wiring to the
 * service worker. Injected by name on toolbar click — injecting it again toggles it off.
 */

import { blocksOfLastPick, extract, label, options, snapshot, snapshotOtherTheme, UI } from "./extract";
import type { Message } from "./types";

declare global {
  interface Window {
    /** The picker's handle on the page, also used to detect a second injection. */
    __cp?: {
      extract: typeof extract; start: () => void; stop: () => void; toggle: () => void;
      last: string; opts: typeof options;
      /** The last capture's desktop blocks — what "set as reference" stores. */
      lastBlocks: () => ReturnType<typeof blocksOfLastPick>;
    };
    /** Set by the test fixture so the picker can be driven without the overlay. */
    __cpNoAutostart?: boolean;
  }
}

if (window.__cp) {
  window.__cp.toggle();
} else {
  // The service worker asks for a measurement whenever it changes the viewport, forces a state,
  // or wants the other theme — which only the page itself can switch when a class drives it.
  chrome.runtime?.onMessage?.addListener((msg: Message, _sender, reply) => {
    if (msg.type !== "snapshot") return;
    const job = msg.theme === "flip"
      ? snapshotOtherTheme(msg.settle ?? 400).then((s) => {
          if (!s) throw new Error("the site re-applied its own theme");
          return s;
        })
      : snapshot(msg.settle ?? 400);
    job.then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
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
  let active = false, frozen = false;
  let current: Element | null = null;
  let box: HTMLDivElement, tip: HTMLDivElement, banner: HTMLDivElement, cursorStyle: HTMLStyleElement;
  let lastXY: [number, number] | null = null, lockXY: [number, number] | null = null;
  const BANNER = "Component Picker — hover, click/Enter to copy · ↑ parent · ↓ child · F freeze · Esc exit";
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
    if (frozen) return;
    lastXY = [e.clientX, e.clientY];
    if (lockXY && Math.hypot(e.clientX - lockXY[0], e.clientY - lockXY[1]) < 8) return;
    lockXY = null;
    highlight(pick(e));
  };
  const onSwallow = (e: Event) => {
    if (frozen) return; // the page gets its clicks back, so menus can be opened
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === "click" && current) finish(current);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stop();
    else if (e.key === "Enter" && current) finish(current);
    else if (e.key === "ArrowUp" && current?.parentElement && current.parentElement !== document.documentElement) { lockXY = lastXY; highlight(current.parentElement); }
    else if (e.key === "ArrowDown" && current?.firstElementChild) { lockXY = lastXY; highlight(current.firstElementChild); }
    else if (e.key === "f" || e.key === "F") setFrozen(!frozen);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  };

  /**
   * Freeze mode: stop swallowing clicks and stop tracking the pointer, so a menu, dropdown or
   * modal can be opened and then picked. Without it the picker eats the very click that would
   * reveal what you want to capture.
   */
  function setFrozen(on: boolean) {
    frozen = on;
    banner.textContent = on
      ? "FROZEN — open the menu you want, then press F to resume picking"
      : BANNER;
    banner.style.background = on ? "#b45309" : "#111827";
    cursorStyle.sheet!.deleteRule(0);
    cursorStyle.sheet!.insertRule(on ? "* { cursor: auto }" : "* { cursor: crosshair !important }");
    if (on) highlight(null);
  }
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
    banner.textContent = BANNER;
    cursorStyle = document.createElement("style");
    cursorStyle.setAttribute(UI, "");
    document.documentElement.append(cursorStyle);
    cursorStyle.sheet!.insertRule("* { cursor: crosshair !important }");
    window.addEventListener("pointermove", onMove as EventListener, true);
    for (const t of SWALLOW) window.addEventListener(t, onSwallow, true);
    window.addEventListener("keydown", onKey as EventListener, true);
    window.addEventListener("scroll", onScroll, true);
    chrome.runtime?.sendMessage?.({ type: "picking", on: true } satisfies Message).catch(() => {});
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
    frozen = false;
    chrome.runtime?.sendMessage?.({ type: "picking", on: false } satisfies Message).catch(() => {});
  }

  /**
   * A sentence of intent, travelling with the pick.
   *
   * "Make this the pricing card, keep the badge" is the part of the request the DOM cannot carry,
   * and typing it here beats pasting the bundle and then explaining it. Shown while the capture is
   * already running, so the prompt costs no time.
   */
  function askForNote(): Promise<string> {
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

  async function finish(el: Element) {
    stop();
    const t = toast("Extracting…");
    try {
      // The capture and the note run together: the debugger work takes seconds, the typing does too.
      const [bundle, note] = await Promise.all([extract(el, (s) => { t.textContent = s; }), askForNote()]);
      const full = note ? bundle.replace(/\n/, `\n\n> Note: ${note}\n`) : bundle;
      window.__cp!.last = full;
      await copy(full);
      chrome.runtime?.sendMessage?.({
        type: "remember",
        entry: { label: label(el), host: location.host, at: Date.now(), bundle: full.slice(0, 200_000) },
      } satisfies Message).catch(() => {});
      t.textContent = `Copied ${label(el)} — ${(full.length / 1024).toFixed(0)} KB · R to set as compare reference`;
      // The reference offer is live only while the toast is: a key that silently does something
      // minutes later is worse than one that does nothing.
      const onRef = (e: KeyboardEvent) => {
        if (e.key !== "r" && e.key !== "R") return;
        e.preventDefault();
        const clear = e.shiftKey;
        chrome.runtime?.sendMessage?.(clear
          ? { type: "clear-reference" }
          : { type: "set-reference", reference: { blocks: blocksOfLastPick(), label: label(el), url: location.href, at: Date.now() } } satisfies Message);
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

  window.__cp = { extract, start, stop, toggle: () => (active ? stop() : start()), last: "", opts: options, lastBlocks: blocksOfLastPick };
  if (!window.__cpNoAutostart) start();
}
