/**
 * What the picked element sits in, and what it looks like in its other states.
 */

import { SKIP_TAGS, UI } from "./const";
import { computeBlocks, diffBlocks, label } from "./blocks";
import { defaultsFor, DIV_DEF } from "./defaults";
import { diffProps } from "./props";
import { state } from "./state";
import type { Blocks } from "../shared/types";

// ---------- context: what holds the picked element in place ----------
/** The properties that decide where a box sits — everything else is the element's own styling. */
const LAYOUT_PROPS = new Set(["display", "position", "top", "right", "bottom", "left", "z-index",
  "width", "height", "min-width", "max-width", "min-height", "max-height", "padding", "margin",
  "gap", "row-gap", "column-gap", "flex-direction", "flex-wrap", "justify-content", "align-items",
  "align-content", "flex-grow", "flex-shrink", "flex-basis", "grid-template-columns",
  "grid-template-rows", "grid-auto-flow", "overflow-x", "overflow-y", "box-sizing", "aspect-ratio"]);

/**
 * Chrome reports an `auto` inset on a positioned box, and a grid track sized by content, as the
 * px it worked out to — `left: 710.875px` for something nobody positioned from the left. Context
 * is a placement note, so only round values, which is what a person types, survive.
 *
 * ponytail: an authored `left: 12.5px` is dropped too. The cost is a missing line in a note, not
 * wrong CSS; carrying it properly means reading the author declarations for elements outside the
 * picked subtree.
 */
const authored = (v: string) => !/\d+\.\d+px/.test(v);

const layoutOf = (el: Element, parentCs: CSSStyleDeclaration | null): string => {
  const cs = getComputedStyle(el);
  const { props } = diffProps(cs, DIV_DEF(), defaultsFor(el), parentCs, el);
  const kept = Object.entries(props).filter(([p, v]) => LAYOUT_PROPS.has(p) && authored(v));
  return kept.map(([p, v]) => `${p}: ${v};`).join(" ") || "/* nothing but defaults */";
};

const boxOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.width)}×${Math.round(r.height)}`;
};

/**
 * The picked element is never the whole answer.
 *
 * An input that renders 900×32 tells you nothing about why it sits where it does — that lives in
 * the parent's padding, the wrapper's `position: relative`, and the sibling slot pinned at
 * `right: 6px`. Three ancestors and the siblings, layout properties only, so this stays a
 * placement note rather than a second copy of the CSS.
 */
export function contextOf(root: Element): string | null {
  const lines: string[] = [];
  const chain: Element[] = [];
  for (let a = root.parentElement, n = 0; a && a !== document.body && n < 3; a = a.parentElement, n++) chain.unshift(a);
  chain.forEach((a, n) => {
    const away = chain.length - n;
    lines.push(`${label(a)} { /* ${boxOf(a)}, ${away === 1 ? "parent" : `${away} levels up`} */ ${layoutOf(a, getComputedStyle(a.parentElement ?? document.body))} }`);
  });
  const siblings = [...(root.parentElement?.children ?? [])].filter((s) => s !== root && !s.closest(`[${UI}]`)).slice(0, 8);
  if (siblings.length) {
    lines.push(`Siblings of the picked element:`);
    for (const s of siblings) {
      const where = s.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING ? "before" : "after";
      lines.push(`- ${label(s)} ${boxOf(s)} (${where}) — ${layoutOf(s, getComputedStyle(s.parentElement!))}`);
    }
  }
  return lines.length ? lines.join("\n") : null;
}

// ---------- sibling variants: the same component in its other states ----------
const VARIANT_ATTRS = ["data-state", "aria-selected", "aria-current", "aria-checked", "aria-expanded",
  "aria-pressed", "disabled", "data-active", "data-highlighted", "data-disabled"];
const attrOf = (el: Element, a: string) => (el.hasAttribute(a) ? el.getAttribute(a) || "true" : null);

/**
 * A stepper's done/pending steps and a tab bar's unselected tabs are on the page already — the
 * user just cannot pick two things at once. Siblings that differ from the picked element only by
 * a state attribute are captured as diffs against it.
 */
export function variantsOf(root: Element, els: Element[], desktop: Blocks): string[] {
  const parent = root.parentElement;
  if (!parent) return [];
  const out: string[] = [];
  for (const s of [...parent.children]) {
    if (out.length >= 6) break;
    if (s === root || s.tagName !== root.tagName || s.closest(`[${UI}]`)) continue;
    const differing = VARIANT_ATTRS.filter((a) => attrOf(s, a) !== attrOf(root, a));
    if (!differing.length) continue;
    const selector = differing.map((a) => (s.hasAttribute(a) ? `[${a}="${attrOf(s, a)}"]` : `:not([${a}])`)).join("");
    const all = [s, ...s.querySelectorAll("*")].filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase()) && !e.closest(`[${UI}]`));
    const diff = diffBlocks(desktop, computeBlocks(all.slice(0, els.length)));
    const r = s.getBoundingClientRect();
    const note = all.length !== els.length ? ` (markup differs — ${all.length} vs ${els.length} elements)` : "";
    out.push(`${selector} — ${label(s)} ${Math.round(r.width)}×${Math.round(r.height)}${note} — diff vs picked:\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No style differences._"));
  }
  return out;
}

// ---------- which component library built this ----------
const cls = (el: Element) => (typeof el.className === "string" ? el.className.trim().split(/\s+/) : []);
const attrs = (el: Element, prefix: string) => [...el.attributes].some((a) => a.name.startsWith(prefix));

/**
 * `data-base-ui-*` means Base UI, `data-slot` means shadcn, `--tw-*` means Tailwind. Naming the
 * library is the difference between "rebuild this markup" and "this is a Radix tabs trigger".
 *
 * Detection lives in the content script, not the MAIN-world probe: these are all attributes and
 * classes, which an isolated world sees perfectly well. Only React's fiber expandos need the
 * page's own world.
 */
const LIBRARIES: { name: string; test: (el: Element) => boolean }[] = [
  { name: "Base UI", test: (el) => attrs(el, "data-base-ui-") || el.id.startsWith("base-ui-") },
  { name: "Radix", test: (el) => attrs(el, "data-radix-") || (el.hasAttribute("data-state") && el.hasAttribute("data-orientation")) },
  { name: "shadcn/ui", test: (el) => el.hasAttribute("data-slot") },
  { name: "Headless UI", test: (el) => el.hasAttribute("data-headlessui-state") },
  { name: "MUI", test: (el) => cls(el).some((c) => c.startsWith("Mui")) },
  { name: "Chakra", test: (el) => cls(el).some((c) => c.startsWith("chakra-")) },
  { name: "Ant Design", test: (el) => cls(el).some((c) => c.startsWith("ant-")) },
  { name: "Mantine", test: (el) => cls(el).some((c) => c.startsWith("mantine-")) },
  { name: "styled-components", test: (el) => cls(el).some((c) => /^sc-[A-Za-z0-9]{5,}$/.test(c)) },
  { name: "Emotion", test: (el) => cls(el).some((c) => /^css-[a-z0-9]{5,}$/.test(c)) },
  { name: "Vue", test: (el) => attrs(el, "data-v-") },
  { name: "Svelte", test: (el) => cls(el).some((c) => c.startsWith("svelte-")) },
  { name: "Angular", test: (el) => attrs(el, "_ngcontent") },
  { name: "Astro", test: (el) => attrs(el, "data-astro-") },
];

export function libraries(els: Element[]): string[] {
  const scan = els.slice(0, 500);
  // One stray `data-slot` is not a design system; two is.
  const found = LIBRARIES
    .filter(({ name, test }) => (name === "shadcn/ui" ? scan.filter(test).length >= 2 : scan.some(test)))
    .map((l) => l.name);
  const root = getComputedStyle(document.documentElement);
  if (root.getPropertyValue("--bs-body-color")) found.push("Bootstrap");
  const usesTw = Object.values(state.sources).some((v) => Object.keys(v.customs).some((k: string) => k.startsWith("--tw-")));
  if (usesTw || root.getPropertyValue("--tw-ring-color")) {
    // v4 ships a `--spacing` scale and a `--default-font-family`; v3 has neither.
    found.push(root.getPropertyValue("--spacing") || root.getPropertyValue("--default-font-family") ? "Tailwind v4" : "Tailwind");
  }
  return found;
}
