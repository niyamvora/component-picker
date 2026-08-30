/**
 * What only the page's own world can see: React's fiber expandos.
 *
 * `pageProbe` is serialised by `executeScript`, so it has to be self-contained — no imports, no
 * closure over anything in this file. Elements arrive tagged `data-cp-tmp="<index>"`.
 */

import type { ProbeResult } from "../shared/types";

// Runs in the page's MAIN world, where React's __reactFiber$ expandos are visible.
// Self-contained: executeScript serializes it. Elements arrive tagged data-cp-tmp="<index>".
function pageProbe(): ProbeResult {
  const fiberOf = (el: any) => { const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$")); return k ? el[k] : null; };
  const typeName = (t: any): string | undefined => t && typeof t !== "string" &&
    (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)));
  const els = [...document.querySelectorAll<HTMLElement>("[data-cp-tmp]")]
    .sort((a, b) => Number(a.dataset.cpTmp) - Number(b.dataset.cpTmp));
  const root = els[0];
  const out: ProbeResult = { framework: "not detected", chain: [], handlers: [] };
  if (!root) return out;
  if (fiberOf(root)) {
    const next = (window as any).__NEXT_DATA__ || document.getElementById("__next") || document.querySelector('script[src*="/_next/"]');
    out.framework = next ? "React (Next.js)" : "React";
    for (let f = fiberOf(root); f && out.chain.length < 8; f = f.return) { const n = typeName(f.type); if (n) out.chain.push(n); }
    for (const el of els) {
      const p = fiberOf(el)?.memoizedProps;
      if (!p || typeof p !== "object") continue;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "function" && out.handlers.length < 25) out.handlers.push(`[data-cp="${Number(el.dataset.cpTmp) + 1}"] ${k}: ${v.toString().replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  } else if ((root as any).__vueParentComponent || (root as any).__vue__) {
    const vue = (root as any).__vueParentComponent || (root as any).__vue__;
    out.framework = `Vue (${vue.type?.name || vue.$options?.name || "component"})`;
  }
  return out;
}

export async function probe(tabId: number): Promise<ProbeResult> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageProbe });
  return r.result as ProbeResult;
}
