/**
 * The captured HTML, one mechanical transform away from pasteable JSX.
 *
 * Doing it here removes the step where an AI transcribes markup by hand — which is exactly where it
 * drops attributes. The `data-cp` ids stay, because they tie the JSX back to the CSS section.
 */

import { label } from "./blocks";

const RENAME: Record<string, string> = {
  class: "className", for: "htmlFor", tabindex: "tabIndex", readonly: "readOnly", maxlength: "maxLength",
  colspan: "colSpan", rowspan: "rowSpan", srcset: "srcSet", autocomplete: "autoComplete", contenteditable: "contentEditable",
  "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule", "clip-rule": "clipRule", "clip-path": "clipPath", "stroke-dasharray": "strokeDasharray",
};
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "stop", "use"]);

const camel = (p: string) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** `a:b;c:d` → a JSX style object literal. */
function styleObject(css: string): string {
  const entries = css.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(":");
    return `${JSON.stringify(camel(d.slice(0, i).trim()))}: ${JSON.stringify(d.slice(i + 1).trim())}`;
  });
  return `{{ ${entries.join(", ")} }}`;
}

function attrs(el: Element): string {
  return [...el.attributes].map((a) => {
    if (/^on/i.test(a.name)) return ""; // handlers are listed separately, not inlined
    if (a.name === "style") return ` style=${styleObject(a.value)}`;
    const name = RENAME[a.name] ?? a.name;
    return a.value === "" ? ` ${name}` : ` ${name}=${JSON.stringify(a.value)}`;
  }).join("");
}

function serialise(el: Element, depth: number): string {
  const pad = "  ".repeat(depth);
  const tag = el.tagName.toLowerCase();
  const open = `${pad}<${tag}${attrs(el)}`;
  const kids = [...el.childNodes];
  const childEls = kids.filter((n): n is Element => n instanceof Element);
  const text = kids.filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
  if (!childEls.length && VOID.has(tag)) return `${open} />`;
  if (!childEls.length) {
    // `{` and `}` in text must be escaped, or JSX reads them as an expression.
    const body = /[{}]/.test(text) ? `{${JSON.stringify(text)}}` : text;
    return `${open}>${body}</${tag}>`;
  }
  const inner = childEls.map((c) => serialise(c, depth + 1)).join("\n");
  return `${open}>\n${inner}\n${pad}</${tag}>`;
}

export function toJsx(html: string, rootLabel: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const name = (rootLabel.match(/[a-z][\w-]*/i)?.[0] ?? "Component").replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  return `## Component (JSX)\n\`\`\`tsx\nexport function ${name}() {\n  return (\n${serialise(root, 2)}\n  );\n}\n\`\`\``;
}

export { label };
