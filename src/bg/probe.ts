/**
 * What only the page's own world can see: React's fiber expandos, Framer Motion props, GSAP
 * timelines, and the builder globals (`window.Webflow`, `window.Shopify`).
 *
 * `pageProbe` is serialised by `executeScript`, so it must be self-contained — no imports, no
 * closure over anything in this file. Elements arrive tagged `data-cp-tmp="<index>"`.
 */

import type { GsapTween, MotionInfo, ProbeResult } from "../shared/types";

function pageProbe(): ProbeResult {
  const fiberOf = (el: any) => { const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$")); return k ? el[k] : null; };
  const typeName = (t: any): string | undefined => t && typeof t !== "string" &&
    (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)));
  const els = [...document.querySelectorAll<HTMLElement>("[data-cp-tmp]")]
    .sort((a, b) => Number(a.dataset.cpTmp) - Number(b.dataset.cpTmp));
  const idxOf = (el: HTMLElement) => Number(el.dataset.cpTmp);
  const root = els[0];
  const out: ProbeResult = { framework: "not detected", chain: [], handlers: [], platformNotes: [], motion: [], gsap: [] };
  if (!root) return out;

  // A guarded stringify: motion/GSAP vars hold MotionValues, functions and cyclic refs.
  const show = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 300) ?? "…"; } catch { return "(not serialisable)"; } };

  // ---- React fiber: framework, component chain, handlers, Framer Motion props ----
  if (fiberOf(root)) {
    const next = (window as any).__NEXT_DATA__ || document.getElementById("__next") || document.querySelector('script[src*="/_next/"]');
    out.framework = next ? "React (Next.js)" : "React";
    for (let f = fiberOf(root); f && out.chain.length < 8; f = f.return) { const n = typeName(f.type); if (n) out.chain.push(n); }
    const MOTION_KEYS = ["initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap",
      "whileFocus", "whileInView", "viewport", "layout", "layoutId", "drag", "custom"];
    for (const el of els) {
      const p = fiberOf(el)?.memoizedProps;
      if (!p || typeof p !== "object") continue;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "function" && out.handlers.length < 25) out.handlers.push(`[data-cp="${idxOf(el) + 1}"] ${k}: ${v.toString().replace(/\s+/g, " ").slice(0, 300)}`);
      }
      const motion: Record<string, string> = {};
      for (const k of MOTION_KEYS) if (k in p && p[k] !== undefined) motion[k] = show(p[k]);
      if (Object.keys(motion).length) {
        const name = typeName(fiberOf(el)?.type) || (el as any).tagName?.toLowerCase();
        out.motion.push({ id: idxOf(el), name: `motion.${name}`, props: motion } as MotionInfo);
      }
    }
  } else if ((root as any).__vueParentComponent || (root as any).__vue__) {
    const vue = (root as any).__vueParentComponent || (root as any).__vue__;
    out.framework = `Vue (${vue.type?.name || vue.$options?.name || "component"})`;
  }

  // ---- GSAP: tweens whose targets are in the captured subtree ----
  const gsap = (window as any).gsap;
  if (gsap?.globalTimeline?.getChildren) {
    try {
      const children = gsap.globalTimeline.getChildren(true, true, true);
      for (const t of children) {
        if (out.gsap.length >= 30 || typeof t.targets !== "function") continue;
        const hit = (t.targets() as any[]).find((el) => el?.dataset?.cpTmp !== undefined);
        if (!hit) continue;
        out.gsap.push({ id: Number(hit.dataset.cpTmp), vars: show(t.vars), duration: t.duration?.() ?? 0, start: t.startTime?.() ?? 0, paused: !!t.paused?.() } as GsapTween);
      }
    } catch { /* GSAP internals vary by version; a miss is fine */ }
  }

  // ---- Platform: the builder behind the page ----
  const has = (sel: string) => !!document.querySelector(sel);
  const attrOnScan = (prefix: string) => els.some((el) => [...el.attributes].some((a) => a.name.startsWith(prefix)));
  // Webflow's own classes are specific words (w-container, w-row, w-nav…) — never Tailwind's
  // w-[270px] / w-full / w-1/2. Matching a bare "w-" prefix false-positives on every Tailwind site.
  const WF = /^w-(container|row|col|nav|navbar|button|inline-block|embed|form|dropdown|slider|tab|tabs|richtext|dyn-list|dyn-item|clearfix|layout|node|widget|lightbox|background-video)\b/;
  const wfClassCount = els.filter((el) => [...el.classList].some((c) => WF.test(c))).length;
  if (document.documentElement.hasAttribute("data-wf-page") || (window as any).Webflow || wfClassCount >= 2) {
    out.platform = "Webflow";
    const wClasses = new Set<string>();
    for (const el of els) for (const c of el.classList) if (WF.test(c)) wClasses.add(c);
    if (wClasses.size) out.platformNotes.push(`Webflow grid/util classes to replace: ${[...wClasses].join(", ")}`);
    const wids = els.filter((el) => el.hasAttribute("data-w-id")).map((el) => `[data-cp="${idxOf(el as HTMLElement) + 1}"]`);
    if (wids.length) out.platformNotes.push(`IX2 interaction targets: ${wids.join(", ")} (data-w-id).`);
  } else if (attrOnScan("data-framer-") || has("#__framer-badge-container") || (window as any).__framer_events) {
    out.platform = "Framer";
    for (const el of els) { const n = el.getAttribute("data-framer-name"); if (n) out.platformNotes.push(`[data-cp="${idxOf(el as HTMLElement) + 1}"] Framer layer "${n}"`); }
  } else if ((window as any).Shopify || has("[data-section-type]") || has(".shopify-section")) {
    out.platform = "Shopify";
    for (const el of els) { const s = el.getAttribute("data-section-type"); if (s) out.platformNotes.push(`[data-cp="${idxOf(el as HTMLElement) + 1}"] Shopify section "${s}"`); }
  } else if (document.body.className.includes("wp-") || has('[class*="wp-block-"]')) {
    out.platform = "WordPress";
    const blocks = new Set<string>();
    for (const el of els) for (const c of el.classList) if (c.startsWith("wp-block-")) blocks.add(c);
    if (blocks.size) out.platformNotes.push(`WordPress blocks: ${[...blocks].join(", ")}`);
  }
  return out;
}

export async function probe(tabId: number): Promise<ProbeResult> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageProbe });
  return r.result as ProbeResult;
}
