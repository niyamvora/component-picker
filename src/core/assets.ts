/**
 * The images, fonts and inline SVGs the captured subtree actually uses — collected so the bundle
 * points at local files instead of hotlinking someone else's CDN, which works in the demo and
 * breaks in production. Fetched in the content script, where the page's own origin and cookies make
 * an authenticated asset reachable.
 */

const enc = new TextEncoder();

/** A local filename for a URL, kept unique. */
function filename(url: string, seen: Set<string>): string {
  let base = "asset";
  try { base = new URL(url).pathname.split("/").pop() || "asset"; } catch { /* data: URL */ }
  base = base.replace(/[^\w.-]/g, "_").slice(0, 60) || "asset";
  let name = base, n = 1;
  while (seen.has(name)) name = `${base.replace(/(\.[^.]+)?$/, "")}-${n++}$1`.replace("$1", base.match(/\.[^.]+$/)?.[0] ?? "");
  seen.add(name);
  return name;
}

/** URLs the subtree references, absolute. */
export function assetUrls(els: Element[]): string[] {
  const urls = new Set<string>();
  for (const el of els) {
    if (el instanceof HTMLImageElement && el.currentSrc) urls.add(el.currentSrc);
    const bg = getComputedStyle(el).backgroundImage;
    for (const m of bg.matchAll(/url\((["']?)([^)"']+)\1\)/g)) { try { urls.add(new URL(m[2], location.href).href); } catch { /* skip */ } }
    if (el instanceof HTMLVideoElement && el.poster) urls.add(el.poster);
  }
  // Web fonts the page loaded.
  for (const face of document.fonts as unknown as Iterable<FontFace>) {
    const m = face.status === "loaded" && /url\(([^)]+)\)/.exec((face as any).src ?? "");
    if (m) try { urls.add(new URL(m[1].replace(/["']/g, ""), location.href).href); } catch { /* skip */ }
  }
  return [...urls].filter((u) => !u.startsWith("data:")).slice(0, 40);
}

export interface CollectedAsset { name: string; bytes: number[]; skipped?: string }

/** Fetch each asset. Anything CORS refuses is reported, not fatal. */
export async function collectAssets(urls: string[]): Promise<CollectedAsset[]> {
  const seen = new Set<string>();
  const out: CollectedAsset[] = [];
  for (const url of urls) {
    const name = filename(url, seen);
    try {
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      out.push({ name, bytes: [...buf] });
    } catch (e) {
      out.push({ name, bytes: [], skipped: `${url} (${e instanceof Error ? e.message : "blocked"})` });
    }
  }
  return out;
}

/** The HTML with asset URLs rewritten to `assets/<name>` — for the file inside the zip. */
export function rewriteHtml(html: string, urls: string[], names: string[]): number[] {
  let out = html;
  urls.forEach((u, i) => { out = out.split(u).join(`assets/${names[i]}`); });
  return [...enc.encode(out)];
}
