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
  /** Its box in viewport coordinates, for the screenshot clip. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
}

/** A PNG of the picked element as it renders at one viewport. */
export interface Shot {
  name: string;
  /** Base64 PNG, straight from `Page.captureScreenshot`. */
  png: string;
  width: number;
  height: number;
  dpr: number;
}

/** How the page decides which theme it is in, and which one is showing. */
export interface ThemeInfo {
  kind: "class" | "attr" | "media";
  /** For `attr`, the attribute driving it (`data-theme`, `data-color-mode`…). */
  attr?: string;
  current: "dark" | "light";
}

/** What the service worker returns for one capture. `error` means the debugger never attached. */
export interface MeasureResult {
  viewports: (Partial<Viewport> & Snapshot & { name: string })[];
  states: (Snapshot & { name: StateName })[];
  shots: Shot[];
  /** The other theme, measured — absent when the page has only one, or when flipping failed. */
  theme?: (Snapshot & { name: "dark" | "light"; how: string }) | { error: string };
  error?: string;
}

/** A stored pick to diff later captures against (#14). */
export interface Reference {
  blocks: Blocks;
  label: string;
  url: string;
  at: number;
}

/** What the MAIN-world probe can see that an isolated content script cannot. */
export interface ProbeResult {
  framework: string;
  chain: string[];
  handlers: string[];
  error?: string;
}

/** A rule that only applies inside a media query, and which elements of the subtree it hits. */
export interface MediaRule {
  ids: number[];
  /** The query as authored, e.g. `(min-width: 40rem)`. */
  cond: string;
  selector: string;
  /** Declared property names, so a diff can tell which change this rule explains. */
  props: string[];
}

/** What the bundle includes. Persisted by the options popup; defaults live in `extract.ts`. */
export interface Options {
  screenshots: boolean;
  fontFace: boolean;
  js: boolean;
  states: boolean;
  themes: boolean;
  viewports: Viewport[];
}

/** One entry in the popup's list of recent picks. */
export interface HistoryEntry {
  label: string;
  host: string;
  at: number;
  bundle: string;
}

export type Message =
  | { type: "measure"; states: StateIndices; theme: ThemeInfo | null; options: Options }
  | { type: "probe" }
  | { type: "snapshot"; settle?: number; theme?: "flip" }
  | { type: "set-reference"; reference: Reference }
  | { type: "get-reference" }
  | { type: "clear-reference" }
  | { type: "picking"; on: boolean }
  | { type: "remember"; entry: HistoryEntry };
