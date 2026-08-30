/**
 * Talking to the service worker — and behaving sensibly when there is none, because the engine
 * also runs in a plain page (that is how `test/check.sh` exercises it).
 */

import { sel } from "./const";
import { parseInventory } from "./mapping";
import { detectTheme } from "./snapshot";
import { options } from "../shared/options";
import type { InventoryEntry, MeasureResult, Message, ProbeResult, Reference, StateIndices } from "../shared/types";

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
  const info: ProbeResult = { framework: "not detected", chain: [], handlers: [], platformNotes: [], motion: [], gsap: [] };
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
