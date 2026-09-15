/**
 * Repeated markup as one component plus its data.
 *
 * This is Locofy's headline paid feature, and the difference between a bundle that describes a list
 * of six cards and one that describes *a card* plus six rows of data. It also cuts the bundle
 * roughly by the repeat count, which is the cheapest way to fit a big component under the cap.
 */

const MAX_INSTANCES = 24;
const MAX_COLS = 12;

/** A structural fingerprint to depth 3: tag + sorted classes + child count, recursively. */
function signature(el: Element, depth = 3): string {
  const cls = [...el.classList].sort().join(".");
  const kids = depth > 0 ? [...el.children].map((c) => signature(c, depth - 1)).join(",") : "";
  return `${el.tagName}.${cls}[${el.children.length}](${kids})`;
}

/** The varying leaf values between instances, by their position index within an instance. */
function dataColumns(instances: Element[]): { header: string; rows: string[] }[] {
  const walked = instances.map((el) => [el, ...el.querySelectorAll("*")]);
  const cols: { pos: number; header: string; rows: string[] }[] = [];
  const width = Math.min(...walked.map((w) => w.length));
  for (let pos = 0; pos < width; pos++) {
    const cells = walked.map((w) => {
      const node = w[pos];
      const text = (node.textContent ?? "").trim().replace(/\s+/g, " ");
      const src = node.getAttribute("src") || node.getAttribute("href") || node.getAttribute("alt") || "";
      return src || text;
    });
    if (new Set(cells).size > 1 && cells.some(Boolean)) {
      cols.push({ pos, header: walked[0][pos].tagName.toLowerCase() + (walked[0][pos].classList.length ? "." + walked[0][pos].classList[0] : ""), rows: cells });
    }
    if (cols.length >= MAX_COLS) break;
  }
  return cols;
}

/**
 * Returns the section text and the set of element indices to fold in the HTML — instances 2..n of
 * every repeat set, so `htmlOf` can replace them with a comment.
 */
export function findRepeats(_root: Element, els: Element[], sameStructure: (a: Element, b: Element) => boolean): { section: string; fold: Set<Element> } {
  const fold = new Set<Element>();
  const sections: string[] = [];
  const seen = new Set<Element>();
  for (const el of els) {
    if (el.children.length < 3 || seen.has(el)) continue;
    const groups = new Map<string, Element[]>();
    for (const child of el.children) {
      const sig = signature(child);
      (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(child);
    }
    for (const set of groups.values()) {
      if (set.length < 3) continue;
      const instances = set.slice(0, MAX_INSTANCES);
      // Confirm structural sameness by measurement, not just signature.
      if (!instances.slice(1).every((inst) => sameStructure(instances[0], inst))) continue;
      instances.forEach((inst) => seen.add(inst));
      for (const inst of instances.slice(1)) fold.add(inst);
      const first = instances[0];
      const cols = dataColumns(instances);
      const count = els.indexOf(first);
      let text = `${first.tagName.toLowerCase()}${first.classList.length ? "." + first.classList[0] : ""} repeats ${set.length}× (siblings, identical structure).`;
      if (cols.length) {
        text += `\nOnly these differ between instances; everything else is shared:\n\n`;
        text += `| # | ${cols.map((c) => c.header).join(" | ")} |\n|${"---|".repeat(cols.length + 1)}\n`;
        text += instances.map((_, r) => `| ${r + 1} | ${cols.map((c) => c.rows[r].slice(0, 40)).join(" | ")} |`).join("\n");
      }
      text += `\n\nThe HTML keeps instance 1 (index ${count}); the CSS describes it and the others match.`;
      sections.push(text);
    }
  }
  return { section: sections.length ? `## Repeated structure\n${sections.join("\n\n")}` : "", fold };
}
