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
/**
 * The same inventory as JSON, so it can live in the repo (#109).
 *
 * Accepts a bare array or a `components.json`-shaped object, because those are the two ways anyone
 * would actually write the file. Parsing it here rather than converting at the point of loading
 * means the file format and the textarea format cannot drift apart.
 */
function parseInventoryJson(text: string): InventoryEntry[] | null {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(data) ? data : (data as { components?: unknown })?.components;
  if (!Array.isArray(list)) return null;
  const out: InventoryEntry[] = [];
  for (const raw of list) {
    const c = raw as { name?: unknown; selectors?: unknown; selector?: unknown; props?: unknown };
    const name = typeof c?.name === "string" ? c.name.trim() : "";
    const selectors = (Array.isArray(c?.selectors) ? c.selectors : [c?.selector])
      .filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim());
    if (!name || !selectors.length) continue;
    const props = (Array.isArray(c?.props) ? c.props : []).filter((p): p is string => typeof p === "string");
    out.push({ name, selectors, props });
  }
  return out.length ? out : null;
}

export function parseInventory(text: string): InventoryEntry[] {
  // A file from the repo arrives as JSON; the side panel's textarea is the two-space format.
  const json = parseInventoryJson(text);
  if (json) return json;
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
