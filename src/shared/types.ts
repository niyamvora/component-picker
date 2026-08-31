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

/** A PNG of the picked element at one viewport (#15). */
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
  /** print / reduced-motion / forced-colors, each measured (#45). */
  media?: (Snapshot & { name: string })[];
  error?: string;
}

/** A stored pick to diff later captures against (#14). */
export interface Reference { blocks: Blocks; label: string; url: string; at: number }

/** A Framer Motion component's props (#30) and a GSAP tween targeting the subtree (#31), by element index. */
export interface MotionInfo { id: number; name: string; props: Record<string, string> }
export interface GsapTween { id: number; vars: string; duration: number; start: number; paused: boolean }

/**
 * A Lottie animation on the picked subtree (#89).
 *
 * The only animation format on the web that extracts completely: `animationData` is portable JSON
 * that replays identically anywhere. `json` is it; `summary` stands in when it is too big to inline.
 */
export interface LottieInfo {
  id: number; name: string; frames: number; fps: number; loop: boolean;
  json?: string;
  summary?: string;
}

/** A running anime.js instance touching the subtree (#90) — partial, but enough to describe the motion. */
export interface AnimeInfo {
  id: number; properties: string[]; duration: number; easing: string;
  loop: boolean; direction: string; delay: number;
}

/**
 * A `<canvas>` in the picked subtree (#91).
 *
 * Not an extraction — a scene drawn at runtime has no HTML/CSS to capture. Recording it is what
 * stops a capture from being a silently empty box. `library` is the engine when one was named.
 */
export interface CanvasScene { id: number; width: number; height: number; library: string }

/** What the MAIN-world probe can see that an isolated content script cannot. */
export interface ProbeResult {
  framework: string;
  chain: string[];
  handlers: string[];
  /** The builder behind the page (Webflow, Framer, Shopify…), when one is detected (#33). */
  platform?: string;
  /** Per-platform notes — Webflow's `w-*` classes, Framer layer names, Shopify section types. */
  platformNotes: string[];
  /** Framer Motion props found on captured elements (#30). */
  motion: MotionInfo[];
  /** GSAP tweens targeting the captured subtree (#31). */
  gsap: GsapTween[];
  /** Lottie animations on the subtree, with their full JSON where it fits (#89). */
  lottie: LottieInfo[];
  /** Running anime.js instances animating the subtree (#90). */
  anime: AnimeInfo[];
  /** Canvases in the subtree, with the rendering library when one is detectable (#91). */
  canvases: CanvasScene[];
  /** Source file locations from the React dev build's fiber, when present (#60). */
  sources: SourceLoc[];
  /** Inferred prop shape of picked components (#62). */
  props: PropShape[];
  error?: string;
}

/** A React component's source coordinates, from the dev-build fiber (#60), and its inferred props (#62). */
export interface SourceLoc { id: number; component: string; file: string; line: number; col: number }
export interface PropShape { id: number; name: string; props: { key: string; type: string; value: string }[] }

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
  /** W3C Design Tokens JSON alongside the CSS token list (#35). */
  tokensJson: boolean;
  /** Tailwind class output (#36). */
  tailwind: boolean;
  /** A ready-to-paste JSX component (#41). */
  jsx: boolean;
  /** Accessibility snapshot — roles, names, contrast, focus order (#40). */
  a11y: boolean;
  fast: boolean;          // no debugger attach (#46)
  dockEverywhere: boolean; // glass dock on every page (#72)
  /** print / reduced-motion / forced-colors captures (#45). */
  extraMedia: boolean;
  /** Vue SFC output (#48). */
  vue: boolean;
  /** Svelte output (#48). */
  svelte: boolean;
  /** Plain HTML + CSS files output (#48). */
  htmlCss: boolean;
  /** styled-components output (#64). */
  styled: boolean;
  /** CSS Modules output (#64). */
  cssModules: boolean;
  viewports: Viewport[];
}

/** One component in the target project, for mapping the capture onto it (#38). */
export interface InventoryEntry {
  name: string;
  selectors: string[];
  props: string[];
}

/** A saved component in the library ("Studio", #65). */
export interface LibraryEntry { id: string; name: string; host: string; url: string; at: number; bundle: string; thumb?: string }
/** One entry in the popup's list of recent picks. */
export interface HistoryEntry { label: string; host: string; at: number; bundle: string }

/**
 * One named part of a capture (#80).
 *
 * The bundle is also kept as its parts so the drawer can copy a selection of them rather than the
 * whole thing; `body` is the section exactly as it appears in the joined bundle.
 */
export interface CaptureSection { id: string; title: string; body: string }

/** What the side panel needs to re-render a capture on its own (#20). */
export interface Preview {
  html: string;
  css: string;
  fontLinks: string[];
  /** Base64 PNG of the desktop capture, when screenshots are on. */
  shot?: string;
  height: number;
  bundle: string;
  /** The same capture as named parts, for the drawer's selective copy (#80). */
  sections: CaptureSection[];
}

/** What an element's author stylesheet said, for properties whose value came from a token. */
export interface VarSource {
  /** property → the declaration as authored, e.g. `background-color` → `var(--gray-a3)`. */
  props: Record<string, string>;
  /** custom property → its authored value, so `--tw-*` plumbing can be followed to a real name. */
  customs: Record<string, string>;
}

export type Message =
  | { type: "measure"; states: StateIndices; theme: ThemeInfo | null; options: Options }
  | { type: "probe" }
  | { type: "snapshot"; settle?: number; theme?: "flip" }
  | { type: "set-reference"; reference: Reference }
  | { type: "get-reference" }
  | { type: "get-inventory" }
  | { type: "bridge"; on: boolean }
  | { type: "bridge-result"; bundle: string; pushed?: boolean }
  | { type: "assets" }
  | { type: "screenshot" }
  | { type: "save-to-library"; entry: LibraryEntry }
  | { type: "save-last-to-library" }
  | { type: "get-library" }
  | { type: "delete-from-library"; id: string }
  | { type: "clear-reference" }
  | { type: "picking"; on: boolean }
  | { type: "start-pick" }
  | { type: "remember"; entry: HistoryEntry }
  | { type: "preview"; preview: Preview };
