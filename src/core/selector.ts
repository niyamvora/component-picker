/**
 * One way to point at an element from outside the page (#124).
 *
 * The export's files — the asset manifest, the state sweep, the motion recording, the layout
 * fingerprint — all name elements, and an agent reading them has to find the same element in
 * `index.html`. A unique id wins; otherwise a `tag:nth-of-type` chain, which survives the export
 * because the export keeps the element tree as it was.
 */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
    if (e.id && /^[A-Za-z][\w-]*$/.test(e.id) && e.ownerDocument.querySelectorAll(`#${e.id}`).length === 1) {
      parts.unshift(`#${e.id}`);
      break;
    }
    const tag = e.tagName.toLowerCase();
    const siblings = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e!.tagName) : [];
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(e) + 1})` : tag);
  }
  return parts.join(" > ");
}
