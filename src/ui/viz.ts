/**
 * The capture, seen rather than read.
 *
 * `Colours: rgb(240, 240, 240) ×12` is data; five chips side by side is understanding. Everything
 * here renders from text the capture already emitted — no new extraction, and no second source of
 * truth to drift: the section bodies are the input, so a visualization can only ever show what the
 * bundle would paste.
 */

import { el } from "./hud";
import { copy } from "./note";
import type { CaptureSection } from "../shared/types";

const DIM = "rgba(245,245,247,.7)";
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
const ACCENT = "#2563eb";
/** Alpha has to be visible, so a translucent chip is drawn over a checkerboard. */
const CHECKER = "conic-gradient(rgba(255,255,255,.22) 0 25%, rgba(0,0,0,.3) 0 50%, rgba(255,255,255,.22) 0 75%, rgba(0,0,0,.3) 0) 0 0/8px 8px";

/** The visual form of a section, or null for the ones that are only ever text. */
export function visualise(section: CaptureSection): HTMLElement | null {
  if (section.id === "palette") return paletteViz(section.body);
  if (section.id === "tokens") return tokenChips(parseTokens(section.body));
  if (section.id === "fonts") return typeSpecimens(section.body.split("\n"));
  if (section.id === "animations") return animationCards(section.body);
  return null;
}

// ---------- palette (#85) ----------

/**
 * One `Colours: …` / `Spacing: …` line into its values and their counts.
 *
 * Values carry commas and spaces (`rgb(250, 250, 250)`) but never the ` · ` separator, so splitting
 * on it is safe. The spacing line ends with the grid note, which is not a value.
 */
export function parsePaletteLine(line: string): { value: string; count: number }[] {
  const body = line.replace(/^[A-Za-z]+:\s*/, "").replace(/\s{2,}\(multiples of.*$/, "");
  return body.split(" \u00b7 ").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)\s+\u00d7(\d+)$/.exec(s);
    return m ? { value: m[1], count: Number(m[2]) } : { value: s, count: 1 };
  });
}

const lineOf = (body: string, prefix: string) => body.split("\n").find((l) => l.startsWith(prefix)) ?? "";

function paletteViz(body: string): HTMLElement | null {
  const colours = parsePaletteLine(lineOf(body, "Colours:"));
  const spacing = parsePaletteLine(lineOf(body, "Spacing:"));
  const box = el("div", "padding:4px 0");
  if (colours.length) box.append(colourStrip(colours));
  if (spacing.length) box.append(spacingBars(spacing, /\(multiples of[^)]*\)/.exec(body)?.[0] ?? ""));
  return box.childElementCount ? box : null;
}

/** The palette as chips. Click one to put its exact value on the clipboard. */
export function colourStrip(colours: { value: string; count: number }[]): HTMLElement {
  const strip = el("div", "display:flex;flex-wrap:wrap;gap:6px;padding:6px 0");
  for (const c of colours) {
    const chip = el("button", `all:unset;display:grid;place-items:center;width:22px;height:22px;border-radius:6px;` +
      `border:1px solid rgba(255,255,255,.2);cursor:pointer;font-size:12px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7);` +
      `background:linear-gradient(${c.value},${c.value}),${CHECKER}`);
    chip.title = `${c.value}${c.count > 1 ? ` ×${c.count}` : ""}`;
    chip.addEventListener("click", () => flash(chip, c.value));
    strip.append(chip);
  }
  return strip;
}

// ---------- tokens (#85) ----------

/** The `--name: value;` lines of the Tokens section; the JSON block below them is not a token list. */
export function parseTokens(body: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^(--[\w-]+):\s*(.+?);\s*$/.exec(line.trim());
    if (m) out.push({ name: m[1], value: m[2] });
  }
  return out;
}

/** One row per token: name, a swatch when the value is a colour, the value. Click copies `var(--name)`. */
export function tokenChips(tokens: { name: string; value: string }[]): HTMLElement | null {
  if (!tokens.length) return null;
  const list = el("div", "padding:4px 0");
  for (const t of tokens) {
    const row = el("button", `all:unset;display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:4px 0;cursor:pointer;font:11px/1.4 ${MONO}`);
    row.title = `Copy var(${t.name})`;
    // CSS.supports is the browser's own colour parser — cheaper and more correct than a name list.
    if (CSS.supports("color", t.value)) {
      row.append(el("span", `flex:none;width:14px;height:14px;border-radius:4px;border:1px solid rgba(255,255,255,.2);background:linear-gradient(${t.value},${t.value}),${CHECKER}`));
    }
    row.append(
      Object.assign(el("span", "flex:none;color:#f5f5f7"), { textContent: t.name }),
      Object.assign(el("span", `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:${DIM}`), { textContent: t.value }),
    );
    row.addEventListener("click", () => flash(row, `var(${t.name})`));
    list.append(row);
  }
  return list;
}

// ---------- type and spacing (#86) ----------

/**
 * `- Georgia 700 — 24px/normal (h2.title)` into something renderable.
 *
 * The family can be several words (`Helvetica Neue`), so the weight — always numeric in a computed
 * style — is what separates it from the metrics. Lines that are not a style (`- Font stylesheets:`)
 * simply do not match.
 */
export function parseFontLine(line: string): { family: string; weight: number; size: number; lineHeight: string } | null {
  const m = /^-\s+(.+?)\s+(\d{2,4})\s+\u2014\s+([\d.]+)px\/(\S+)/.exec(line.trim());
  return m ? { family: m[1], weight: Number(m[2]), size: parseFloat(m[3]), lineHeight: m[4] } : null;
}

/** A font list reads as trivia; an `Aa` at size in that face is the typography. */
export function typeSpecimens(lines: string[]): HTMLElement | null {
  const fonts = lines.map(parseFontLine).filter((f): f is NonNullable<typeof f> => !!f);
  if (!fonts.length) return null;
  const list = el("div", "padding:4px 0");
  for (const f of fonts) {
    const row = el("div", "display:flex;align-items:baseline;gap:10px;padding:4px 0");
    // Capped, or a 96px hero headline pushes everything else out of a 300px drawer.
    row.append(Object.assign(el("span", `flex:none;font-family:${f.family},serif;font-weight:${f.weight};font-size:${Math.min(f.size, 28)}px;line-height:1.1;color:#f5f5f7`), { textContent: "Aa" }));
    row.append(Object.assign(el("span", `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:${DIM}`), {
      textContent: `${f.family} ${f.weight} — ${f.size}px/${f.lineHeight}`,
    }));
    list.append(row);
  }
  return list;
}

/** Spacing values as proportional bars: the 4px/8px grid is a shape, not a list of numbers. */
export function spacingBars(values: { value: string; count: number }[], note = ""): HTMLElement {
  const list = el("div", "padding:6px 0");
  for (const v of values) {
    const px = parseFloat(v.value);
    const row = el("div", "display:flex;align-items:center;gap:8px;padding:2px 0");
    row.append(Object.assign(el("span", `flex:none;width:44px;text-align:right;font:11px/1.4 ${MONO};color:${DIM}`), { textContent: v.value }));
    row.append(el("span", `flex:none;height:8px;border-radius:4px;background:${ACCENT};opacity:.6;width:${Math.min(px * 4, 160)}px`));
    list.append(row);
  }
  if (note) list.append(Object.assign(el("div", `font-size:11px;color:${DIM};padding-top:4px`), { textContent: note }));
  return list;
}

// ---------- animation (#87) ----------

const W = 64, H = 36;
/** The canonical control points behind the named easings, so every easing draws the same way. */
const NAMED: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1],
};

/**
 * The easing, drawn. `cubic-bezier(0.4, 0, 0.2, 1)` means nothing on sight; the curve does.
 *
 * Progress runs left to right and 0→1 bottom to top, so the SVG's y is flipped against the bezier's.
 */
export function easingCurve(easing: string): string {
  const svg = (d: string) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" aria-hidden="true"><path d="${d}" stroke="${ACCENT}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const trimmed = easing.trim();
  if (trimmed === "linear") return svg(`M0,${H} L${W},0`);
  const steps = /^steps\(\s*(\d+)/.exec(trimmed);
  if (steps) {
    const n = Math.min(Math.max(Number(steps[1]), 1), 12);
    let d = `M0,${H}`;
    for (let i = 1; i <= n; i++) d += ` H${round((i * W) / n)} V${round(H - (i / n) * H)}`;
    return svg(d);
  }
  const cb = /^cubic-bezier\(([^)]+)\)/.exec(trimmed);
  const p = cb ? cb[1].split(",").map(Number) : NAMED[trimmed];
  // An easing nobody can draw (`linear(...)` points, a custom name) gets the straight line rather
  // than a curve that would claim something untrue about the motion.
  if (!p || p.length !== 4 || p.some((n) => !Number.isFinite(n))) return svg(`M0,${H} L${W},0`);
  return svg(`M0,${H} C${round(p[0] * W)},${round(H - p[1] * H)} ${round(p[2] * W)},${round(H - p[3] * H)} ${W},0`);
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The header line of each running animation: `[data-cp="9"] — (WAAPI) · 400ms · linear · 1× · …`. */
export function parseAnimations(body: string): { name: string; duration: string; easing: string; iterations: string }[] {
  const out: { name: string; duration: string; easing: string; iterations: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^\[data-cp="[^"]+"\]\s+\u2014\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const [name, duration = "", easing = "", iterations = ""] = m[1].split(" \u00b7 ");
    out.push({ name, duration, easing, iterations });
  }
  return out;
}

const MAX_CARDS = 8;

/** One card per running animation: the easing drawn, the timing as the caption. */
export function animationCards(body: string): HTMLElement | null {
  const anims = parseAnimations(body);
  if (!anims.length) return null;
  const list = el("div", "padding:4px 0");
  for (const a of anims.slice(0, MAX_CARDS)) {
    const card = el("div", "display:flex;align-items:center;gap:10px;padding:5px 0");
    const curve = el("div", `flex:none;width:${W}px;height:${H}px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);display:grid;place-items:center`);
    curve.innerHTML = easingCurve(a.easing); // built here from a matched easing, never from page text
    const text = el("div", "min-width:0;flex:1");
    text.append(
      Object.assign(el("div", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap"), { textContent: `${a.name} · ${a.duration} · ${a.iterations}` }),
      Object.assign(el("div", `font:11px/1.4 ${MONO};color:${DIM};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`), { textContent: a.easing }),
    );
    card.append(curve, text);
    list.append(card);
  }
  if (anims.length > MAX_CARDS) {
    list.append(Object.assign(el("div", `font-size:11px;color:${DIM};padding-top:4px`), { textContent: `+${anims.length - MAX_CARDS} more` }));
  }
  return list;
}

// ---------- shared ----------

/** Copy, and say so where the click happened — a chip that does nothing visible reads as broken. */
function flash(target: HTMLElement, text: string) {
  void copy(text);
  const was = target.style.outline;
  target.style.outline = `2px solid ${ACCENT}`;
  setTimeout(() => { target.style.outline = was; }, 800);
}
