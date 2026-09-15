/**
 * Media as code first (#119).
 *
 * The export's promise is that an agent can build the whole page without a single binary, and
 * fetch a file only as a last resort. SVG already *is* code, so every inline `<svg>` becomes a
 * named file. A raster or a video cannot become code, but it can become a stand-in the agent can
 * write straight into the rebuild: a gradient in the image's own colours, an avatar's initials, a
 * box with the right aspect ratio, a video's playback facts.
 */

import { UI } from "../shared/const";
import { iconName } from "../capture/icons";
import { cssPath } from "../shared/selector";
import { walk } from "../shared/walk";
import type { ManifestEntry } from "./assets-inventory";

export interface SvgFile { name: string; path: string; markup: string; usedBy: string[] }
export interface Palette { colors: string[]; css: string }
export interface VideoFacts { duration?: number; loop: boolean; autoplay: boolean; muted: boolean }
export type Substitute = Record<string, string | number | boolean | string[]>;

/** FNV-1a, 32-bit: stable across runs, which is all a file name needs. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[:/]/g, "-")
  .replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48);

/**
 * Every top-level inline SVG, deduplicated by its drawing rather than its placement: `class`,
 * `data-*`, the root's `style`, ARIA and — when a `viewBox` carries the geometry — its rendered
 * `width`/`height` are what differ between two uses of the same icon, so they are not part of it.
 */
export function inlineSvgs(root: Element = document.body): SvgFile[] {
  const byHash = new Map<string, SvgFile>();
  const taken = new Set<string>();
  for (const svg of walk(root)) {
    if (!(svg instanceof SVGSVGElement) || svg.parentElement?.closest("svg") || svg.closest(`[${UI}]`)) continue;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    for (const el of [copy, ...copy.querySelectorAll("*")]) {
      for (const a of [...el.attributes]) if (a.name === "class" || a.name.startsWith("data-")) el.removeAttribute(a.name);
    }
    for (const a of ["style", "role", "aria-hidden", "aria-label", "focusable", "tabindex"]) copy.removeAttribute(a);
    if (copy.hasAttribute("viewBox")) { copy.removeAttribute("width"); copy.removeAttribute("height"); }
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const markup = copy.outerHTML;
    const key = hash(markup);
    const seen = byHash.get(key);
    if (seen) { seen.usedBy.push(cssPath(svg)); continue; }
    const label = svg.getAttribute("aria-label") || svg.querySelector("title")?.textContent || iconName(svg) || "";
    const base = slug(label) || `icon-${key}`;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    taken.add(name);
    byHash.set(key, { name, path: `assets/svg/${name}.svg`, markup, usedBy: [cssPath(svg)] });
  }
  return [...byHash.values()];
}

const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The colours of an image, and a CSS gradient that stands in for it.
 *
 * Dominant colours come from 4-bit-per-channel buckets, merged when closer than 48 in RGB. The
 * gradient runs along whichever axis changes more, through the average of each third of the image.
 * ponytail: a two-stop-to-three-stop linear approximation. A radial highlight (a light ray) is
 * flattened into the band it sits in; upgrade to a 3×3 grid with a radial stop at the brightest cell.
 */
export function paletteOf(data: Uint8ClampedArray, width: number, height: number): Palette {
  const buckets = new Map<number, number[]>();
  const band = () => [0, 1, 2].map(() => [0, 0, 0, 0]);
  const cols = band(), rows = band();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const acc = buckets.get(key) ?? [0, 0, 0, 0];
      acc[0] += r; acc[1] += g; acc[2] += b; acc[3]++;
      buckets.set(key, acc);
      for (const [bands, at, size] of [[cols, x, width], [rows, y, height]] as const) {
        const c = bands[Math.min(2, Math.floor((at * 3) / size))];
        c[0] += r; c[1] += g; c[2] += b; c[3]++;
      }
    }
  }
  const mean = (a: number[]) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  const colors: number[][] = [];
  for (const c of [...buckets.values()].sort((a, b) => b[3] - a[3]).map(mean)) {
    if (colors.length >= 5) break;
    if (colors.every((k) => dist(k, c) > 48)) colors.push(c);
  }
  const stopsOf = (bands: number[][]) => bands.filter((b) => b[3]).map(mean);
  const spread = (s: number[][]) => s.length < 2 ? 0 : Math.max(...s.slice(1).map((c, i) => dist(c, s[i])));
  const [xs, ys] = [stopsOf(cols), stopsOf(rows)];
  const [dir, stops] = spread(xs) > spread(ys) ? ["90deg", xs] : ["180deg", ys];
  const css = stops.length < 2 || spread(stops) < 8
    ? (colors[0] ? hex(colors[0]) : "transparent")
    : `linear-gradient(${dir}, ${stops.map((c, i) => `${hex(c)} ${Math.round((i * 100) / (stops.length - 1))}%`).join(", ")})`;
  return { colors: colors.map(hex), css };
}

/** Playback facts for every video on the page, by the URL the manifest lists it under. */
export function videoFacts(root: Element = document.body): Record<string, VideoFacts> {
  const out: Record<string, VideoFacts> = {};
  for (const v of walk(root)) {
    if (!(v instanceof HTMLVideoElement)) continue;
    const url = v.currentSrc || v.src || v.querySelector("source")?.src;
    if (!url) continue;
    out[url] = {
      ...(Number.isFinite(v.duration) ? { duration: Math.round(v.duration * 10) / 10 } : {}),
      loop: v.loop, autoplay: v.autoplay, muted: v.muted,
    };
  }
  return out;
}

const initials = (alt = "") => alt.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const stem = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");

/** What to write in the rebuild instead of the file. */
export function substitute(e: ManifestEntry, ctx: { palette?: Palette | null; video?: VideoFacts; svgs?: SvgFile[]; origin?: string } = {}): Substitute {
  const ratio: Substitute = e.width && e.height ? { aspectRatio: `${e.width} / ${e.height}` } : {};
  // `duration` is only ever set when finite (see videoFacts), so no key here is present-but-undefined.
  const video = { ...(ctx.video ?? {}) } as Substitute;
  const colour = ctx.palette?.colors[0];
  switch (e.role) {
    case "decorative-background":
    case "texture":
      return { css: ctx.palette?.css ?? "transparent", colors: ctx.palette?.colors ?? [], note: "CSS stand-in built from the image's own colours" };
    case "avatar":
      return { initials: initials(e.alt), background: colour ?? `hsl(${parseInt(hash(e.url).slice(0, 4), 16) % 360} 40% 60%)`, shape: "circle" };
    case "logo": {
      const svg = e.alt ? ctx.svgs?.find((s) => s.name === slug(e.alt!)) : undefined;
      return svg ? { svg: svg.path } : { text: e.alt || stem(e.url) };
    }
    case "icon":
      return { note: "raster icon: redraw as inline SVG or take it from the project's icon set", ...(colour ? { color: colour } : {}) };
    case "video":
      return { ...ratio, ...video, ...(colour ? { background: colour } : {}),
        note: "pre-rendered video: there is no code source. Keep the file, or rebuild the scene in CSS or 3D" };
    case "font":
      return { faces: e.usedBy, selfHosted: !!ctx.origin && new URL(e.url).origin === ctx.origin };
    case "favicon":
      return { note: "keep the file, or use the project's own icon" };
    default: // content-image, poster, social-image
      return { ...ratio, background: colour ?? "#e5e5e5", alt: e.alt ?? "" };
  }
}
