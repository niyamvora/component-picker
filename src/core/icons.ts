/**
 * Recognising an icon by its geometry, so `lucide:eye-off` can stand in for three anonymous paths.
 */

import iconTable from "../assets/icons.json";

// ---------- icons ----------
/**
 * `lucide:eye-off` instead of three anonymous `<path d="…">`.
 *
 * An icon named is an icon the AI can import from the set the project already depends on; the raw
 * paths stay in the HTML for exact parity when it cannot. Matching is on geometry alone — the same
 * picture at any formatting, stroke width or viewBox hashes the same.
 */
export function iconHash(shapes: string[]): string {
  const text = shapes.map((x) => x.replace(/\s+/g, " ").trim()).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const MAX_ICON_SHAPES = 8; // past this it is an illustration, not an icon

export function iconName(svg: Element): string | null {
  const shapes = [
    ...[...svg.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? ""),
    ...[...svg.querySelectorAll("polyline, polygon")].map((p) => p.getAttribute("points") ?? ""),
    ...[...svg.querySelectorAll("circle")].map((c) => `c${c.getAttribute("cx")},${c.getAttribute("cy")},${c.getAttribute("r")}`),
  ].filter(Boolean);
  if (!shapes.length || shapes.length > MAX_ICON_SHAPES) return null;
  return (iconTable as Record<string, string>)[iconHash(shapes)] ?? null;
}
