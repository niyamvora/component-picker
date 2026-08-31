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
  return body.split(" · ").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)\s+×(\d+)$/.exec(s);
    return m ? { value: m[1], count: Number(m[2]) } : { value: s, count: 1 };
  });
}

const lineOf = (body: string, prefix: string) => body.split("\n").find((l) => l.startsWith(prefix)) ?? "";

function paletteViz(body: string): HTMLElement | null {
  const colours = parsePaletteLine(lineOf(body, "Colours:"));
  const box = el("div", "padding:4px 0");
  if (colours.length) box.append(colourStrip(colours));
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

// ---------- shared ----------

/** Copy, and say so where the click happened — a chip that does nothing visible reads as broken. */
function flash(target: HTMLElement, text: string) {
  void copy(text);
  const was = target.style.outline;
  target.style.outline = `2px solid ${ACCENT}`;
  setTimeout(() => { target.style.outline = was; }, 800);
}
