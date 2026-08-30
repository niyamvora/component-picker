/**
 * Build the asset zip for the most recent pick, as a data: URL the side panel can hand to a
 * download. Kept apart from `assets.ts` so the collection logic stays testable on its own.
 */

import { assetUrls, collectAssets, rewriteHtml } from "./assets";
import { zip } from "./zip";
import { state } from "./state";

export async function buildAssetZip(): Promise<{ dataUrl: string; count: number } | null> {
  const els = state.pending;
  if (!els.length) return null;
  const urls = assetUrls(els);
  if (!urls.length) return null;
  const collected = await collectAssets(urls);
  const ok = collected.filter((a) => a.bytes.length);
  if (!ok.length) return null;
  const entries = ok.map((a) => ({ name: `assets/${a.name}`, data: Uint8Array.from(a.bytes) }));
  // The HTML with its URLs rewritten to the local asset paths, so the folder is self-contained.
  const html = window.__cp?.last ?? "";
  const okUrls = urls.filter((_, i) => collected[i].bytes.length);
  const okNames = ok.map((a) => a.name);
  entries.push({ name: "component.html", data: Uint8Array.from(rewriteHtml(html, okUrls, okNames)) });
  const skipped = collected.filter((a) => a.skipped).map((a) => a.skipped!);
  if (skipped.length) entries.push({ name: "SKIPPED.txt", data: new TextEncoder().encode(skipped.join("\n")) });
  const bytes = zip(entries);
  // Chunked base64 so a large archive does not blow the call stack.
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { dataUrl: `data:application/zip;base64,${btoa(bin)}`, count: ok.length };
}
