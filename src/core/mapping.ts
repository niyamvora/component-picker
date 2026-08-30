/**
 * Map the capture onto the target project's own components.
 *
 * Builder.io charges for exactly this — output that references your `<Button>` and `<Card>` instead
 * of div soup. A useful 80% needs no model at all: a trivial inventory of `name → selectors` and
 * `el.matches()`. Unmatched elements are listed explicitly, because a silent partial mapping is
 * worse than none.
 */

import { sel } from "./const";
import type { InventoryEntry } from "../shared/types";

/**
 * Parse the inventory textarea. One component per line:
 *   `Button  button, [role=button]   variant, size`
 * name, then a comma-separated selector list, then optional prop names. Malformed lines are ignored.
 */
export function parseInventory(text: string): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const [name, selectorList, propList] = parts;
    const selectors = selectorList.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name || !selectors.length) continue;
    out.push({ name, selectors, props: propList ? propList.split(",").map((p) => p.trim()) : [] });
  }
  return out;
}

/** A rough specificity proxy so the most specific selector wins. */
const specificity = (s: string) => (s.match(/[.#[]/g)?.length ?? 0);

export function mapToInventory(els: Element[], inventory: InventoryEntry[]): string {
  if (!inventory.length) return "";
  const mapped: string[] = [];
  const unmatched: number[] = [];
  for (const [i, el] of els.entries()) {
    const hits = inventory
      .filter((c) => c.selectors.some((s) => { try { return el.matches(s); } catch { return false; } }))
      .sort((a, b) => Math.max(...b.selectors.map(specificity)) - Math.max(...a.selectors.map(specificity)));
    const comp = hits[0];
    if (!comp) { unmatched.push(i); continue; }
    // An icon (from #18) maps to the icon component's name prop automatically.
    const icon = el.getAttribute("data-icon");
    const propHint = icon && comp.props.includes("name") ? ` name="${icon.split(":")[1]}"` : comp.props.length ? ` ${comp.props.map((p) => `${p}={…}`).join(" ")}` : "";
    mapped.push(`${sel(i)} → <${comp.name}${propHint} />`);
  }
  if (!mapped.length) return "";
  const tail = unmatched.length ? `\nUnmatched: ${unmatched.map(sel).join(", ")} — no component in your inventory covers these.` : "";
  return `## Mapping to your components\n${mapped.join("\n")}${tail}`;
}
