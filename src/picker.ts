/**
 * The picker itself: the overlay you hover, the keys you press, and the wiring to the
 * service worker. Injected by name on toolbar click — injecting it again toggles it off.
 */

import { blocksOfLastPick, extract, extractMany, label, options, snapshot, snapshotOtherTheme, UI } from "./extract";
import type { Message } from "./types";

declare global {
  interface Window {
    /** The picker's handle on the page, also used to detect a second injection. */
    __cp?: {
      extract: typeof extract; extractMany: typeof extractMany; start: () => void; stop: () => void; toggle: () => void;
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
  let box!: HTMLDivElement, tip!: HTMLDivElement, banner!: HTMLDivElement, crumbs!: HTMLDivElement, cursorStyle!: HTMLStyleElement;
  /** Eight bands: padding top/bottom/left/right, then margin. */
  let bands: HTMLDivElement[] = [];
  /** Shift-clicked elements waiting to be captured alongside the next click (#22). */
  let selection: Element[] = [];
  let marks: HTMLDivElement[] = [];
  let lastXY: [number, number] | null = null, lockXY: [number, number] | null = null;
  const BANNER = "Component Picker — click/Enter copies · shift-click adds · ↑↓ parent/child · P whole page · F freeze · Esc exit";
  const PILL = "position:fixed;z-index:2147483647;pointer-events:none;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#fff;background:#111827;padding:4px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;";

  function toast(text: string): HTMLDivElement {
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
      b.addEventListener("click", (e) => { e.stopPropagation(); lockXY = lastXY; highlight(a); });
      crumbs.append(b);
    });
  }

  function highlight(el: Element | null): void {
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
    const extra = selection.length ? `  ·  ${selection.length} selected` : "";
    tip.textContent = `${label(el)}  ${Math.round(r.width)}×${Math.round(r.height)}${extra}`;
    tip.style.cssText = PILL + `left:${Math.max(4, r.left)}px;top:${r.top > 30 ? r.top - 26 : r.bottom + 4}px`;
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META"]);
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
    if (e.target instanceof Element && e.target.closest(`[${UI}]`)) return; // the breadcrumb bar
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== "click" || !current) return;
    // Sometimes the unit is "these three cards", not one element.
    if ((e as MouseEvent).shiftKey) addToSelection(current);
    else finish(current);
  };

  /** A green outline that stays put, so you can see what is already in the selection. */
  function addToSelection(el: Element) {
    if (selection.includes(el)) return;
    selection.push(el);
    const r = el.getBoundingClientRect();
    const mark = document.createElement("div");
    mark.setAttribute(UI, "");
    mark.style.cssText = `position:fixed;z-index:2147483644;pointer-events:none;box-sizing:border-box;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #16a34a;background:rgba(22,163,74,.10)`;
    document.documentElement.append(mark);
    marks.push(mark);
    highlight(el);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stop();
    else if (e.key === "Enter" && current) finish(current);
    else if (e.key === "ArrowUp" && current?.parentElement && current.parentElement !== document.documentElement) { lockXY = lastXY; highlight(current.parentElement); }
    else if (e.key === "ArrowDown" && current?.firstElementChild) { lockXY = lastXY; highlight(current.firstElementChild); }
    else if (e.key === "f" || e.key === "F") setFrozen(!frozen);
    else if (e.key === "Backspace" && selection.length) { selection.pop(); marks.pop()?.remove(); highlight(current); }
    else if (e.key === "p" || e.key === "P") {
      // A landing page, section by section: each one is its own component in the bundle.
      const host = document.querySelector("main") ?? document.body;
      const sections = [...host.children].filter((c) => !SKIP.has(c.tagName) && !c.closest(`[${UI}]`)).slice(0, 12);
      if (!sections.length) return;
      selection = []; marks.splice(0).forEach((m) => m.remove());
      for (const s of sections.slice(0, -1)) addToSelection(s);
      finish(sections[sections.length - 1]);
    }
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
    const chrome_ = (css: string) => {
      const d = document.createElement("div");
      d.setAttribute(UI, "");
      d.style.cssText = css;
      document.documentElement.append(d);
      return d;
    };
    box = chrome_("");
    tip = chrome_("display:none");
    banner = chrome_(PILL + "left:50%;top:12px;transform:translateX(-50%);pointer-events:none");
    bands = Array.from({ length: 8 }, () => chrome_("display:none"));
    // The one piece of picker chrome that takes clicks: a breadcrumb you cannot click is a label.
    crumbs = chrome_(PILL + "left:50%;bottom:12px;transform:translateX(-50%);pointer-events:auto;padding:5px 9px;max-width:96vw");
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
    for (const el of [box, tip, banner, crumbs, cursorStyle, ...bands, ...marks]) el?.remove();
    bands = []; marks = []; selection = [];
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
    const selected = [...selection];
    stop();
    selection = selected; // stop() clears it; the capture below still needs what was picked
    const t = toast("Extracting…");
    try {
      // The capture and the note run together: the debugger work takes seconds, the typing does too.
      const picks = [...selection.filter((s) => s !== el), el];
      selection = [];
      const [bundle, note] = await Promise.all([extractMany(picks, (s) => { t.textContent = s; }), askForNote()]);
      const full = note ? bundle.replace(/\n/, `\n\n> Note: ${note}\n`) : bundle;
      window.__cp!.last = full;
      await copy(full);
      chrome.runtime?.sendMessage?.({
        type: "remember",
        entry: { label: picks.length > 1 ? `${picks.length} components` : label(el), host: location.host, at: Date.now(), bundle: full.slice(0, 200_000) },
      } satisfies Message).catch(() => {});
      const what = picks.length > 1 ? `${picks.length} components` : label(el);
      t.textContent = `Copied ${what} — ${(full.length / 1024).toFixed(0)} KB · R to set as compare reference`;
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

  window.__cp = { extract, extractMany, start, stop, toggle: () => (active ? stop() : start()), last: "", opts: options, lastBlocks: blocksOfLastPick };
  if (!window.__cpNoAutostart) start();
}
