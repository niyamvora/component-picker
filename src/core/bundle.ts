/**
 * Assembling the bundle: every section, in the order a reader needs them.
 */

import { MAX_ELEMENTS, MAX_OUT, sel, SKIP_TAGS, splitList, TMP, UI } from "./const";
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
import { frameworkInfo, getReference, inventory, measureAll, send } from "./messaging";
import { contextOf, libraries, variantsOf } from "./context";
import { fonts } from "./fonts";
import { matchRules, sheetRules } from "./rules";
import { state } from "./state";
import { tokensSection, varSources } from "./tokens";
import { walk } from "./walk";
import { options, refreshOptions } from "../shared/options";


export async function extract(root: Element, onStatus: (s: string) => void = () => {}): Promise<string> {
  const all = walk(root);
  const eligible = all.filter((e) => !SKIP_TAGS.has(e.tagName.toUpperCase()) && !e.closest(`[${UI}]`));
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
  const { framework, chain, handlers: js, platform, platformNotes, motion, gsap } = await frameworkInfo(els);
  const variants = variantsOf(root, els, desktop);
  const libs = libraries(els);
  const running = runningAnimations(els, anims);
  const scroll = scrollBehaviour(els, allRules);
  const rect = root.getBoundingClientRect();

  const md: string[] = [];
  md.push(`# Component picked from ${document.title || location.hostname} — ${location.href}`);
  md.push(`Picked: ${label(root)} ${Math.round(rect.width)}×${Math.round(rect.height)} at (${Math.round(rect.left + scrollX)}, ${Math.round(rect.top + scrollY)}). ` +
    `Desktop viewport ${innerWidth}×${innerHeight} @${devicePixelRatio}x. ` +
    `Framework: ${framework}.${chain.length ? ` Component chain: ${chain.join(" › ")}.` : ""}` +
    `${libs.length ? ` UI: ${libs.join(" + ")}.` : ""}` +
    `${platform ? ` Platform: ${platform}.` : ""}` +
    `${icons.size ? ` Icons: ${[...icons].join(", ")}.` : ""}` +
    `${eligible.length > els.length ? ` NOTE: subtree has ${eligible.length} elements; CSS captured for the first ${els.length}.` : ""}`);
  md.push(`> How to use: paste this to your AI. \`data-cp\` ids on HTML nodes match the CSS selectors below. CSS values are browser-resolved (px/rgb) diffs against browser defaults and the parent element; \`/* … W×H */\` comments are the real rendered box. State, Variant and Responsive sections list ONLY what changes vs the resting desktop capture. \`/* …rem */\` comments restate px against the page's root size (${state.rootPx}px), and \`/* @media … */\` names the breakpoint behind a responsive change. Rebuild as a React/Next.js component in the project's styling system (Tailwind/CSS modules), keep hover/focus/animation rules, swap absolute asset URLs for local assets.`);
  const context = contextOf(root);
  if (context) md.push(`## Context (what the picked element sits in)\n\`\`\`css\n${context}\n\`\`\``);
  md.push(`## HTML\n\`\`\`html\n${html}\n\`\`\``);
  const cssText = Object.keys(desktop).flatMap((i) => renderBlock(+i, desktop[+i])).join("\n\n");
  md.push(`## CSS (desktop, resting state)` +
    (resp.error ? `\n_Measured with the pointer still on the element — hover styles may be included._` : "") +
    `\n\`\`\`css\n${cssText}\n\`\`\``);
  for (const st of resp.states || []) {
    const diff = diffBlocks(desktop, st.blocks);
    md.push(`## State: ${st.name} (diff vs resting)\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No changes._"));
  }
  if (variants.length) md.push(`## Variants (siblings of the picked element)\n\n${variants.join("\n\n")}`);
  if (rules.length) md.push(`## Source rules (hover/focus/media, from the site's stylesheets)\n\`\`\`css\n${rules.join("\n\n")}\n\`\`\``);
  if (resp.error) md.push(`## Responsive + states\n_Viewport and interaction-state snapshots unavailable: ${resp.error}. Use the source rules above._`);
  for (const v of (resp.viewports || []).slice(1)) {
    const diff = diffBlocks(desktop, v.blocks, media, v.width);
    md.push(`## Responsive: ${v.name} ${v.width}×${v.height} (DPR ${v.dpr}) — root renders ${v.root[0]}×${v.root[1]}\n` +
      (diff.length ? `\`\`\`css\n${diff.join("\n\n")}\n\`\`\`` : "_No style changes vs desktop; layout only reflows._"));
  }
  if (resp.theme) {
    md.push("error" in resp.theme
      ? `## Theme\n_The other theme could not be captured: ${resp.theme.error}._`
      : `## Theme: ${resp.theme.name} (diff vs ${resp.theme.name === "dark" ? "light" : "dark"}) — via ${resp.theme.how}\n` +
        ((d) => d.length ? `\`\`\`css\n${d.join("\n\n")}\n\`\`\`` : "_Identical in both themes._")(diffBlocks(desktop, resp.theme.blocks)));
  }
  if (reference) {
    md.push(`## Compared with reference (${reference.label} — ${new URL(reference.url).host}, picked ${ago(reference.at)})\n` +
      compareWithReference(reference.blocks, desktop));
  }
  if (repeats.section) md.push(repeats.section);
  const tokens = tokensSection(md, root, els);
  if (tokens) md.push(tokens);
  if (options.tailwind) { const tw = toTailwind(desktop); if (tw) md.push(tw); }
  if (options.a11y) { const a = a11ySnapshot(els); if (a) md.push(a); }
  const map = mapToInventory(els, await inventory());
  if (map) md.push(map);
  if (options.jsx) { const j = toJsx(html, label(root)); if (j) md.push(j); }
  if (running) md.push(running);
  if (scroll) md.push(scroll);
  if (motion.length) {
    md.push(`## Framer Motion\n${motion.map((m) =>
      `${sel(m.id)} <${m.name}>\n${Object.entries(m.props).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`).join("\n\n")}`);
  }
  if (gsap.length) {
    md.push(`## GSAP\n${gsap.map((t) =>
      `${sel(t.id)} — ${t.vars} · ${t.duration}s · at ${t.start}s${t.paused ? " (paused — likely scroll-driven)" : ""}`).join("\n")}`);
  }
  if (platformNotes.length) md.push(`## Platform notes\n${platformNotes.map((n) => `- ${n}`).join("\n")}`);
  if (kf.length) md.push(`## Keyframes\n\`\`\`css\n${kf.join("\n\n")}\n\`\`\``);
  md.push(`## Fonts\n${font.lines.join("\n") || "- No text of its own."}` +
    (font.links.length ? `\n- Font stylesheets: ${font.links.join(", ")}` : "") +
    (options.fontFace && font.faces.length ? `\n\`\`\`css\n${font.faces.join("\n")}\n\`\`\`` :
      font.faces.length ? `\n- ${font.faces.length} @font-face rule(s) omitted — set \`window.__cp.opts.fontFace = true\` to include them.` : ""));
  if (js.length && options.js) md.push(`## JS / handlers (React props + inline)\n\`\`\`\n${js.join("\n")}\n\`\`\``);

  let out = md.join("\n\n");
  // The cap applies to the text; images are appended after it, because a bundle whose CSS was
  // truncated to make room for a picture is the wrong trade.
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n\n<!-- truncated: bundle exceeded size cap; pick a smaller component -->";
  // The side panel renders the capture in isolation, so the preview carries exactly what the
  // bundle carries — nothing that only looks right because the real page was still behind it.
  void send({
    type: "preview",
    preview: {
      html, css: cssText, fontLinks: font.links,
      shot: resp.shots?.find((s) => s.name === "desktop")?.png,
      height: Math.round(rect.height), bundle: out,
    },
  }).catch(() => {});
  if (resp.shots?.length) {
    out += `\n\n## Screenshots\n${resp.shots.map((s) =>
      `${s.name} ${s.width}×${s.height} @${s.dpr}x:\n\n![${s.name}](data:image/png;base64,${s.png})`).join("\n\n")}`;
  }
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
