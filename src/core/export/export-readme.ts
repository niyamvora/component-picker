/**
 * The README at the top of an export folder (#120): what is in it, in the order to read it, what is
 * approximated, and what could not be captured. Written from what actually ran, so a skipped step
 * is stated rather than silently missing.
 */

import type { ManifestEntry } from "../assets/assets-inventory";
import type { OutlineItem } from "./export-page";

export interface ReadmeInput {
  title: string;
  url: string;
  at: string;
  widths: number[];
  media: "manifest" | "download";
  elements: number;
  css: { kept: number; total: number; breakpoints: string[] };
  manifest: ManifestEntry[];
  svgs: number;
  /** `null` when the state sweep was turned off. */
  states: { file: string; label: string; kind: string }[] | null;
  motion: { tracks: number; streams: number; animations: number } | null;
  /** `null` when the interaction sweep was turned off (#125). */
  interactions?: { records: number; targets: number; script: number } | null;
  outline: OutlineItem[];
  notes: string[];
  files: string[];
  /** Pictures of regions with no code (#122); 0 unless the export was asked for them. */
  fallbackShots?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function exportReadme(i: ReadmeInput): string {
  const roles = Object.entries(i.manifest.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.role]: (acc[e.role] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([role, n]) => `${n} ${role}`).join(", ");
  const downloaded = i.manifest.filter((e) => e.local?.startsWith("assets/media/")).length;
  const read = [
    `**index.html** — the whole page, ${plural(i.elements, "element")}: markup, every class, and all text including closed tabs and menus. Scripts and handlers are removed.`,
    `**styles.css** — the page's own CSS rules, verbatim: ${i.css.kept} of ${i.css.total} rules (the rest match nothing on the page). ${i.css.breakpoints.length ? `Breakpoints: ${i.css.breakpoints.join(", ")}.` : "No viewport breakpoints."} Also in \`breakpoints.json\`.`,
    `**tokens.json** — the custom properties on \`<html>\`, as W3C design tokens.`,
    i.states
      ? `**states/** — ${plural(i.states.length, "state")} opened by clicking: what each tab, disclosure and menu reveals. \`states/index.json\` lists them.`
      : `**states/** — not swept (the export ran with \`states: false\`), so closed tabs and menus appear only as their markup in index.html.`,
    i.motion
      ? `**motion.json** — ${plural(i.motion.animations, "CSS/WAAPI animation")}, ${plural(i.motion.tracks, "script-driven track")} and ${plural(i.motion.streams, "insertion stream")}.`
      : `**motion.json** — not recorded (the export ran with \`motion: false\`); keyframes are still in styles.css.`,
    i.interactions
      ? `**interactions.json** — ${plural(i.interactions.records, "hover, focus or press effect")} on ${plural(i.interactions.targets, "interactive element")}: every shadow, colour, transform and outline each one changes, with its transition timing${i.interactions.script ? `. ${i.interactions.script} of them are driven by script, not CSS — build those in code` : ""}.`
      : `**interactions.json** — not recorded (the export ran with \`interactions: false\`); the :hover, :focus and :active rules are still in styles.css.`,
    `**assets/manifest.json** — ${plural(i.manifest.length, "file")}${roles ? ` (${roles})` : ""}, each with where it is used and a \`replaceWith\` stand-in. Build with the stand-ins first.`,
    `**assets/svg/** — ${plural(i.svgs, "inline SVG")} as files. SVG is code: use these directly.`,
    `**fingerprint.<width>.json** — the layout at ${i.widths.join(" / ")}px. After rebuilding, run \`verify_rebuild\` with this folder for the differences in numbers.`,
  ];
  return [
    `# Rebuild export: ${i.title || i.url}`,
    `Source: ${i.url}  \nExported ${i.at} by Component Picker.`,
    `Code first: ${i.fallbackShots
      ? `the only screenshots are ${plural(i.fallbackShots, "fallback picture")} in \`assets/fallback/\`, of regions that have no code`
      : "there are no screenshots in this folder"}, and binary media is ${i.media === "download"
      ? `included under \`assets/media/\` (${plural(downloaded, "file")}) — as a last resort, after the stand-ins`
      : "described, not downloaded. Re-export with `media: \"download\"` if a file is truly needed"}.`,
    `## Read in this order\n${read.map((r, n) => `${n + 1}. ${r}`).join("\n")}`,
    i.outline.length ? `## Page outline\n${i.outline.map((o) => `- **${o.heading || "(no heading)"}** — \`${o.selector}\` · ${plural(o.elements, "element")}`).join("\n")}` : "",
    `## Approximated\n- \`replaceWith\` stand-ins are built from an image's colours and sizes, not its pixels.\n- Keyframes for script-driven motion are sampled at five points per cycle; easing between them is not recovered.`,
    `## Not captured\n${[...i.notes, "Closed shadow roots, cross-origin iframes and canvas/WebGL scenes have no markup to export.",
      "Values typed into form fields are not included."].map((n) => `- ${n}`).join("\n")}`,
    `## Files\n${[...i.files, "README.md"].sort().map((f) => `- ${f}`).join("\n")}`,
  ].filter(Boolean).join("\n\n") + "\n";
}
