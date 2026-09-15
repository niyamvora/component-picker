/**
 * The whole page as one standalone document (#115).
 *
 * `capture_page` splits a page into twelve sections of 300 elements each, because every element
 * carries its own computed CSS. The export takes its CSS from the page's own rules instead
 * (`used-css.ts`), so markup no longer pays per element and nothing is capped: resend.com is 2,535
 * elements, and a rebuild from the first 300 of each section is a rebuild of a different page.
 *
 * What stays is what a rebuild reads: every class verbatim (on a Tailwind site the classes *are*
 * the styling), all text including closed tab panels and menus, ARIA and `data-state`, inline SVG,
 * open shadow roots as declarative templates, and media attributes with their `srcset`. What goes
 * is what runs — scripts, handlers, hydration payloads — and the extension's own UI.
 */

import { UI } from "../shared/const";
import { absolutizeUrls } from "./used-css";
import { cloneDeep } from "../shared/walk";

export interface DomExport { html: string; elements: number }

/**
 * Code, stylesheets already folded into styles.css, and framework plumbing.
 * ponytail: a `<template>` without `shadowrootmode` is dropped as hydration scaffolding; a site
 * that stamps visible content from inert templates at runtime has already stamped it by now.
 */
const DROP = "script, noscript, style, link, meta, base, template:not([shadowrootmode]), next-route-announcer, nextjs-portal";
const DROP_ATTR = /^(on[a-z]+|nonce|data-reactroot|data-cp|data-cp-tmp|data-cp-trigger)$/i;
const URL_ATTRS = new Set(["src", "href", "poster", "action", "data", "xlink:href"]);
const HEAD_META = ['meta[name="viewport"]', 'meta[name="description"]', 'meta[name="color-scheme"]', 'meta[name="theme-color"]'];

/** Every scope `querySelectorAll` has to be asked separately: the body, and each shadow template's content. */
const scopes = (root: ParentNode): ParentNode[] =>
  [root, ...[...root.querySelectorAll("template[shadowrootmode]")].flatMap((t) => scopes((t as HTMLTemplateElement).content))];

/**
 * @param opts.stylesheet  href the head links to; `""` for none. Defaults to `styles.css`.
 * @param opts.mapUrl      absolute URL → what to write instead (a local asset path, #118).
 */
export function exportDom(opts: { stylesheet?: string; mapUrl?: (absolute: string) => string } = {}): DomExport {
  const map = opts.mapUrl ?? ((u: string) => u);
  const base = document.baseURI;
  const abs = (raw: string) => {
    const u = raw.trim();
    if (!u || /^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(u)) return raw;
    try { return map(new URL(u, base).href); } catch { return raw; }
  };
  const srcset = (value: string) => value.trim().startsWith("data:") ? value : value.split(",").map((candidate) => {
    const [u, ...descriptor] = candidate.trim().split(/\s+/);
    return [abs(u), ...descriptor].join(" ");
  }).join(", ");

  const body = cloneDeep(document.body);
  let elements = 0;
  for (const scope of scopes(body)) {
    for (const el of scope.querySelectorAll(`${DROP}, [${UI}]`)) el.remove();
    for (const el of scope.querySelectorAll("*")) {
      elements++;
      for (const a of [...el.attributes]) {
        if (DROP_ATTR.test(a.name)) el.removeAttribute(a.name);
        else if (URL_ATTRS.has(a.name)) el.setAttribute(a.name, abs(a.value));
        else if (a.name === "srcset" || a.name === "imagesrcset") el.setAttribute(a.name, srcset(a.value));
        else if (a.name === "style" && a.value.includes("url(")) {
          el.setAttribute("style", absolutizeUrls(a.value, base).replace(/url\("([^"]+)"\)/g, (_m, u: string) => `url("${map(u)}")`));
        }
      }
    }
  }

  const head = document.createElement("head");
  const charset = document.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  head.append(charset);
  for (const sel of HEAD_META) { const m = document.querySelector(sel); if (m) head.append(m.cloneNode()); }
  head.append(Object.assign(document.createElement("title"), { textContent: document.title }));
  const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  // setAttribute, not `.href =`: the property setter would resolve a mapped local path back to absolute.
  if (icon) { const l = document.createElement("link"); l.setAttribute("rel", "icon"); l.setAttribute("href", abs(icon.href)); head.append(l); }
  const sheet = opts.stylesheet ?? "styles.css";
  if (sheet) { const l = document.createElement("link"); l.setAttribute("rel", "stylesheet"); l.setAttribute("href", sheet); head.append(l); }

  const html = document.documentElement.cloneNode(false) as Element;
  for (const a of [...html.attributes]) if (DROP_ATTR.test(a.name)) html.removeAttribute(a.name);
  html.append(head, body);
  return { html: `<!doctype html>\n${html.outerHTML}\n`, elements };
}
