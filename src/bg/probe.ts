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
  const out: ProbeResult = { framework: "not detected", chain: [], handlers: [], platformNotes: [], motion: [], gsap: [], lottie: [], anime: [], canvases: [], sources: [], props: [] };
  if (!root) return out;

  // A guarded stringify: motion/GSAP vars hold MotionValues, functions and cyclic refs.
  const show = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 300) ?? "…"; } catch { return "(not serialisable)"; } };
  /** The whole value, or null when it is bigger than the bundle can carry. */
  const whole = (v: unknown, cap: number) => { try { const s = JSON.stringify(v); return s && s.length <= cap ? s : null; } catch { return null; } };
  /** The nearest captured ancestor of a node — a library's own wrapper is rarely the tagged element. */
  const hostOf = (node: unknown): HTMLElement | null => {
    for (let n = node as HTMLElement | null; n instanceof HTMLElement; n = n.parentElement) {
      if (n.dataset.cpTmp !== undefined) return n;
    }
    return null;
  };

  // The dev-build React transform records where a component was written. ponytail: three known
  // shapes are checked (_debugSource on the fiber, on its owner, and a data-inspector attribute);
  // React 19 dropped _debugSource by default, so a prod/newer site simply yields nothing.
  const shortPath = (f: string) => {
    const m = f.match(/\/((?:src|app|pages|components|lib|ui)\/.*)$/);
    return m ? m[1] : f.split("/").slice(-2).join("/");
  };
  const debugSource = (el: HTMLElement) => {
    for (let f = fiberOf(el); f; f = f.return) {
      const s = f._debugSource || f._debugOwner?._debugSource;
      if (s?.fileName) return { file: shortPath(s.fileName), line: s.lineNumber ?? 0, col: s.columnNumber ?? 0, owner: typeName(f._debugOwner?.type) || typeName(f.type) || "component" };
    }
    const attr = el.closest("[data-inspector-relative-path]");
    if (attr) return { file: attr.getAttribute("data-inspector-relative-path")!, line: Number(attr.getAttribute("data-inspector-line")) || 0, col: Number(attr.getAttribute("data-inspector-column")) || 0, owner: "component" };
    return null;
  };

  // The inferred type of a prop value, for rebuilding a component's API rather than its markup.
  const propType = (v: unknown): string => {
    if (v == null) return String(v);
    if (typeof v === "function") return "ƒ";
    if (Array.isArray(v)) return v.every((x) => x?.$$typeof) ? "node[]" : "array";
    if ((v as any).$$typeof) return "node";
    if (typeof v === "object") return `{ ${Object.keys(v as object).slice(0, 4).join(", ")} }`;
    return typeof v;
  };
  const SKIP_PROP = new Set(["children", "key", "ref", "__source", "__self", "className", "style"]);

  // ---- React fiber: framework, chain, handlers, Framer Motion, source locations, prop shapes ----
  if (fiberOf(root)) {
    const next = (window as any).__NEXT_DATA__ || document.getElementById("__next") || document.querySelector('script[src*="/_next/"]');
    out.framework = next ? "React (Next.js)" : "React";
    for (let f = fiberOf(root); f && out.chain.length < 8; f = f.return) { const n = typeName(f.type); if (n) out.chain.push(n); }
    const MOTION_KEYS = ["initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap",
      "whileFocus", "whileInView", "viewport", "layout", "layoutId", "drag", "custom"];
    for (const el of els) {
      const src = debugSource(el);
      if (src && out.sources.length < 40) out.sources.push({ id: idxOf(el), component: src.owner, file: src.file, line: src.line, col: src.col });
      const p = fiberOf(el)?.memoizedProps;
      if (!p || typeof p !== "object") continue;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "function" && out.handlers.length < 25) out.handlers.push(`[data-cp="${idxOf(el) + 1}"] ${k}: ${v.toString().replace(/\s+/g, " ").slice(0, 300)}`);
      }
      const motion: Record<string, string> = {};
      for (const k of MOTION_KEYS) if (k in p && p[k] !== undefined) motion[k] = show(p[k]);
      const compName = typeName(fiberOf(el)?.type);
      if (Object.keys(motion).length) {
        out.motion.push({ id: idxOf(el), name: `motion.${compName || (el as any).tagName?.toLowerCase()}`, props: motion } as MotionInfo);
      }
      // Prop shape: only real named components (not host <div>s), and only a handful.
      if (compName && out.props.length < 12) {
        const shape = Object.entries(p).filter(([k]) => !SKIP_PROP.has(k)).slice(0, 12)
          .map(([k, v]) => ({ key: k, type: propType(v), value: show(v) }));
        if (shape.length) out.props.push({ id: idxOf(el), name: compName, props: shape });
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

  // ---- Lottie: the one animation format that extracts completely (#89) ----
  // `animationData` is the whole animation as portable JSON, so a capture of it replays identically
  // anywhere — nothing else here is a full extraction rather than a description.
  const MAX_LOTTIE_JSON = 100_000;
  const seenLottie = new Set<unknown>();
  const addLottie = (host: HTMLElement | null, anim: any) => {
    if (!host || !anim || seenLottie.has(anim) || out.lottie.length >= 6) return;
    seenLottie.add(anim);
    const data = anim.animationData;
    if (!data) return;
    const json = whole(data, MAX_LOTTIE_JSON);
    out.lottie.push({
      id: idxOf(host),
      name: String(anim.name || anim.path || "animation").slice(0, 120),
      frames: Math.round(Number(anim.totalFrames ?? data.op ?? 0)),
      fps: Number(anim.frameRate ?? data.fr ?? 0),
      loop: !!anim.loop,
      json: json ?? undefined,
      // Too big to paste is still worth naming; the JSON is reachable through the asset zip.
      summary: json ? undefined : `layers: ${data.layers?.length ?? "?"}, assets: ${data.assets?.length ?? 0} — too large to inline; use the asset zip`,
    });
  };
  try {
    // Three shapes, because the players do not agree on where the instance lives.
    for (const el of document.querySelectorAll<any>("lottie-player, dotlottie-player")) {
      addLottie(hostOf(el), el.getLottie?.() ?? el._lottie ?? null);
    }
    for (const anim of (window as any).lottie?.getRegisteredAnimations?.() ?? []) {
      addLottie(hostOf(anim?.wrapper), anim);
    }
    for (const el of els) addLottie(el, (el as any).__lottie);
  } catch { /* players and versions differ; a miss is fine, a throw is not */ }

  // ---- anime.js: what is running on the subtree right now (#90) ----
  // v3 and v4 renamed enough internals that every read is worth its own try — a version this does
  // not know should cost the section, not the capture.
  for (const inst of ((window as any).anime?.running ?? []) as any[]) {
    if (out.anime.length >= 20) break;
    try {
      const host = ((inst.animatables ?? []) as any[]).map((a) => hostOf(a?.target)).find(Boolean);
      if (!host) continue;
      const props = [...new Set(((inst.animations ?? []) as any[]).map((a) => a?.property).filter(Boolean))];
      out.anime.push({
        id: idxOf(host), properties: props.slice(0, 12) as string[],
        duration: Math.round(Number(inst.duration) || 0), easing: String(inst.easing ?? ""),
        loop: !!inst.loop, direction: String(inst.direction ?? ""), delay: Math.round(Number(inst.delay) || 0),
      });
    } catch { /* skip this instance quietly */ }
  }

  // ---- Canvas / WebGL: detect it, name it, and say plainly that it is not code (#91) ----
  // A GPU scene cannot be captured as HTML/CSS. Pretending otherwise would be a lie; saying nothing
  // leaves the user wondering why their capture is an empty <canvas>.
  const three = (window as any).THREE;
  const engineName = (c: HTMLCanvasElement) =>
    // three.js stamps the canvas itself, which beats any global when a page runs more than one engine.
    c.getAttribute("data-engine") ||
    (three ? `three.js${three.REVISION ? ` r${three.REVISION}` : ""}` : "") ||
    ((window as any).rive || (window as any).Rive ? "Rive" : "") ||
    ((window as any).PIXI ? "PixiJS" : "") ||
    ((window as any).BABYLON ? "Babylon.js" : "");
  for (const c of document.querySelectorAll("canvas")) {
    const host = hostOf(c);
    if (!host || out.canvases.length >= 4) continue;
    // ponytail: named globals and data-engine only, never getContext probing. Asking a canvas for a
    // context it does not have CREATES one, and the page's own later getContext then fails. A raw
    // WebGL canvas with no global reads as an unnamed canvas — still the honest note, just vaguer.
    const r = c.getBoundingClientRect();
    out.canvases.push({ id: idxOf(host), width: Math.round(r.width) || c.width, height: Math.round(r.height) || c.height, library: engineName(c) });
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
