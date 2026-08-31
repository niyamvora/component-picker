/**
 * The three things a capture sets once and everything else reads.
 *
 * Passing them through every function signature would mean threading four extra parameters
 * through ten call sites for values that are constant within one capture.
 */

import type { Blocks, CaptureSection, VarSource } from "../shared/types";

export const state = {
  /** The page's root font-size at pick time — what every rem hint is measured against. */
  rootPx: 16,
  /** Token sources by element index, from `varSources()`. */
  sources: {} as Record<number, VarSource>,
  /** The picked subtree, kept for the snapshots the service worker asks for. */
  pending: [] as Element[],
  /** The most recent capture's desktop blocks — what "set as reference" stores. */
  lastBlocks: {} as Blocks,
  /** The most recent capture as named parts — what the drawer ticks and copies (#80). */
  lastSections: [] as CaptureSection[],
};

export const blocksOfLastPick = (): Blocks => state.lastBlocks;
export const sectionsOfLastPick = (): CaptureSection[] => state.lastSections;
