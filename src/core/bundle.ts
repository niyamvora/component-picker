/**
 * Assembling the bundle: every section, in the order a reader needs them.
 */

import { MAX_ELEMENTS, MAX_OUT, SKIP_TAGS, splitList, TMP, UI } from "./const";
import { computeBlocks, diffBlocks, label, renderBlock } from "./blocks";
import { ago, compareWithReference } from "./compare";
import { htmlOf, icons } from "./html";
import { a11ySnapshot } from "./a11y";
import { runningAnimations } from "./animations";
import { scrollBehaviour } from "./scroll";
import { findRepeats } from "./repeats";
import { toTailwind } from "./tailwind";
import { toJsx } from "./jsx";
import { mapToInventory } from "./mapping";
import { toCssModules, toHtmlCss, toStyledComponents, toSvelte, toVue } from "./emit";
import { paletteSummary } from "./summary";
import { assetUrls } from "./assets";
import { frameworkInfo, frameworkSections, getReference, inventory, measureAll, send } from "./messaging";
import { contextOf, libraries, variantsOf } from "./context";
import { fonts } from "./fonts";
import { matchRules, sheetRules } from "./rules";
import { state } from "./state";
import { tokensSection, varSources } from "./tokens";
import { walk } from "./walk";
import { options, refreshOptions } from "../shared/options";
import type { CaptureSection } from "../shared/types";

export async function extract(root: Element, onStatus: (s: string) => void = () => {}): Promise<string> {
  const all = walk(root);
  // An <svg>'s internals — every <path>, <filter>, <stop> — are complete in the HTML already, so
  // do not give each one a data-cp and a CSS block (almost always just `box-sizing: border-box`).
  // Keep the <svg> element itself; its size, colour and filter matter.
  const svgInternal = (e: Element) => e.tagName.toLowerCase() !== "svg" && !!e.closest("svg");
  const eligible = all.filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase()) && !e.closest(`[${UI}]`) && !svgInternal(e));
  const els = eligible.slice(0, MAX_ELEMENTS);
  state.pending = els;
  await refreshOptions();
  state.rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  els.forEach((el, i) => el.setAttribute(TMP, String(i)));
  try {
    return await build(root, all, eligible, els, onStatus);
  } finally {
    els.forEach((el) => el.removeAttribute(TMP));
  }
}

/**
 * Row labels for the sections whose Markdown heading is a sentence.
 *
 * A heading earns its length in the bundle — `## Theme: dark (diff vs light) — via class` says
 * everything a reader needs — but the drawer's rows are 300px wide, so the ones that read as
 * sentences get a name here. Everything absent takes its heading verbatim, which is why
 * `Component (JSX)` and `Component (Vue SFC)` stay told apart.
 */
const TITLES: Record<string, string> = {
  header: "Header", howto: "How to use", context: "Context", css: "CSS (desktop)",
  states: "States", variants: "Variants", "source-rules": "Source rules", responsive: "Responsive",
  theme: "Theme", compare: "Compared with reference", media: "Media", tailwind: "Tailwind",
  "css-modules": "CSS Modules", js: "JS / handlers", canvas: "Canvas / WebGL", sources: "Source locations", props: "Props",
};

async function build(root: Element, all: Element[], eligible: Element[], els: Element[], onStatus: (s: string) => void): Promise<string> {
  const { styleRules, varRules, allRules, keyframes, fontFaces } = sheetRules();
  const { found: rules, states, media } = matchRules(root, els, styleRules);
  state.sources = varSources(root, els, varRules);

  // Everything measurable is measured in one debugger session, starting with the resting
  // desktop state — the pointer is still on the element the user just clicked, and reading
  // getComputedStyle here would record its :hover styles as if they were the resting ones.
  onStatus("Measuring viewports, states, themes…");
  const resp = await measureAll(states);
  const desktop = resp.viewports?.[0]?.blocks ?? computeBlocks(els);
  const reference = await getReference();
  state.lastBlocks = desktop;

  const stamp = new Set<number>([0]);
  for (const i of Object.keys(desktop)) if (Object.keys(desktop[+i].props).length || Object.keys(desktop[+i].pseudos).length) stamp.add(+i);
  for (const line of rules) for (const m of line.matchAll(/data-cp="(\d+)"/g)) stamp.add(+m[1] - 1);
  // Repeated siblings (#37): a card's instances are "the same" when their measured blocks barely differ.
  const sameStructure = (a: Element, b: Element) => {
    const ba = computeBlocks([a, ...a.querySelectorAll("*")].slice(0, 60));
    const bb = computeBlocks([b, ...b.querySelectorAll("*")].slice(0, 60));
    const changed = diffBlocks(ba, bb).length;
    return changed <= Math.max(2, Object.keys(ba).length * 0.2);
  };
  const repeats = findRepeats(root, els, sameStructure);
  const html = htmlOf(root, all, els, stamp, repeats.fold);

  const anims = new Set(els.flatMap((el) => splitList(getComputedStyle(el).animationName)).filter((n) => n !== "none"));
  const kf = [...anims].map((n) => keyframes[n]).filter(Boolean);
  const font = fonts(els, fontFaces);
  const { framework, chain, handlers: js, platform, platformNotes, motion, gsap, lottie, anime, canvases, sources, props } = await frameworkInfo(els);
  const variants = variantsOf(root, els, desktop);
  const libs = libraries(els);
  const rootSrc = sources.find((x) => x.id === 0);
  const running = runningAnimations(els, anims);
  const scroll = scrollBehaviour(els, allRules);
  const rect = root.getBoundingClientRect();

  const md: string[] = [];
  // The bundle is assembled twice over: as one string (what gets copied) and as the same text in
  // named parts (what the drawer ticks, #80). One push routes to both, so the section list cannot
  // drift from what the bundle actually contains.
  const sections: CaptureSection[] = [];
  const part = (id: string, text: string) => {
    md.push(text);
    const seen = sections.find((s) => s.id === id);
    // A section pushed several times — one per viewport, one per state — is one part; the bodies
    // concatenate with the same separator `md.join` uses, so joining the parts rebuilds the bundle.
    if (seen) seen.body += `\n\n${text}`;
    else sections.push({ id, title: TITLES[id] ?? /^## (.+)/.exec(text)?.[1] ?? id, body: text });
  };
  part("header", `# Component picked from ${document.title || location.hostname} — ${location.href}`);
  part("header", `Picked: ${label(root)} ${Math.round(rect.width)}×${Math.round(rect.height)} at (${Math.round(rect.left + scrollX)}, ${Math.round(rect.top + scrollY)}). ` +
    `Desktop viewport ${innerWidth}×${innerHeight} @${devicePixelRatio}x. ` +
    `Framework: ${framework}.${chain.length ? ` Component chain: ${chain.join(" › ")}.` : ""}` +
    `${libs.length ? ` UI: ${libs.join(" + ")}.` : ""}` +
    `${platform ? ` Platform: ${platform}.` : ""}` +
    `${rootSrc ? ` Source: ${rootSrc.file}:${rootSrc.line}:${rootSrc.col}.` : ""}` +
    `${icons.size ? ` Icons: ${[...icons].join(", ")}.` : ""}` +
    `${eligible.length > els.length ? ` NOTE: subtree has ${eligible.length} elements; CSS captured for the first ${els.length}.` : ""}`);
  part("howto", `> How to use: paste this to your AI. \`data-cp\` ids on HTML nodes match the CSS selectors below. CSS values are browser-resolved (px/rgb) diffs against browser defaults and the parent element; \`/* … W×H */\` comments are the real rendered box. State, Variant and Responsive sections list ONLY what changes vs the resting desktop capture. \`/* …rem */\` comments restate px against the page's root size (${state.rootPx}px), and \`/* @media … */\` names the breakpoint behind a responsive change. Rebuild as a React/Next.js component in the project's styling system (Tailwind/CSS modules), keep hover/focus/animation rules, swap absolute asset URLs for local assets.`);
  const context = contextOf(root);
  if (context) part("context", `## Context (what the picked element sits in)\n\`\`\`css\n${context}\n\`\`\``);
  part("html", `## HTML\n\`\`\`html\n${html}\n\`\`\``);
  const cssText = Object.keys(desktop).flatMap((i) => renderBlock(+i, desktop[+i])).join("\n\n");
  part("css", `## CSS (desktop, resting state)` +
    (resp.error ? `\n_Measured with the pointer still on the element — hover styles may be included._` : "") +
    `\n\`\`\`css\n${cssText}\n\`\`\``);
  for (const st of resp.states || []) {
    const diff = diffBlocks(desktop, st.blocks);
    part("states", `## State: ${st.name} (diff vs resting)\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No changes._"));
  }
  if (variants.length) part("variants", `## Variants (siblings of the picked element)\n\n${variants.join("\n\n")}`);
  if (rules.length) part("source-rules", `## Source rules (hover/focus/media, from the site's stylesheets)\n\`\`\`css\n${rules.join("\n\n")}\n\`\`\``);
  if (resp.error) part("responsive", `## Responsive + states\n_Viewport and interaction-state snapshots unavailable: ${resp.error}. Use the source rules above._`);
  for (const v of (resp.viewports || []).slice(1)) {
    const diff = diffBlocks(desktop, v.blocks, media, v.width);
    part("responsive", `## Responsive: ${v.name} ${v.width}×${v.height} (DPR ${v.dpr}) — root renders ${v.root[0]}×${v.root[1]}\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No style changes vs desktop; layout only reflows._"));
  }
  if (resp.theme) {
    part("theme", "error" in resp.theme
      ? `## Theme\n_The other theme could not be captured: ${resp.theme.error}._`
      : `## Theme: ${resp.theme.name} (diff vs ${resp.theme.name === "dark" ? "light" : "dark"}) — via ${resp.theme.how}\n` +
        ((d) => d.length ? `\`\`\`css\n${d.join("\n\n")}\n\`\`\`` : "_Identical in both themes._")(diffBlocks(desktop, resp.theme.blocks)));
  }
  if (reference) {
    part("compare", `## Compared with reference (${reference.label} — ${new URL(reference.url).host}, picked ${ago(reference.at)})\n` +
      compareWithReference(reference.blocks, desktop));
  }
  if (repeats.section) part("repeats", repeats.section);
  const tokens = tokensSection(md, root, els);
  if (tokens) part("tokens", tokens);
  if (options.tailwind) { const tw = toTailwind(desktop); if (tw) part("tailwind", tw); }
  if (options.a11y) { const a = a11ySnapshot(els); if (a) part("a11y", a); }
  const map = mapToInventory(els, await inventory());
  if (map) part("mapping", map);
  if (options.jsx) { const j = toJsx(html, label(root)); if (j) part("jsx", j); }
  if (options.vue) part("vue", toVue(html, cssText));
  if (options.svelte) part("svelte", toSvelte(html, cssText));
  if (options.htmlCss) part("html-css", toHtmlCss(html, cssText));
  if (options.styled) { const sc = toStyledComponents(desktop); if (sc) part("styled", sc); }
  if (options.cssModules) { const cm = toCssModules(desktop); if (cm) part("css-modules", cm); }
  const palette = paletteSummary(desktop);
  if (palette) part("palette", palette);
  for (const m of resp.media ?? []) {
    const diff = diffBlocks(desktop, m.blocks);
    if (diff.length) part("media", `## Media: ${m.name} (diff vs default)\n\`\`\`css\n${diff.join("\n\n")}\n\`\`\``);
  }
  const assetUrlList = assetUrls(els);
  if (assetUrlList.length) part("assets", `## Assets\n- ${assetUrlList.length} asset(s) referenced. Download them (with the HTML rewritten to local paths) from the extension's side panel.`);
  if (running) part("animations", running);
  if (scroll) part("scroll", scroll);
  for (const s of frameworkSections({ motion, gsap, lottie, anime, canvases, platformNotes, sources, props })) part(s.id, s.text);
  if (kf.length) part("keyframes", `## Keyframes\n\`\`\`css\n${kf.join("\n\n")}\n\`\`\``);
  part("fonts", `## Fonts\n${font.lines.join("\n") || "- No text of its own."}` +
    (font.links.length ? `\n- Font stylesheets: ${font.links.join(", ")}` : "") +
    (options.fontFace && font.faces.length ? `\n\`\`\`css\n${font.faces.join("\n")}\n\`\`\`` :
      font.faces.length ? `\n- ${font.faces.length} @font-face rule(s) omitted — set \`window.__cp.opts.fontFace = true\` to include them.` : ""));
  if (js.length && options.js) part("js", `## JS / handlers (React props + inline)\n\`\`\`\n${js.join("\n")}\n\`\`\``);

  let out = md.join("\n\n");
  // The cap applies to the text; images are appended after it, because a bundle whose CSS was
  // truncated to make room for a picture is the wrong trade.
  // ponytail: the section bodies are the untruncated parts, so past the cap they no longer rejoin
  // into `out`. Selective copy is the way to stay under it, so trimming them too would be backwards.
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n\n<!-- truncated: bundle exceeded size cap; pick a smaller component -->";
  const previewBundle = out;
  if (resp.shots?.length) {
    const shots = `## Screenshots\n${resp.shots.map((s) =>
      `${s.name} ${s.width}×${s.height} @${s.dpr}x:\n\n![${s.name}](data:image/png;base64,${s.png})`).join("\n\n")}`;
    part("screenshots", shots);
    out += `\n\n${shots}`;
  }
  state.lastSections = sections;
  // The side panel renders the capture in isolation, so the preview carries exactly what the
  // bundle carries — nothing that only looks right because the real page was still behind it.
  void send({
    type: "preview",
    preview: {
      html, css: cssText, fontLinks: font.links,
      shot: resp.shots?.find((s) => s.name === "desktop")?.png,
      height: Math.round(rect.height), bundle: previewBundle, sections,
    },
  }).catch(() => {});
  return out;
}

/**
 * Several picks in one bundle.
 *
 * Sometimes the unit is "these three cards" or a whole landing page. Each component keeps its own
 * `data-cp` numbering, prefixed so the ids stay unambiguous once they are all in one document.
 */
export async function extractMany(roots: Element[], onStatus: (s: string) => void = () => {}): Promise<string> {
  if (roots.length === 1) return extract(roots[0], onStatus);
  const parts: string[] = [];
  for (const [i, root] of roots.entries()) {
    onStatus(`Component ${i + 1} of ${roots.length}…`);
    const one = await extract(root, () => {});
    // c1-1, c2-1, … so two components' ids can never collide in the pasted document.
    parts.push(`# Component ${i + 1} of ${roots.length}\n\n` + one.replace(/data-cp="(\d+)"/g, `data-cp="c${i + 1}-$1"`).replace(/^# /, "## Source: "));
  }
  return parts.join("\n\n---\n\n");
}
