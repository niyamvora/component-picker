/**
 * The captured markup for frameworks other than React.
 *
 * Anima and Locofy sell multi-framework export at $20+/month. Once the JSX transform exists, Vue,
 * Svelte and plain HTML are the same tree with different attribute rules — the marginal cost is
 * small and it removes the "not for my stack" objection.
 */

/** The captured HTML wrapped in a Vue SFC — `class` stays `class`, CSS goes in a scoped block. */
export function toVue(html: string, css: string): string {
  return `## Component (Vue SFC)\n\`\`\`vue\n<template>\n${indent(html, 1)}\n</template>\n\n<style scoped>\n${css}\n</style>\n\`\`\``;
}

/** Svelte: the HTML almost unchanged, CSS scoped by default. */
export function toSvelte(html: string, css: string): string {
  return `## Component (Svelte)\n\`\`\`svelte\n${html}\n\n<style>\n${css}\n</style>\n\`\`\``;
}

/** Plain HTML + a linked stylesheet, so it splits mechanically into two files. */
export function toHtmlCss(html: string, css: string): string {
  const withLink = html.replace(/^(<\w[^>]*)>/, '$1>\n  <!-- <link rel="stylesheet" href="component.css"> -->');
  return `## Component (plain HTML + CSS)\n\`\`\`html\n${withLink}\n\`\`\`\n\`\`\`css\n${css}\n\`\`\``;
}

const indent = (text: string, depth: number) => text.split("\n").map((l) => "  ".repeat(depth) + l).join("\n");

/** A PascalCase component name from a `label` like `div.card` or `h2.title`. */
const compName = (label: string) => (label.match(/[a-z][\w-]*/i)?.[0] ?? "El").replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());

/**
 * styled-components: one `styled.<tag>` per element that has its own block. A lossy convenience —
 * the resolved CSS section stays authoritative; this just saves the transcription.
 */
export function toStyledComponents(blocks: import("../shared/types").Blocks): string {
  const seen = new Set<string>();
  const defs: string[] = [];
  for (const i of Object.keys(blocks)) {
    const b = blocks[+i];
    const decls = Object.entries(b.props);
    if (!decls.length) continue;
    let name = compName(b.label); while (seen.has(name)) name += "_"; seen.add(name);
    const tag = b.label.split(/[.#]/)[0] || "div";
    defs.push(`const ${name} = styled.${tag}\`\n${decls.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n\`;`);
  }
  return defs.length ? `## Component (styled-components)\n\`\`\`tsx\nimport styled from "styled-components";\n\n${defs.join("\n\n")}\n\`\`\`` : "";
}

/** CSS Modules: a `.module.css` block plus the class names to reference as `styles.<name>`. */
export function toCssModules(blocks: import("../shared/types").Blocks): string {
  const rules: string[] = [];
  for (const i of Object.keys(blocks)) {
    const b = blocks[+i];
    const decls = Object.entries(b.props);
    if (!decls.length) continue;
    const cls = (b.label.match(/\.([\w-]+)/)?.[1]) ?? b.label.split(/[.#]/)[0];
    rules.push(`.${cls} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`);
  }
  return rules.length ? `## CSS Modules (component.module.css — reference as styles.<name>)\n\`\`\`css\n${rules.join("\n\n")}\n\`\`\`` : "";
}
