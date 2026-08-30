/**
 * The palette and type at a glance — what CSS Peeper and CSS Scan sell, from the blocks we already
 * have. It answers the questions that come up constantly while rebuilding: what colours, what
 * type scale, and is the spacing on a 4px (or 8px) grid?
 */

import type { Blocks } from "../shared/types";

const byFreq = (counts: Map<string, number>, limit = 12) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v, n]) => `${v}${n > 1 ? ` ×${n}` : ""}`);

export function paletteSummary(blocks: Blocks): string {
  const colours = new Map<string, number>();
  const spacing = new Map<string, number>();
  const type = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const i of Object.keys(blocks)) {
    const p = blocks[+i].props;
    for (const key of ["color", "background-color", "border-color"]) {
      const v = p[key];
      if (v && !/rgba\(0, 0, 0, 0\)|transparent/.test(v)) bump(colours, v);
    }
    for (const key of ["padding", "margin", "gap", "row-gap", "column-gap"]) {
      const v = p[key];
      if (v) for (const part of v.split(" ")) if (/^\d/.test(part)) bump(spacing, part);
    }
    if (p["font-size"]) bump(type, `${p["font-size"]}${p["font-weight"] ? `/${p["font-weight"]}` : ""}`);
  }
  if (!colours.size && !spacing.size && !type.size) return "";

  const nums = [...spacing.keys()].map(parseFloat).filter((n) => n > 0);
  const scale = nums.length && nums.every((n) => n % 4 === 0) ? nums.every((n) => n % 8 === 0) ? "  (multiples of 8 — an 8px scale)" : "  (multiples of 4 — a 4px scale)" : "";

  const lines = [
    colours.size ? `Colours: ${byFreq(colours).join(" · ")}` : "",
    type.size ? `Type:    ${byFreq(type, 8).join(" · ")}` : "",
    spacing.size ? `Spacing: ${byFreq(spacing).sort((a, b) => parseFloat(a) - parseFloat(b)).join(" · ")}${scale}` : "",
  ].filter(Boolean);
  return `## Palette and type\n${lines.join("\n")}`;
}
