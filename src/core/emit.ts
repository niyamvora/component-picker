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
