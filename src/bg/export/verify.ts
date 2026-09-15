/**
 * `verify_rebuild`: a rebuild checked against the export, in numbers (#121, #125).
 *
 * The agent that rebuilt the page serves it somewhere — a dev server, usually — and this opens it,
 * re-creates each width the export recorded with the same device metrics, fingerprints it, then
 * replays every recorded hover, focus and press and compares what each one does. No screenshot is
 * taken on either side: "box-shadow should change to 0 8px 24px …" tells the agent what to change.
 *
 * The rebuild opens in its own unfocused window, not a background tab: Chrome does not advance
 * animations or apply a resized viewport in a hidden tab, so a rebuild measured there has every
 * entrance animation frozen on its first frame.
 */

import { compareFingerprints, type Fingerprint } from "../../core/export/fingerprint";
import { compareInteraction, type InteractionDiff, type InteractionRecord } from "../../core/export/interactions";
import { emulateWidth, scrollThrough, stableFingerprint, waitForLoad } from "./export";
import { parkPointer, runInteractions, settle, type PageCall } from "./interactions";
import { callPage } from "../page/page-call";
import { ensurePicker } from "../page/tab";

const MAX_LINES = 40;

/** What export_page writes as interactions.json. */
export interface InteractionsFile { width: number; targets: number; records: InteractionRecord[] }

const listed = (lines: string[]) => [
  ...lines.slice(0, MAX_LINES).map((l) => `- ${l}`),
  ...(lines.length > MAX_LINES ? [`- …and ${lines.length - MAX_LINES} more`] : []),
];

export async function verifyRebuild(url: string, originals: Fingerprint[], interactions?: InteractionsFile | null): Promise<string> {
  if (!/^(https?|file):/.test(url)) throw new Error(`verify_rebuild needs an http(s) or file URL, got ${url}`);
  if (!originals.length) throw new Error("no fingerprints to compare against — pass the folder export_page wrote");
  const win = await chrome.windows.create({ url, focused: false, width: 1500, height: 1000 });
  const tabId = win?.tabs?.[0]?.id;
  if (win?.id === undefined || tabId === undefined) throw new Error("could not open a window for the rebuild");
  const target = { tabId };
  const page: PageCall = (path, ...args) => callPage(tabId, path, args);
  try {
    await waitForLoad(tabId);
    await ensurePicker(tabId);
    await chrome.debugger.attach(target, "1.3");
    const sections: string[] = [];
    let layout = 0, css = 0, script = 0;
    try {
      for (const original of [...originals].sort((a, b) => b.width - a.width)) {
        await emulateWidth(target, original.width);
        // As the export's own sweep did: load what is lazy and fire what reveals on scroll, then rest.
        await scrollThrough(page);
        await page("rebuild.scrollTo", 0);
        await parkPointer(target);
        await settle(page, 600, 4000);
        const c = compareFingerprints(original, await stableFingerprint(page));
        layout += c.mismatches.length;
        sections.push([
          `## ${original.width}px — ${c.mismatches.length ? `${c.mismatches.length} difference(s)` : "matches"}`,
          `${c.matched} of ${original.nodes.length} elements matched · ${c.missing} missing · ${c.extra} extra in the rebuild`,
          ...listed(c.mismatches.map((m) => m.message)),
        ].join("\n"));
      }
      if (interactions?.records.length) {
        const result = await checkInteractions(target, page, interactions);
        css = result.css;
        script = result.script;
        sections.push(result.section);
      }
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
    const count = interactions?.records.length ?? 0;
    const summary = layout + css + script === 0
      ? `The rebuild matches the original at every width${count ? `, including all ${count} interactions` : ""}.`
      : layout + css === 0
        ? `Layout and CSS interactions match at every width. ${script} script-driven interaction difference(s) remain: the original does these with JavaScript, so the rebuild has to implement them in code.`
        : `${layout + css} difference(s)${script ? ` and ${script} script-driven` : ""}, largest first. Fix them and run verify_rebuild again.`;
    return [`# Rebuild check: ${url}`, summary, ...sections].join("\n\n") + "\n";
  } finally {
    await chrome.windows.remove(win.id).catch(() => {});
  }
}

async function checkInteractions(target: chrome.debugger.Debuggee, page: PageCall, file: InteractionsFile) {
  await emulateWidth(target, file.width);
  await page("rebuild.scrollTo", 0);
  await parkPointer(target);
  const located: { record: InteractionRecord; index: number | null }[] = [];
  for (const record of file.records) located.push({ record, index: await page<number | null>("rebuild.interact.locate", record.selector, record.label) });
  const found = located.filter((l): l is { record: InteractionRecord; index: number } => l.index !== null);
  const notes: string[] = [];
  const results = await runInteractions(target, page, found.map((l) => ({ index: l.index, label: l.record.label, action: l.record.action })), notes);

  const perRecord = new Map<InteractionRecord, InteractionDiff[]>();
  for (const l of located) {
    if (l.index === null) perRecord.set(l.record, [{ script: l.record.script.length > 0, message: `${l.record.action} "${l.record.label}" (${l.record.selector}): the element is not in the rebuild` }]);
  }
  found.forEach((l, i) => perRecord.set(l.record, compareInteraction(l.record, results[i])));
  const diffs = [...perRecord.values()].flat();
  const cssDiffs = diffs.filter((d) => !d.script).map((d) => d.message);
  const scriptDiffs = diffs.filter((d) => d.script).map((d) => d.message);
  const matching = [...perRecord.values()].filter((d) => d.length === 0).length;
  return {
    css: cssDiffs.length,
    script: scriptDiffs.length,
    section: [
      `## Interactions at ${file.width}px — ${matching} of ${file.records.length} match`,
      ...listed(cssDiffs),
      ...(scriptDiffs.length ? ["", "### Driven by script in the original — implement these in code", ...listed(scriptDiffs)] : []),
      ...(notes.length ? ["", ...notes.map((n) => `_${n}_`)] : []),
    ].join("\n"),
  };
}
