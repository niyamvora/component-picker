/**
 * Every element under the pick, shadow roots included, and a clone that keeps them.
 */

// ---------- walking the subtree, shadow roots included ----------
/**
 * Every element under `root`, descending into open shadow roots.
 *
 * A design system built on web components puts everything worth capturing inside a shadow root,
 * where `querySelectorAll` cannot see it — the picker would return an empty `<my-button>`. Closed
 * roots stay invisible, as they are meant to be.
 */
export function walk(root: Element): Element[] {
  const out: Element[] = [root];
  const visit = (el: Element) => {
    for (const child of el.children) { out.push(child); visit(child); }
    if (el.shadowRoot) for (const child of el.shadowRoot.children) { out.push(child); visit(child); }
  };
  visit(root);
  return out;
}

/** The same walk over a detached clone, so indices line up with `walk(root)`. */
export function walkClone(clone: Element): Element[] {
  const out: Element[] = [clone];
  const visit = (el: Element) => {
    for (const child of el.children) {
      // A declarative shadow template stands in for the shadow root it will become.
      if (child instanceof HTMLTemplateElement && child.getAttribute("shadowrootmode")) {
        for (const inner of child.content.children) { out.push(inner); visit(inner); }
        continue;
      }
      out.push(child);
      visit(child);
    }
  };
  visit(clone);
  return out;
}

/**
 * Clone an element, turning any open shadow root into a `<template shadowrootmode="open">` —
 * declarative shadow DOM, which is how the markup is pasted back so it renders the same way.
 */
export function cloneDeep(el: Element): Element {
  const copy = el.cloneNode(false) as Element;
  if (el.shadowRoot) {
    const tpl = document.createElement("template");
    tpl.setAttribute("shadowrootmode", "open");
    for (const child of el.shadowRoot.children) tpl.content.append(cloneDeep(child));
    copy.append(tpl);
  }
  for (const child of el.childNodes) {
    if (child instanceof Element) copy.append(cloneDeep(child));
    else copy.append(child.cloneNode(true));
  }
  return copy;
}
