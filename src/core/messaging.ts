/**
 * Talking to the service worker — and behaving sensibly when there is none, because the engine
 * also runs in a plain page (that is how `test/check.sh` exercises it).
 */

import { sel } from "./const";
import { parseInventory } from "./mapping";
import { detectTheme } from "./snapshot";
import { options } from "../shared/options";
import type { GsapTween, InventoryEntry, MeasureResult, Message, MotionInfo, ProbeResult, PropShape, Reference, SourceLoc, StateIndices } from "../shared/types";

/** Messaging the service worker — or a reason there is none, since the engine also runs bare. */
export async function send(msg: Message): Promise<unknown> {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error("not running as an extension");
  return await chrome.runtime.sendMessage(msg);
}

export async function measureAll(states: StateIndices): Promise<MeasureResult> {
  const empty: MeasureResult = { viewports: [], states: [], shots: [] };
  // Fast mode skips the debugger entirely: no viewport, state, theme or screenshot capture, and no
  // "started debugging this browser" bar. The existing "unavailable" paths handle the rest, and the
  // pointer-still-on-the-element caveat that `error` triggers is honest here — nothing parked it.
  if (options.fast) return { ...empty, error: "fast mode (no debugger); re-pick with Fast off for viewports, states, themes and screenshots" };
  try {
    const msg = { type: "measure", states, theme: detectTheme(), options } as const;
    return ((await send(msg)) as MeasureResult) ?? { ...empty, error: "no response" };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}


export async function getReference(): Promise<Reference | null> {
  try {
    const r = (await send({ type: "get-reference" })) as Reference | null;
    return r && !("error" in r) ? r : null;
  } catch {
    return null;
  }
}


// ---------- framework: React fiber (component names + handler source), Vue ----------
// Page-JS expandos (__reactFiber$…) are invisible from this isolated world, so background.js runs
// pageProbe() in the MAIN world; elements are handed over via a temporary data-cp-tmp attribute.
export async function frameworkInfo(els: Element[]): Promise<ProbeResult> {
  const info: ProbeResult = { framework: "not detected", chain: [], handlers: [], platformNotes: [], motion: [], gsap: [], sources: [], props: [] };
  els.forEach((el, i) => { for (const a of el.attributes) if (/^on/i.test(a.name)) info.handlers.push(`${sel(i)} ${a.name}="${a.value.slice(0, 300)}"`); });
  try {
    const r = (await send({ type: "probe" })) as ProbeResult | undefined;
    if (r && !r.error) {
      info.framework = r.framework;
      info.chain = r.chain;
      info.handlers.push(...r.handlers);
      info.platform = r.platform;
      info.platformNotes = r.platformNotes ?? [];
      info.motion = r.motion ?? [];
      info.gsap = r.gsap ?? [];
      info.sources = r.sources ?? [];
      info.props = r.props ?? [];
    }
  } catch { /* keep defaults */ }
  return info;
}

/** The user's component inventory (#38), from storage — parsed, or empty when there is none. */
export async function inventory(): Promise<InventoryEntry[]> {
  try {
    const raw = (await send({ type: "get-inventory" })) as string | null;
    return raw ? parseInventory(raw) : [];
  } catch {
    return [];
  }
}

/** The Markdown sections built from the MAIN-world probe: motion, GSAP, platform, sources, props. */
export function frameworkSections(p: { motion: MotionInfo[]; gsap: GsapTween[]; platformNotes: string[]; sources: SourceLoc[]; props: PropShape[] }): string[] {
  const out: string[] = [];
  if (p.motion.length) out.push(`## Framer Motion\n${p.motion.map((m) => `${sel(m.id)} <${m.name}>\n${Object.entries(m.props).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`).join("\n\n")}`);
  if (p.gsap.length) out.push(`## GSAP\n${p.gsap.map((t) => `${sel(t.id)} — ${t.vars} · ${t.duration}s · at ${t.start}s${t.paused ? " (paused — likely scroll-driven)" : ""}`).join("\n")}`);
  if (p.platformNotes.length) out.push(`## Platform notes\n${p.platformNotes.map((n) => `- ${n}`).join("\n")}`);
  if (p.sources.length) out.push(`## Source locations (React dev build)\n${p.sources.map((s) => `${sel(s.id)} <${s.component}>  ${s.file}:${s.line}:${s.col}`).join("\n")}\n_Only on a dev build; production/minified sites have no debug source._`);
  if (p.props.length) out.push(`## Props (inferred from the React fiber)\n${p.props.map((pr) => `<${pr.name}>\n${pr.props.map((x) => `  ${x.key}: ${x.value} (${x.type})`).join("\n")}`).join("\n\n")}`);
  return out;
}
