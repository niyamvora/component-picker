# Component Picker

Chrome extension: hover any component on any site, click, and your clipboard holds an AI-ready
Markdown bundle — HTML, browser-resolved CSS, hover/focus + media-query rules, keyframes, fonts,
React component chain + handler source, and **mobile/tablet diffs** measured on the live page.
Paste it into Claude/Cursor with "rebuild this in our Next.js project" and you get pixel-perfect output.

## Layout

```
src/core/     the extraction engine, one concern per file —
              const · defaults · props · blocks · rules · tokens · context · fonts
              walk · icons · html · snapshot · messaging · compare · bundle · state
src/ui/       picker (entry) · handlers (keys and pointer) · overlay (what is drawn)
              note · popup.ts/.html (options + history) · panel.ts/.html (preview)
src/bg/       service-worker (router + storage) · measure (the debugger session) · probe (MAIN world)
src/shared/   types.ts (the cross-world contracts) · options.ts
src/assets/   icons.json (1,733 icon hashes) · icon.svg → icons/*.png
dist/         built extension — load THIS folder unpacked (created by `npm run build`)
dist-firefox/ the same build with a Firefox manifest
test/         check.sh (engine, headless) · e2e.mjs (real extension + CDP) · fixture.html
scripts/      release.sh · gen-icons.mjs (rebuild the icon table) · gen-icon.mjs (render the PNGs)
```

Every file is under 200 lines and owns one concern. The three execution worlds — content script,
page MAIN world, service worker — never share a call stack, so their message payloads live in
[`src/shared/types.ts`](src/shared/types.ts): a rename on one side is a compile error on the other.
`dist/` output filenames stay flat (`picker.js`, `background.js`, …) because the manifest and
`chrome.scripting.executeScript({ files: [...] })` address them by bare name.

`npm run build` bundles each entry into a standalone IIFE with esbuild (~15 ms); nothing is
minified, so what ships stays readable.

## Install (once)

1. `npm install && npm run build` — produces `dist/`.
2. `chrome://extensions` → toggle **Developer mode** (top right).
3. **Load unpacked** → choose the **`dist/`** folder (that is where the built `manifest.json` lives).

Or download the zip from the [latest release](https://github.com/niyamvora/component-picker/releases/latest)
and load that folder — no build needed.
4. Optional: pin it from the puzzle-piece menu. Shortcut is **Alt+Shift+C** (change at `chrome://extensions/shortcuts`).

Works in any Chromium browser (Chrome, Edge, Brave, Arc). Not Firefox/Safari — the mobile snapshots
need the `chrome.debugger` API, which only Chromium exposes to extensions.

## Use

1. Click the toolbar icon (or Alt+Shift+C) and press **Pick on this page**. The cursor becomes a
   crosshair, a banner appears at the top and a breadcrumb bar at the bottom.
2. Hover — the outline follows the pointer, padding is shaded green and margin orange (as in
   DevTools), and the label shows `tag#id.class` and the rendered size.
3. **↑ / ↓** move to the parent or first child; the breadcrumb crumbs are clickable for the same.
4. **Shift-click** adds elements to a selection (**Backspace** removes the last); **P** selects the
   page's top-level sections. **F** freezes the picker so you can open a menu and then pick it.
5. **Click** or **Enter** captures. A one-line note box appears — type intent for the AI, or Esc to skip.
   **Esc** at any other time cancels.
6. Chrome shows "Component Picker started debugging this browser" while it measures the viewports,
   interaction states and the other theme (≈2 s). If DevTools is open on that tab, close it first,
   otherwise those sections are skipped and the bundle says so.
7. Paste. While the toast is up, **R** stores the pick as the compare reference (**Shift+R** clears it)
   — the next capture will report only what differs from it. The side panel shows the capture rendered
   from the bundle alone, and the popup keeps the last ten picks for re-copying.

## What the bundle contains

| Section | Source | Notes |
|---|---|---|
| Header | — | URL, picked size/position, viewport, root font-size (for rem), framework, React component chain |
| HTML | `cloneNode` | scripts/styles/`on*` stripped, URLs absolutized, `data-cp="n"` ids link nodes to CSS |
| CSS (desktop) | `getComputedStyle` | diff vs a neutral `div` baseline for box props, vs the **parent** for inherited props; `/* … W×H */` = rendered box; `::before/::after` included |
| State: hover / focus-visible / active | CDP `CSS.forcePseudoState` | resolved values, diffed against the resting capture; forced on every element with a state rule |
| Variants (siblings) | sibling scan | siblings differing only by `data-state`/`aria-selected`/`disabled`…, diffed against the picked element |
| Source rules (hover/focus/media) | `document.styleSheets` | matched to the subtree; cross-origin sheets can't be read (Chrome restriction) |
| Responsive: mobile 390×844 / tablet 768×1024 | CDP device emulation on the same tab | only what **changes** vs desktop, plus elements that appear/disappear |
| Keyframes / Fonts | stylesheets | only the ones the subtree uses |
| JS / handlers | React fiber `memoizedProps`, inline `on*` | handler source (minified on prod sites, still shows intent) |
| Theme: dark/light | CDP media emulation, or flipping the page's own class/attribute | only what changes between themes |
| Compared with reference | a stored earlier pick | only what differs, with the reference value on each line |
| Screenshots | CDP `Page.captureScreenshot` | PNG of the element per viewport, embedded as a data URI |
| Context / Tokens / Variants | see above | ancestors and siblings · every `var(--…)` resolved · sibling states |
| Tokens JSON · Tailwind · JSX | opt-in | W3C design-token JSON, Tailwind v4 classes, a ready-to-paste `.tsx` |
| Repeated structure | sibling scan | a grid of cards → one card + a table of what differs |
| Mapping to your components | your inventory | `<Card>`, `<Button variant={…}>` instead of div soup |
| Accessibility | DOM | roles, names, WCAG contrast, focus order — works in fast mode too |
| Animations · Framer Motion · GSAP · Scroll · Platform | see v1.1 | running WAAPI/CSS animations, motion props, timelines, reveals, the site builder |

Caps: 300 elements, ~180 KB. Pick a smaller component if it truncates.

## Checks

```sh
npm test             # typecheck + build + both suites
npm run typecheck    # tsc --noEmit
npm run watch        # esbuild watch mode while developing
./test/check.sh      # engine in headless Chrome against test/fixture.html (builds first)
node test/e2e.mjs    # real extension + debugger in Chrome for Testing (needs Node ≥ 22)
```

`test/e2e.mjs` uses Playwright's Chrome for Testing binary by default (`CHROME=/path/to/binary` to override) —
branded Google Chrome ≥ 137 ignores `--load-extension`.

## Roadmap

Work is tracked on the [Component Picker Roadmap board](https://github.com/users/niyamvora/projects/11) and in the
[tracking epic #24](https://github.com/niyamvora/component-picker/issues/24). One milestone = one minor version.

| Milestone | Theme | Highlights |
|---|---|---|
| [v0.2](https://github.com/niyamvora/component-picker/milestone/1) | Correct captures | pointer-hover leak fix (#1), forced `:hover`/`:focus`/`:active` diffs (#2), sibling variants (#3), noise trimming (#4–#6), CI (#7) |
| [v0.3](https://github.com/niyamvora/component-picker/milestone/2) | Tokens & context | CSS variable names beside values (#8), gradient stop lists (#9), ancestor/sibling context (#10), component-library hint (#11), font one-liner (#12) |
| [v0.4](https://github.com/niyamvora/component-picker/milestone/3) | Themes, compare, popup | light/dark pairs (#13), reference-vs-ours diff (#14), element screenshots (#15), options popup + history (#16), note & freeze (#17) |
| [v0.5](https://github.com/niyamvora/component-picker/milestone/4) | Polish | named icons (#18), box-model overlay + breadcrumb (#19), side-panel preview (#20), iframes/shadow DOM (#21), multi-select (#22), Web Store + Firefox (#23) |

## Contributing

1. Pick an issue from the board's *Todo* column and move it to *In Progress*.
2. Branch off `main`; every issue names the exact file, function and steps.
3. `npm test` must pass (typecheck + build + both suites) before pushing — **this is the gate**. There is deliberately no CI: Actions minutes are billed, so the suites run locally and PRs are merged from the CLI once they are green.
4. Add the assertions the issue lists under **Tests**, and a `CHANGELOG.md` line under `## [Unreleased]`.
5. PR body says `Closes #<issue>`.

**Labels:** `type:*` (feature/bug/chore/task/plan), `priority:P0–P3`, `area:*`
(capture · cdp · output · ui · infra · docs). **Board fields:** Status, Priority, Kind.

## Versioning & releases

Semantic versioning; the git tag, the GitHub Release, the milestone and `manifest.json`'s `version`
always match. `VERSION` holds the current number and [CHANGELOG.md](CHANGELOG.md) follows
[Keep a Changelog](https://keepachangelog.com).

```sh
./scripts/release.sh 0.2.0   # runs both checks, bumps VERSION + manifest, tags, zips, publishes the Release
```

Users install by downloading the zip from the [Releases page](https://github.com/niyamvora/component-picker/releases)
and loading it unpacked (until the Web Store listing in #23 ships).

## Privacy

Everything runs locally in your browser. The extension makes no network requests, has no analytics,
and no server — the bundle only ever reaches your clipboard. It captures whatever the page contains,
including values inside form fields, so check a bundle before pasting it somewhere public.

## Landing page & example

A static one-pager lives in [`web/`](web/index.html), and a real capture is committed at
[`examples/sample-capture.md`](examples/sample-capture.md) so you can see exactly what a bundle
looks like without installing anything.

## Options

The toolbar popup controls what a capture includes (screenshots, states, themes, JS, `@font-face`),
the viewport list (name, size and DPR are editable), the compare reference, and the last ten picks.
Everything is stored locally in the extension.

## MCP — let an agent request a capture

`npx component-picker-mcp` starts a small server exposing `pick_component` (arms the picker, waits
for a click, returns the bundle) and `last_capture`. Turn on **MCP bridge** in the popup to connect
the extension to it. This is the only feature that opens a network connection; it is off by default,
localhost-only, and marked with an `MCP` badge while a pick is in flight.

## Firefox

`npm run build` also writes `dist-firefox/`, loadable through `about:debugging` → *Load Temporary
Add-on*. Firefox has no `chrome.debugger`, so the viewport, interaction-state, theme and screenshot
sections are absent there — the bundle says so, and the source rules still carry the media queries.
Everything else (HTML, resolved CSS, tokens, context, variants, icons, fonts) is identical.

## Known limits

- Width/height are emitted only for replaced elements, absolutely-positioned boxes, or when set inline/by
  attribute — computed values are always px, so fluid widths would lie. The `W×H` comment carries the real size.
- Interaction states are forced on the elements the site has state rules for, all at once — so a component with several hoverable parts shows every part hovered, not one pointer position.
- Closed shadow roots cannot be read (open ones are). A cross-origin iframe is picked in its own
  frame — the picker runs in all of them — but cannot be captured from the parent page.
- Token names come from source order, not full cascade specificity; the value printed beside a token
  is always the real computed one, so a mismatch is visible rather than silent.
