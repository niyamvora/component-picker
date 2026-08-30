/**
 * The reference → ours → fix → re-pick loop, minus the by-hand part.
 */

import { sel } from "./const";
import type { Blocks } from "../shared/types";

export const ago = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
};

/**
 * The loop this replaces, run by hand: pick on the reference site, pick on ours, compare, fix.
 *
 * Matching is by position in the subtree, which holds when the rebuild mirrors the original and
 * degrades gracefully when it does not — hence the warning when the two structures are far apart.
 */
export function compareWithReference(ref: Blocks, ours: Blocks): string {
  const refIds = Object.keys(ref).map(Number), ourIds = Object.keys(ours).map(Number);
  const head: string[] = [];
  const bigger = Math.max(refIds.length, ourIds.length);
  if (bigger && Math.abs(refIds.length - ourIds.length) / bigger > 0.3) {
    head.push(`_Structures differ (${refIds.length} elements in the reference vs ${ourIds.length} here); the diff is by position and may be noisy._\n`);
  }
  const out: string[] = [];
  for (const i of new Set([...refIds, ...ourIds])) {
    const r = ref[i], o = ours[i];
    if (!o) { out.push(`${sel(i)} — missing here (reference: ${r.label} ${r.rect?.join("×") ?? ""})`); continue; }
    if (!r) { out.push(`${sel(i)} — extra here (${o.label} ${o.rect?.join("×") ?? ""})`); continue; }
    const lines: string[] = [];
    for (const k of new Set([...Object.keys(o.props), ...Object.keys(r.props)])) {
      const ov = o.props[k] ?? o.raw[k], rv = r.props[k] ?? r.raw[k];
      if (ov !== rv) lines.push(`  ${k}: ${ov ?? "(unset)"};  /* reference: ${rv ?? "(unset)"} */`);
    }
    if (lines.length) out.push(`${sel(i)} { /* ${o.label} ${o.rect?.join("×") ?? ""} vs reference ${r.rect?.join("×") ?? ""} */\n${lines.join("\n")}\n}`);
  }
  return head.join("") + (out.length ? `\`\`\`css\n${out.join("\n\n")}\n\`\`\`` : "_Identical to the reference._");
}
