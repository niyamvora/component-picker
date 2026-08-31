/**
 * The picker's entry point: guard against a second injection, answer the service worker's
 * measurement requests, and hand the page over to the handlers.
 *
 * Injected by name on toolbar click — injecting it again toggles the picker off.
 */

import { extract, extractMany } from "../core/bundle";
import { snapshot, snapshotOtherTheme } from "../core/snapshot";
import { buildAssetZip } from "../core/assets-zip";
import { blocksOfLastPick } from "../core/state";
import { currentEl, isActive, start, stop } from "./handlers";
import { applyEdit, commitEdits, edits, revert, toggleEdit } from "./edit";
import { options } from "../shared/options";
import type { Message } from "../shared/types";

declare global {
  interface Window {
    /** The picker's handle on the page, also used to detect a second injection. */
    __cp?: {
      extract: typeof extract; extractMany: typeof extractMany;
      start: () => void; stop: () => void; toggle: () => void;
      last: string; opts: typeof options;
      /** The last capture's desktop blocks — what "set as reference" stores. */
      lastBlocks: typeof blocksOfLastPick;
      /** Zip of the last pick's assets, as a data: URL (#44). */
      assets: () => Promise<{ dataUrl: string; count: number } | null>;
      /** The element under the cursor while picking, for copy-as-image (#63). */
      current: () => Element | null;
      /** Edit helpers, exposed for tests (#52). */
      edit: { toggle: typeof toggleEdit; apply: typeof applyEdit; revert: typeof revert; commit: typeof commitEdits; made: () => string[] };
    };
    /** Set by the test fixture so the picker can be driven without the overlay. */
    __cpNoAutostart?: boolean;
  }
}

if (window.__cp) {
  window.__cp.toggle();
} else {
  // The service worker asks for a measurement whenever it changes the viewport, forces a state,
  // or wants the other theme — which only the page itself can switch when a class drives it.
  chrome.runtime?.onMessage?.addListener((msg: Message, _sender, reply) => {
    if (msg.type !== "snapshot") return;
    const job = msg.theme === "flip"
      ? snapshotOtherTheme(msg.settle ?? 400).then((s) => {
          if (!s) throw new Error("the site re-applied its own theme");
          return s;
        })
      : snapshot(msg.settle ?? 400);
    job.then(reply, (e: unknown) => reply({ error: e instanceof Error ? e.message : String(e) }));
    return true; // keeps the message channel open for the async reply
  });

  window.__cp = {
    extract, extractMany, start, stop,
    toggle: () => (isActive() ? stop() : start()),
    last: "", opts: options, lastBlocks: blocksOfLastPick, assets: buildAssetZip, current: currentEl,
    edit: { toggle: toggleEdit, apply: applyEdit, revert, commit: commitEdits, made: () => [...edits] },
  };
  if (!window.__cpNoAutostart) start();
}
