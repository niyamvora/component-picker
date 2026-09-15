/**
 * `verify_rebuild`: a rebuild checked against the export's fingerprints, in numbers (#121).
 *
 * The agent that rebuilt the page serves it somewhere — a dev server, usually — and this opens it
 * in a background tab, re-creates each width the export recorded with the same device metrics,
 * fingerprints it, and reports what differs, largest first. No screenshot is taken on either side:
 * "font-size: 48px, original 56px" tells the agent what to change, and a picture would not.
 */

import { compareFingerprints, type Fingerprint } from "../../core/export/fingerprint";
import { emulateWidth, waitForLoad } from "./export";
import { callPage } from "../page/page-call";
import { ensurePicker } from "../page/tab";

const MAX_LINES = 40;
const SETTLE_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function verifyRebuild(url: string, originals: Fingerprint[]): Promise<string> {
  if (!/^(https?|file):/.test(url)) throw new Error(`verify_rebuild needs an http(s) or file URL, got ${url}`);
  if (!originals.length) throw new Error("no fingerprints to compare against — pass the folder export_page wrote");
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("could not open a tab for the rebuild");
  const tabId = tab.id;
  const target = { tabId };
  try {
    await waitForLoad(tabId);
    await ensurePicker(tabId);
    await chrome.debugger.attach(target, "1.3");
    const sections: string[] = [];
    let differences = 0;
    try {
      for (const original of [...originals].sort((a, b) => b.width - a.width)) {
        await emulateWidth(target, original.width);
        await sleep(SETTLE_MS);
        const c = compareFingerprints(original, await callPage<Fingerprint>(tabId, "rebuild.fingerprint"));
        differences += c.mismatches.length;
        const lines = c.mismatches.slice(0, MAX_LINES).map((m) => `- ${m.message}`);
        if (c.mismatches.length > MAX_LINES) lines.push(`- …and ${c.mismatches.length - MAX_LINES} more`);
        sections.push([
          `## ${original.width}px — ${c.mismatches.length ? `${c.mismatches.length} difference(s)` : "matches"}`,
          `${c.matched} of ${original.nodes.length} elements matched · ${c.missing} missing · ${c.extra} extra in the rebuild`,
          ...lines,
        ].join("\n"));
      }
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
    return [
      `# Rebuild check: ${url}`,
      differences ? `${differences} difference(s), largest first at each width. Fix them and run verify_rebuild again.` : "The rebuild matches the original at every width.",
      ...sections,
    ].join("\n\n") + "\n";
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}
