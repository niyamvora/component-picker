export type Scene = {
  id: string;
  t: string;
  title: string;
  goal: string;
  steps: string[];
  /** What must be visible in frame for the shot to count. */
  onScreen: string;
  issues: number[];
};

export const setup = [
  {
    label: "Window",
    detail:
      "1512×861 at 2× — the size every capture in the bundles was taken at, so the numbers on screen match the numbers in the README.",
  },
  {
    label: "Browser",
    detail:
      "A clean Chrome profile. No bookmarks bar, no other extensions pinned, no personal tabs. Component Picker is the only icon in the toolbar.",
  },
  {
    label: "Keystrokes",
    detail:
      "Run KeyCastr (or Chrome's own overlay). Half of this tool is keyboard — ↑ ↓ E M P F R — and an unlabelled keypress reads as magic, not as a feature.",
  },
  {
    label: "Cursor",
    detail:
      "Turn on cursor highlighting and slow the pointer down. The picker follows the mouse; if the mouse is a blur the overlay looks like it is flickering.",
  },
  {
    label: "Capture",
    detail:
      "60 fps, no audio. Add captions in the edit — a silent loop plays on a landing page, a narrated one does not.",
  },
  {
    label: "The paste target",
    detail:
      "A Markdown editor with headings styled and syntax highlighting on, at a large font. Most of the runtime is scrolling a bundle; make it legible at 720p.",
  },
  {
    label: "Sites",
    detail:
      "resend.com/onboarding (tokens, gradients, context), github.com (hover states), ui.shadcn.com (icons, tabs), a Webflow and a GSAP site, and one of your own apps on localhost for the compare loop.",
  },
  {
    label: "DevTools",
    detail:
      "Closed. If DevTools is open on the tab, chrome.debugger cannot attach and the CDP sections are skipped — the bundle will say so on camera.",
  },
];

export const scenes: Scene[] = [
  {
    id: "install",
    t: "0:00 – 0:10",
    title: "Install it",
    goal: "Prove there is no account, no signup, no network — you load a folder and it works.",
    steps: [
      "Download the release zip, unzip it in Finder.",
      "chrome://extensions → toggle **Developer mode** top right.",
      "**Load unpacked** → choose `dist/`.",
      "Pin it from the puzzle-piece menu. The icon lands in the toolbar.",
    ],
    onScreen: "The extensions page, the folder picker, and the icon appearing in the toolbar.",
    issues: [23, 50],
  },
  {
    id: "arm",
    t: "0:10 – 0:20",
    title: "Open the plugin — the panel",
    goal: "Show the popup once, properly. Everything later in the video is a switch in this panel.",
    steps: [
      "Click the toolbar icon (or press **Alt+Shift+C**). The popup opens.",
      "Pan down it slowly, without clicking: **output toggles** (screenshots, states, themes, Tailwind, JSX, tokens JSON, a11y, fast mode) → **viewports** → **Your components** → **MCP bridge** → **compare reference** → the **last ten picks**.",
      "Press **Pick on this page**.",
      "Hold on the transition: the cursor becomes a crosshair, a banner appears at the top, a breadcrumb bar at the bottom.",
    ],
    onScreen: "The whole popup, then the armed page with banner and breadcrumb both visible.",
    issues: [16],
  },
  {
    id: "hover",
    t: "0:20 – 0:35",
    title: "Hover — the overlay",
    goal: "The box model is the thing to sell here. It is DevTools' overlay, on any page, without opening DevTools.",
    steps: [
      "Move slowly across a card. Stop. Let the viewer read the overlay.",
      "Point out the bands: blue outline, **green inset = padding**, **orange outside = margin**.",
      "Read the label — `div.card` and the real rendered size, e.g. `900×32`.",
      "Press **↑** twice to walk up to the parent, **↓** once to come back.",
      "Then click a crumb in the bottom breadcrumb bar to jump straight to an ancestor.",
    ],
    onScreen: "The overlay bands and the label at the same time. Do not let the cursor leave frame.",
    issues: [19, 47],
  },
  {
    id: "refine",
    t: "0:35 – 0:55",
    title: "Aim it — E, M, F, Shift-click, P",
    goal: "Five keys, five seconds each. This is the section that makes it look like a real tool instead of a copy button.",
    steps: [
      "**E** — the edit panel opens. Drag gap 12 → 24 and let the page reflow live on camera.",
      "**M** — measurement rulers to the parent's edges, with pixel numbers.",
      "**F** — freeze, open a dropdown with the mouse, **F** again, hover a menu item. The menu stays open and the outline lands on it.",
      "**Shift-click** a second and third card — all three stay outlined. **Backspace** drops the last.",
      "**P** — every top-level section of the page highlights at once.",
    ],
    onScreen: "The keystroke overlay for every one of these. Without it the viewer sees things happening for no reason.",
    issues: [17, 19, 22, 47, 52],
  },
  {
    id: "capture",
    t: "0:55 – 1:10",
    title: "Click — the capture",
    goal: "The two seconds of debugger bar are not a bug to hide. Show them, then kill them in the fast-mode scene.",
    steps: [
      "Click (or **Enter**). The one-line note box appears.",
      "Type intent for the AI: “rebuild this as our pricing card”. Enter.",
      "Chrome's **“Component Picker started debugging this browser”** bar drops in while it measures viewports, forced states and the other theme. ≈2 s.",
      "The toast confirms the copy. Hold one beat on it.",
    ],
    onScreen: "The note box with real typing in it, then the debugger bar, then the toast.",
    issues: [17, 1],
  },
  {
    id: "bundle",
    t: "1:10 – 2:00",
    title: "Paste — scroll the bundle",
    goal: "The longest scene and the most important. Scroll at reading pace and pause a beat on every heading.",
    steps: [
      "⌘V into the Markdown editor. Start at the top.",
      "**Header** — URL, size, viewport, framework + component chain, `UI: Base UI + Tailwind v4`, platform, icons.",
      "**Context** — three ancestors and the sibling boxes.",
      "**HTML** — `data-cp` ids linking nodes to the CSS below.",
      "**CSS (desktop, resting)** — pause on a `/* var(--gray-a3) */` comment and on a `/* …rem */` hint.",
      "**State: hover / focus-visible / active** — pause; say “only what changed”.",
      "**Variants (siblings)**, **Responsive: mobile / tablet** — pause on an `@media` annotation.",
      "**Theme: light (diff vs dark)**, **Tokens used**, **Palette and type**, **Fonts**.",
      "**Animations**, **Accessibility** (pause on a ⚠ contrast line), **Screenshots**.",
      "If you shot this on your own dev build: **Source locations** (`src/components/Card.tsx:12:4`) and **Props (inferred from the React fiber)**.",
      "End on the `## Component (JSX)` block.",
    ],
    onScreen: "One continuous scroll. No cuts — the length of the bundle IS the argument.",
    issues: [2, 3, 5, 8, 9, 10, 11, 12, 13, 15, 29, 40, 41, 47, 60, 62],
  },
  {
    id: "fast",
    t: "2:00 – 2:12",
    title: "Fast mode — kill the bar",
    goal: "The single best A/B shot in the video. One take, no cut between the two captures.",
    steps: [
      "Capture normally. Debugger bar, two seconds.",
      "Popup → **Fast mode** on.",
      "Capture the same element again. No bar. Near-instant.",
      "Put both bundles side by side: HTML, CSS, tokens, animations and a11y are all still there.",
    ],
    onScreen: "Both captures in one unbroken shot so nobody can accuse the edit of doing the work.",
    issues: [46],
  },
  {
    id: "panel",
    t: "2:12 – 2:25",
    title: "Side panel — verify before you paste",
    goal: "Show the capture is provably faithful, not just plausible.",
    steps: [
      "Open the side panel next to the real page.",
      "The panel renders the component from the bundle alone — no page CSS.",
      "Drag the window to mobile width; both reflow the same way.",
      "Click **Download assets**, unzip on camera: the image, the font, and HTML rewritten to local paths.",
      "Then the popup's **Studio**: save this pick with a name, and show the thumbnail land in the library.",
    ],
    onScreen: "The real component and the rebuilt one in the same frame, matching.",
    issues: [20, 44, 65],
  },
  {
    id: "compare",
    t: "2:25 – 2:40",
    title: "The fix-it loop — R",
    goal: "This is the loop the review team ran by hand all day. Show it collapse into two picks.",
    steps: [
      "Capture the reference card on the real site. **While the toast is up, press `R`.**",
      "Switch to localhost and capture your rebuilt version of the same card.",
      "Paste: the bundle ends with `## Compared with reference`.",
      "Zoom in — only the differing props, each with the reference value beside it.",
    ],
    onScreen: "Both sites in the same take, and the Compared section large enough to read.",
    issues: [14],
  },
  {
    id: "payoff",
    t: "2:40 – 3:00",
    title: "The payoff — paste into the agent",
    goal: "Everything before this was mechanism. This is the reason.",
    steps: [
      "⌘V into Claude Code. Type: “rebuild this in our Next.js project”.",
      "Let it run. Cut the dead time.",
      "Put the rebuild side by side with the original at the same zoom.",
      "Hover the rebuild — the hover state is right too, because it was in the bundle.",
    ],
    onScreen: "Original and rebuild, same frame, same size. That comparison is the whole product.",
    issues: [2, 36, 38, 41],
  },
  {
    id: "mcp",
    t: "3:00 – 3:15",
    title: "MCP — no paste at all",
    goal: "The “oh” moment for anyone already running agents.",
    steps: [
      "Terminal visible: `npx component-picker-mcp`.",
      "Popup → **MCP bridge** on. The badge appears.",
      "In Claude Code, ask it to pick a component. **The picker arms by itself** — hold on that.",
      "Click an element. Cut to the agent's transcript with the bundle already in it.",
      "Second take, faster: Esc out of the picker, then just hold **Alt/Option** and click. Same result, no arming step.",
    ],
    onScreen: "Terminal, browser and agent all in frame if you can manage it. Nobody touches ⌘V.",
    issues: [39, 67],
  },
  {
    id: "close",
    t: "3:15 – 3:30",
    title: "Close",
    goal: "One claim, stated plainly, that no competitor can repeat.",
    steps: [
      "Cut to the repo and the releases page.",
      "Card on screen: **everything runs locally — no network, no analytics, no account.**",
      "Footnote it honestly: the MCP bridge is the one exception, off by default, localhost-only.",
    ],
    onScreen: "The repo, then the claim. Hold three seconds.",
    issues: [51],
  },
];

export const loop = {
  title: "The 15-second hero loop",
  detail:
    "Cut this separately from the long video. It plays silently at the top of this page, so the last frame has to match the first.",
  steps: [
    "Hover a component — one clean approach, no hunting.",
    "Click. The toast confirms.",
    "⌘V into Claude Code.",
    "The rebuilt component renders.",
    "Cut back to the same hover position. Loop.",
  ],
};
