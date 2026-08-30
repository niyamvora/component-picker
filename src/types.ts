/**
 * The contracts between the extension's three execution worlds.
 *
 * The picker runs in the content script's isolated world, the probe runs in the page's MAIN
 * world, and the measurement driver runs in the service worker — none of them share a call
 * stack, so every mistake between them used to surface as a silently missing section. These
 * types are what makes a rename in one world a compile error in the others.
 */

/** One element's captured style, keyed by the element's index in the picked subtree. */
export interface Block {
  label: string;
  /** Only what differs from the baselines — this is what gets printed. */
  props: Record<string, string>;
  /** Every tracked property's resolved value, so diffs across viewports can compare fairly. */
  raw: Record<string, string>;
  /** Rendered box, rounded. Absent for elements that render nothing. */
  rect?: [number, number];
  pseudos: Record<string, Record<string, string>>;
}

export type Blocks = Record<number, Block>;

/** The interaction states the debugger can force. `:focus-visible` needs `:focus` forced with it. */
export type StateName = "hover" | "focus-visible" | "active";

/** Which elements of the picked subtree the site has a rule for, per state. */
export type StateIndices = Record<StateName, number[]>;

/** One measurement of the picked subtree, taken by the content script on request. */
export interface Snapshot {
  blocks: Blocks;
  /** The picked element's own rendered size at this moment. */
  root: [number, number];
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
}

/** What the service worker returns for one capture. `error` means the debugger never attached. */
export interface MeasureResult {
  viewports: (Partial<Viewport> & Snapshot & { name: string })[];
  states: (Snapshot & { name: StateName })[];
  error?: string;
}

/** What the MAIN-world probe can see that an isolated content script cannot. */
export interface ProbeResult {
  framework: string;
  chain: string[];
  handlers: string[];
  error?: string;
}

export type Message =
  | { type: "measure"; states: StateIndices }
  | { type: "probe" }
  | { type: "snapshot"; settle?: number };
