/**
 * A whole page, section by section (#105).
 *
 * The `P` key has split landing pages this way since #79; this is that same split, lifted out of
 * the key handler so the MCP bridge can reach it too. One function, two callers — a second copy
 * would drift the moment either one learned about a new wrapper element.
 *
 * The per-section cap is what makes this usable: `extract` caps at MAX_ELEMENTS per root, so a
 * twelve-section page yields twelve capped bundles rather than one bundle truncated at the first
 * hero. That is the difference between reading a page and reading its header.
 */

import { MAX_ELEMENTS, SKIP_TAGS, UI } from "./const";
import { label } from "./blocks";
import { extract } from "./bundle";

export const MAX_SECTIONS = 12;

/** A wrapper whose only job is to centre its children is not a section; its children are. */
const isWrapper = (el: Element) =>
  el.children.length > 1 && el.children.length <= MAX_SECTIONS &&
  [...el.children].every((c) => c.tagName !== "SCRIPT") &&
  el.getBoundingClientRect().height > innerHeight * 1.5;

const visible = (el: Element) => {
  if (SKIP_TAGS.has(el.tagName.toUpperCase()) || el.closest(`[${UI}]`)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/**
 * The page's top-level sections, in document order.
 *
 * `main`'s children are the body of the page, but a banner and a footer usually sit outside it —
 * and they are exactly the parts an agent rebuilding the page still has to account for.
 */
export function pageSections(limit = MAX_SECTIONS): Element[] {
  const main = document.querySelector("main");
  const host = main ?? document.body;
  let kids = [...host.children].filter(visible);
  // A single tall wrapper between `main` and the real sections is the common Next.js shape.
  if (kids.length === 1 && isWrapper(kids[0])) kids = [...kids[0].children].filter(visible);
  const out = [...kids];
  if (main) {
    for (const sel of ["body > header", "body > nav", "body > footer"]) {
      const el = document.querySelector(sel);
      if (el && visible(el) && !out.includes(el) && !el.contains(main)) out.push(el);
    }
  }
  // Document order, so the table of contents reads like the page.
  out.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return out.slice(0, limit);
}

/**
 * Every section as its own bundle, behind one table of contents.
 *
 * Not `extractMany`: that numbers its parts `Component 1 of N`, which is right for "these three
 * cards" and wrong for a page, where the reader needs to know which section is the pricing table
 * before deciding to read it.
 */
export async function capturePage(limit = MAX_SECTIONS, onStatus: (s: string) => void = () => {}): Promise<string> {
  const sections = pageSections(limit);
  if (!sections.length) throw new Error("no page sections found — capture a selector instead");
  const toc: string[] = [];
  const parts: string[] = [];
  for (const [i, el] of sections.entries()) {
    onStatus(`Section ${i + 1} of ${sections.length}…`);
    const r = el.getBoundingClientRect();
    const heading = el.querySelector("h1, h2, h3")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 60);
    const name = heading || label(el);
    const count = el.querySelectorAll("*").length;
    toc.push(`${i + 1}. **${name}** — ${label(el)} · ${Math.round(r.width)}×${Math.round(r.height)}` +
      `${count > MAX_ELEMENTS ? ` · ${count} elements, CSS captured for the first ${MAX_ELEMENTS}` : ` · ${count} elements`}`);
    const one = await extract(el, () => {});
    // Section-local `data-cp` ids, so two sections' selectors can never collide once pasted.
    parts.push(`# Section ${i + 1}: ${name}\n\n` +
      one.replace(/data-cp="(\d+)"/g, `data-cp="s${i + 1}-$1"`).replace(/^# /, "## Source: "));
  }
  return [
    `# Page: ${document.title || location.hostname}`,
    location.href,
    `Captured ${sections.length} section(s) at ${innerWidth}×${innerHeight}. Each section is capped independently, so a long page loses depth rather than losing its tail.`,
    `## Contents\n${toc.join("\n")}`,
    ...parts,
  ].join("\n\n---\n\n");
}
