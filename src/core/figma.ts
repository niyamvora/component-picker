/**
 * The picked component as a flat SVG, for pasting into Figma as editable layers.
 *
 * This is Pluck's design-handoff direction. It is an approximation, not a pixel renderer: each box
 * becomes a <rect> from its rendered geometry and resolved fill/stroke/radius, each text run a
 * positioned <text>, each image an <image>. Good enough to hand a designer a starting frame.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toFigmaSvg(root: Element): string {
  const rootRect = root.getBoundingClientRect();
  const w = Math.round(rootRect.width), h = Math.round(rootRect.height);
  const parts: string[] = [];
  const nodes = [root, ...root.querySelectorAll("*")].slice(0, 200);
  for (const el of nodes) {
    if (el.closest("[data-cp-ui]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    const x = Math.round(r.left - rootRect.left), y = Math.round(r.top - rootRect.top);
    const bg = cs.backgroundColor;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const border = parseFloat(cs.borderTopWidth) || 0;
    // A box for anything with a visible fill or border.
    if ((bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") || border > 0) {
      parts.push(`<rect x="${x}" y="${y}" width="${Math.round(r.width)}" height="${Math.round(r.height)}" rx="${radius}"` +
        ` fill="${bg === "rgba(0, 0, 0, 0)" ? "none" : esc(bg)}"` +
        (border > 0 ? ` stroke="${esc(cs.borderTopColor)}" stroke-width="${border}"` : "") + ` />`);
    }
    if (el instanceof HTMLImageElement && el.currentSrc) {
      parts.push(`<image x="${x}" y="${y}" width="${Math.round(r.width)}" height="${Math.round(r.height)}" href="${esc(el.currentSrc)}" />`);
    }
    // Direct text runs.
    const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
    if (text) {
      parts.push(`<text x="${x}" y="${y + parseFloat(cs.fontSize)}" font-family="${esc(cs.fontFamily.split(",")[0])}"` +
        ` font-size="${parseFloat(cs.fontSize)}" font-weight="${cs.fontWeight}" fill="${esc(cs.color)}">${esc(text.slice(0, 200))}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${parts.join("\n")}\n</svg>`;
}
