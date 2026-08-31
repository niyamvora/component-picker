/**
 * The in-page HUD: a glass floating dock (bottom-center) and a right settings drawer.
 *
 * Apple-style glass — a dark translucent surface with a backdrop blur, a hairline border and a
 * soft shadow — that recedes at rest and brightens on hover, legible on light and dark pages.
 * Everything is tagged `data-cp-ui` so a capture never includes it.
 */

import { ICONS } from "./icons-ui";
import { group, haveCapture, mountDesign, mountSections } from "./drawer-sections";
import { mountCaptureOptions, mountExtension } from "./drawer-groups";

const UI = "data-cp-ui";
const GLASS = "background:rgba(22,22,26,.55);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 32px rgba(0,0,0,.35);color:#f5f5f7";

/**
 * The few rules inline styles cannot express: scrollbar pseudo-elements, a focus ring for buttons
 * that `all:unset` stripped, and honouring reduced motion. Scoped to `[data-cp-ui]`, so the page's
 * own scrollbars and transitions are untouched.
 */
const HUD_CSS = `
[data-cp-ui]::-webkit-scrollbar,[data-cp-ui] ::-webkit-scrollbar{width:8px;height:8px}
[data-cp-ui]::-webkit-scrollbar-thumb,[data-cp-ui] ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border-radius:4px}
[data-cp-ui]::-webkit-scrollbar-track,[data-cp-ui] ::-webkit-scrollbar-track{background:transparent}
[data-cp-ui] button:focus-visible,[data-cp-ui] input:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
@media (prefers-reduced-motion:reduce){[data-cp-ui],[data-cp-ui] *{transition:none!important;animation:none!important}}
`;

let dock: HTMLDivElement | null = null;
let drawer: HTMLDivElement | null = null;
let hudStyle: HTMLStyleElement | null = null;

interface Action { icon: string; label: string; run: () => void; toggle?: () => boolean }

/** Toggle buttons repaint from state that other modules own, so the dock needs a way to re-read it. */
const toggles: { button: HTMLButtonElement; read: () => boolean }[] = [];
export const refreshDock = () => { for (const t of toggles) t.button.dataset.on = String(t.read()); };

/** Mount the dock with the given actions. Idempotent. */
export function showDock(actions: Action[]) {
  if (dock) return;
  toggles.length = 0;
  dock = el("div", `position:fixed;z-index:2147483646;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border-radius:16px;font:13px/1 -apple-system,system-ui,sans-serif;${GLASS}`);
  for (const a of actions) {
    const b = iconButton(a.icon, a.label);
    if (a.toggle) { b.dataset.on = String(a.toggle()); toggles.push({ button: b, read: a.toggle }); }
    b.addEventListener("click", () => { a.run(); refreshDock(); });
    dock.append(b);
  }
  dock.append(divider());
  const gear = iconButton(ICONS.sliders, "Settings");
  gear.addEventListener("click", toggleDrawer);
  const close = iconButton(ICONS.x, "Hide toolbar");
  close.addEventListener("click", hideDock);
  dock.append(gear, close);
  hudStyle = Object.assign(el("style", ""), { textContent: HUD_CSS });
  document.documentElement.append(hudStyle, dock);
}

/**
 * Bottom space the dock occupies, so the picker's own chrome sits clear of it.
 * The dock and the breadcrumb are both bottom-centred; without this they stack.
 */
export const dockClearance = () => (dock ? Math.round(dock.getBoundingClientRect().height) + 28 : 0);

export function hideDock() {
  dock?.remove(); dock = null;
  hudStyle?.remove(); hudStyle = null;
  closeDrawer();
}

/** Every piece of the HUD is built through this, so nothing it mounts can end up in a capture. */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] => {
  const d = document.createElement(tag);
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

function toggleDrawer() {
  if (drawer) { closeDrawer(); return; }
  drawer = el("div", `position:fixed;z-index:2147483646;right:16px;top:16px;bottom:16px;width:300px;border-radius:18px;padding:16px;overflow:auto;scrollbar-width:thin;font:13px/1.5 -apple-system,system-ui,sans-serif;${GLASS}`);
  drawer.append(Object.assign(el("div", "font-weight:600;font-size:14px;margin-bottom:6px"), { textContent: "Component Picker" }));
  // The compare reference is global (storage.local) — shown here so it is obviously retained
  // across tabs, not lost on a switch (#73). It stays in the header, above the groups: it is
  // context for every capture rather than a setting inside one of them.
  const refLine = el("div", "font-size:12px;color:rgba(245,245,247,.7);padding:6px 0;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:4px");
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

  // Four groups, one open at a time (#93): after Stages 1–3 a flat list is ~30 rows of wall.
  const made: ReturnType<typeof group>[] = [];
  const add = (name: string, mount: (host: HTMLElement) => void) => {
    const g = group(name, mount, () => {
      for (const other of made) if (other !== g) other.setOpen(false);
      void chrome.storage?.local?.set?.({ drawerGroup: name });
    });
    made.push(g);
    drawer!.append(g.node);
  };
  add("Copy", (host) => void mountSections(host));
  add("Design", (host) => void mountDesign(host));
  add("Capture options", mountCaptureOptions);
  add("Extension", mountExtension);
  // What you just captured, or — with nothing captured yet — the settings that shape the next one.
  const fallback = made.find((g) => g.title === (haveCapture() ? "Copy" : "Capture options")) ?? made[0];
  fallback.setOpen(true);
  void chrome.storage?.local?.get?.("drawerGroup")?.then(({ drawerGroup }) => {
    const saved = made.find((g) => g.title === drawerGroup);
    if (saved && saved !== fallback) { fallback.setOpen(false); saved.setOpen(true); }
  }).catch(() => {});

  document.documentElement.append(drawer);
  window.addEventListener("keydown", onDrawerKey, true);
}

function closeDrawer() {
  drawer?.remove();
  drawer = null;
  window.removeEventListener("keydown", onDrawerKey, true);
}

/**
 * Esc closes the drawer and stops there. Without this the picker's own Esc handler would disarm
 * the crosshair underneath an open drawer — two things dismissed by one keystroke.
 */
export function closeDrawerIfOpen(): boolean {
  if (!drawer) return false;
  closeDrawer();
  return true;
}

const onDrawerKey = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || !drawer) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  closeDrawer();
};
