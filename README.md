# Component Picker

Chrome (and Firefox) extension: hover any component on any site, click, and your clipboard holds an
AI-ready Markdown bundle. Paste it into Claude Code / Cursor with "rebuild this in our Next.js
project" and you get pixel-perfect output.

One capture contains: HTML + browser-resolved CSS · forced `:hover`/`:focus`/`:active` states ·
light/dark theme pairs · mobile/tablet responsive diffs · every `var(--…)` design token resolved
(with optional Tailwind and W3C token JSON) · running animations (WAAPI/CSS), Framer Motion props
and GSAP timelines · repeated cards collapsed to one + a data table · mapping onto your own
`<Button>`/`<Card>` · accessibility (roles, contrast, focus order) · element screenshots · and a
ready-to-paste JSX/Vue/Svelte component. Everything runs locally — no network, no account.

<img src="web/public/shots/dock.png" alt="The glass dock on a component gallery, with a card outlined, its box model shaded and labelled div#card.card.primary 376×156" width="100%">

<sup>The glass dock sits on every page since v1.7. Hover to outline, click to copy the bundle.
MIT-licensed and fully open source — no paid tier.</sup>

<img src="web/public/shots/drawer.png" alt="The drawer open on the right: a prompt line, a live preview of the selected sections, Copy selected 1.3 KB, and the last capture's sections each with a checkbox and a size" width="100%">

<sup>Since v1.8: tick the sections you want, type a prompt, and copy exactly that — not the whole bundle.</sup>

Current version: **1.7.0** ([releases](https://github.com/niyamvora/component-picker/releases)) ·
[the site](web/README.md) covers every capability and every issue behind it.

## Layout

```
src/core/     the extraction engine, one concern per file —
              const · defaults · props · blocks · rules · tokens · context · fonts · walk
              html · icons · snapshot · messaging · compare · state · bundle (assembles it all)
              animations · scroll · repeats · summary       (motion, reveals, repeats, palette)
              tailwind · jsx · emit · mapping · a11y         (Tailwind, JSX, Vue/Svelte, mapping, a11y)
              assets · assets-zip · zip                      (asset collection + a dependency-free ZIP)
src/ui/       picker (entry) · handlers (keys/pointer) · overlay (what is drawn) · note · edit
              hud (glass dock + drawer) · icons-ui · drawer-groups · drawer-sections · viz
              panel.ts/.html (the side panel — preview, library, options; the popup folded into it)
src/bg/       service-worker (router + storage) · measure (the debugger session) · probe (MAIN world)
              bridge (the opt-in MCP connection)
src/shared/   types.ts (the cross-world contracts) · options.ts
src/assets/   icons.json (1,733 icon hashes) · icon.svg → icons/*.png
mcp/          component-picker-mcp — the MCP server (npx) + its round-trip test
dist/         built extension — load THIS folder unpacked (created by `npm run build`)
dist-firefox/ the same build with a Firefox manifest
test/         check.sh (engine, headless) · e2e.mjs (real extension + CDP) · zip.test.mjs · fixture.html
scripts/      release.sh · gen-icons.mjs (rebuild the icon table) · gen-icon.mjs (render the PNGs)
web/          the site (Next.js)          examples/  a real committed capture       store/  Web Store listing draft
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

The dock appears on **every page** by default (a content script on all sites — that's why Chrome
asks for access to all sites; nothing leaves your browser). Turn it off with **Show dock on every
page** in the drawer to go back to per-tab activation via the toolbar icon.

**Incognito & other profiles:** Chrome won't let any extension enable its own incognito access or
install itself across separate profiles — those are one-time user toggles. To use it in incognito:
`chrome://extensions` → Component Picker → **Details** → **Allow in incognito**. In another Chrome
profile, install it once there too. The extension is built `incognito: spanning`, so it works
correctly as soon as you flip that toggle.

Works in any Chromium browser (Chrome, Edge, Brave, Arc). **Firefox** is supported too — load
`dist-firefox/` via `about:debugging` — but without `chrome.debugger` it drops the viewport, state,
theme and screenshot sections (see [Firefox](#firefox) below). Everything else is identical.

## Use

1. Click the toolbar icon (or Alt+Shift+C). A **glass control dock** appears at the bottom of the
   page — click **Pick** (the crosshair) to arm it, or use the other icons (Fast mode, measure,
   copy-image, Figma, save) and the **⚙ Settings** button, which slides in a drawer with every
   output toggle. The cursor becomes a crosshair, a banner appears at the top and a breadcrumb bar
   at the bottom.
2. Hover — the outline follows the pointer, padding is shaded green and margin orange (as in
   DevTools), and the label shows `tag#id.class` and the rendered size.
3. **↑ / ↓** move to the parent or first child; the breadcrumb crumbs are clickable for the same.
4. **Shift-click** adds elements to a selection (**Backspace** removes the last); **P** selects the
   page's top-level sections. **F** freezes the picker so you can open a menu and then pick it.
5. **E** opens a small edit panel on the highlighted element (padding, gap, radius, font-size,
   colours) — tweak, then capture the version you want; the bundle records the change and the page
   is reverted afterwards. **M** shows measurement rulers to the parent's edges.
6. **Click** or **Enter** captures. A one-line note box appears — type intent for the AI, or Esc to skip.
   **Esc** at any other time cancels.
7. Chrome shows "Component Picker started debugging this browser" while it measures the viewports,
   interaction states and the other theme (≈2 s). If DevTools is open on that tab, close it first,
   otherwise those sections are skipped and the bundle says so. Prefer no bar? Flip **Fast** in the
   dock — HTML, CSS, tokens, animations, a11y and the rest, with no debugger attach.
8. Open the drawer (**⚙** in the dock) and it lands on **Copy**: every section of that capture with a
   checkbox and its size, a prompt line, and a live preview of exactly what a copy would produce.
   Tick what you need and press **Copy selected** — or take everything with **Copy bundle** in the panel.
   The compare button in the dock arms a reference (**R** still works); the side panel shows the capture
   rendered from the bundle alone, with **Download assets**, the recent picks and the library.

Keys at a glance: **click/Enter** copy · **shift-click** add · **↑↓** parent/child · **E** edit ·
**C** copy image · **G** copy as Figma SVG · **M** measure · **P** whole page · **F** freeze · **R** set reference · **Esc** exit.

## What the bundle contains

Most sections are always on; the ones marked **opt-in** are toggled in the drawer's **Capture
options** group (or the side panel's **Output**).

| Section | Source | Notes |
|---|---|---|
| Header | — | URL, picked size/position, viewport, framework + component chain, UI library, platform, icons |
| Context | ancestors + siblings | 3 ancestors' layout props and the sibling boxes — why it sits where it does |
| HTML | `cloneNode` | scripts/styles/`on*` stripped, URLs absolutized, `data-cp="n"` ids link nodes to CSS; open shadow roots kept as declarative templates |
| CSS (desktop) | `getComputedStyle` | diff vs a neutral `div` baseline for box props, vs the **parent** for inherited props; `/* … W×H */` = rendered box; `::before/::after` included |
| State: hover / focus-visible / active | CDP `CSS.forcePseudoState` | resolved values, diffed against the resting capture; forced on every element with a state rule |
| Variants (siblings) | sibling scan | siblings differing only by `data-state`/`aria-selected`/`disabled`…, diffed against the picked element |
| Source rules (hover/focus/media) | `document.styleSheets` | matched to the subtree; cross-origin sheets can't be read (Chrome restriction) |
| Responsive: mobile 390×844 / tablet 768×1024 | CDP device emulation on the same tab | only what **changes** vs desktop, plus elements that appear/disappear |
| Keyframes / Fonts | stylesheets | only the ones the subtree uses |
| JS / handlers | React fiber `memoizedProps`, inline `on*` | handler source (minified on prod sites, still shows intent) |
| Theme: dark/light | CDP media emulation, or flipping the page's own class/attribute | only what changes between themes |
| Media: print / reduced-motion / forced-colors | CDP media emulation | opt-in; each as a diff vs default |
| Compared with reference | a stored earlier pick (`R`) | only what differs, with the reference value on each line |
| Screenshots | CDP `Page.captureScreenshot` | PNG of the element per viewport, embedded as a data URI |
| Tokens used | resolved `var(--…)` | every design token named and resolved; **opt-in** W3C token JSON |
| Palette and type | the captured blocks | distinct colours, type scale, spacing — names a 4px/8px grid |
| Repeated structure | sibling scan | a grid of cards → one card + a table of what differs |
| Tailwind · JSX · Vue · Svelte · HTML+CSS | **opt-in** | Tailwind v4 classes, and ready-to-paste components in four flavours |
| Mapping to your components | your inventory | `<Card>`, `<Button variant={…}>` instead of div soup |
| Accessibility | DOM | roles, names, WCAG contrast, focus order — works in fast mode and Firefox |
| Animations · Framer Motion · GSAP · Scroll · Platform | WAAPI + MAIN-world probe | running animations, motion props, GSAP timelines with their ScrollTrigger start/end/scrub/pin, reveal-on-scroll, the site builder |
| Lottie | `lottie-web` / `<lottie-player>` | the full `animationData` JSON — replays identically wherever you paste it; over 100 KB it is summarised |
| anime.js | `window.anime` | the running instances touching the pick: properties, duration, easing, delay, direction, loop (partial — the library does not expose keyframes) |
| Canvas / WebGL scene | canvas probe | three.js / Rive / PixiJS / Babylon named with their version and size, plus a plain note that a GPU scene has no code to capture |
| Assets | side panel | a **Download assets** button zips images/fonts/backgrounds with HTML rewritten to local paths |

Caps: 300 elements, ~180 KB (screenshots are appended after the cap, never traded for CSS). Pick a
smaller component if it truncates.

## Options

Two surfaces, both stored locally in the extension. There is no popup — v1.8 folded it into the panel.

The **drawer** (⚙ in the dock), four groups, one open at a time:

- **Copy** — a prompt line, a live preview of exactly what a copy would produce, and the last
  capture's sections each with a checkbox and its size. `all · none`, and the selection you used on
  a site comes back next time you capture there.
- **Design** — the capture drawn rather than quoted: colour swatches (click to copy), token chips,
  type specimens at their real size, spacing as proportional bars, and each animation's easing as a
  curve.
- **Capture options** — screenshots, states, themes, JS/handlers, `@font-face`, accessibility (on by
  default), Tailwind classes, JSX, tokens JSON, extra media (print/reduced-motion/forced-colors),
  Vue SFC, Svelte, styled-components, CSS Modules, HTML+CSS, and **fast mode** (no debugger, no bar).
- **Extension** — show the dock on every page, the MCP bridge, and the library.

The **side panel** (opens with the toolbar icon): the last capture rendered from the bundle alone,
**Copy bundle**, **Download assets**, the last ten picks, the saved library, the compare reference,
the viewports (name, width, height and DPR all editable) and your component inventory
(`Card  .card`) for mapping the output onto `<Card>`/`<Button>` instead of div soup.

## MCP — let an agent request a capture

`npx component-picker-mcp` starts a small server exposing `pick_component` (arms the picker, waits
for a click, returns the bundle) and `last_capture`. Turn on **MCP bridge** in the side panel to connect
the extension to it. This is the only feature that opens a network connection; it is off by default,
localhost-only, and marked with an `MCP` badge while a pick is in flight.

## Site & example

The public site lives in [`web/`](web/README.md) — a Next.js app covering what a capture contains,
all 63 issues that built the extension, and the shot list for the demo video.

<a href="web/README.md"><img src="web/public/shots/site-home.jpg" alt="The Component Picker site — hero reading Copy any component as a bundle an AI can actually rebuild" width="100%"></a>

```sh
cd web && npm install && npm run dev
```

Video placeholders fill themselves in: drop `web/public/clips/<id>.mp4` next to a slot and rebuild.
Until then each slot shows the real screenshot or its shot list.

The drawer's **Design** group draws the capture instead of quoting it — colour swatches you click to copy, spacing as proportional bars, type specimens at their real size, easing as a curve:

<img src="web/public/shots/design.png" alt="The drawer's Design group: colour swatches, spacing bars and type specimens, with the four accordion groups Copy, Design, Capture options and Extension" width="100%">

The side panel, which the popup was folded into in v1.8 — the last capture rendered from the bundle alone, Copy bundle, Download assets, recent picks, the library, the compare reference and the settings:

<img src="web/public/shots/panel.png" alt="The Component Picker side panel — Pick on this page, the last capture rendered, Copy bundle, Download assets, recent picks, library, compare reference and the collapsed settings sections" width="340">

A real capture is committed at [`examples/sample-capture.md`](examples/sample-capture.md) so you can
see exactly what a bundle looks like without installing anything.

## Checks

```sh
npm test             # typecheck + build + all three suites (the gate before pushing)
npm run typecheck    # tsc --noEmit
npm run watch        # esbuild watch mode while developing
./test/check.sh      # extraction engine in headless Chrome against test/fixture.html (builds first)
node test/e2e.mjs    # real extension + debugger in Chrome for Testing (needs Node ≥ 22)
node test/zip.test.mjs  # the asset-zip writer, round-tripped through the system `unzip`
node mcp/test.mjs    # the MCP bridge round trip, no browser
```

`test/e2e.mjs` uses Playwright's Chrome for Testing binary by default (`CHROME=/path/to/binary` to override) —
branded Google Chrome ≥ 137 ignores `--load-extension`.

## Roadmap — what shipped

Tracked on the [roadmap board](https://github.com/users/niyamvora/projects/11). Everything through
**v1.8 has shipped** — 78 of 80 issues. The only open item is publishing to the Chrome Web Store
(#50), which needs a paid developer account. See [CHANGELOG.md](CHANGELOG.md) for the per-version detail.

| Version | Theme | Highlights |
|---|---|---|
| v0.2 | Correct captures | pointer-hover leak fix, forced `:hover`/`:focus`/`:active`, sibling variants |
| v0.3 | Tokens & context | `var(--…)` names beside values, gradient stops, ancestor/sibling context, library hint |
| v0.4 | Themes, compare, popup | light/dark pairs, reference-vs-ours diff, screenshots, options popup, note & freeze |
| v0.5 → 1.0 | Polish | named icons, box-model overlay + breadcrumb, side-panel preview, iframes/shadow DOM, multi-select, Firefox |
| v1.1 | Animation capture | WAAPI/CSS animations, Framer Motion, GSAP, scroll reveals, site-builder detection |
| v1.2 | Differentiators | W3C token JSON, Tailwind, repeat detection, component mapping, MCP server, a11y, JSX, fast mode |
| v1.3 | Coverage | container queries + `:has()`, print/reduced-motion/forced-colors, palette + measure mode, Vue/Svelte, asset zip |
| v1.4 | Distribution | live edit before capture, landing page + example, Web Store listing prepared |
| v1.5 | Competitor gaps | source file locations, inferred props, Alt-click to the agent, copy-as-image, copy-for-Figma, styled-components + CSS Modules, saved library, WebSocket bridge |
| v1.6 | Discoverability | the in-page glass dock and its settings drawer |
| v1.7 | Ubiquity | the dock on every page, a visible compare reference, incognito |
| v1.8 | Selective copy | tick sections + a prompt + Copy selected, the drawer's Design visualizations, Lottie / anime.js / WebGL / ScrollTrigger, four accordion groups, the popup folded into the panel |

## Contributing

1. Pick an issue from the board's *Todo* column and move it to *In Progress*.
2. Branch off `main`; every issue names the exact file, function and steps.
3. `npm test` must pass (typecheck + build + all three suites) before pushing — **this is the gate**. There is deliberately no CI: Actions minutes are billed, so the suites run locally and PRs are merged from the CLI once they are green.
4. Add the assertions the issue lists under **Tests**, and a `CHANGELOG.md` line under `## [Unreleased]`.
5. PR body says `Closes #<issue>`.

**Labels:** `type:*` (feature/bug/chore/task/plan), `priority:P0–P3`, `area:*`
(capture · cdp · output · ui · infra · docs). **Board fields:** Status, Priority, Kind.

## Versioning & releases

Semantic versioning; the git tag, the GitHub Release, the milestone and `manifest.json`'s `version`
always match. `VERSION` holds the current number and [CHANGELOG.md](CHANGELOG.md) follows
[Keep a Changelog](https://keepachangelog.com).

```sh
./scripts/release.sh 1.5.0   # typechecks, runs the suites, bumps VERSION + manifest, tags, zips both builds, publishes the Release
```

Users install by downloading the zip from the [Releases page](https://github.com/niyamvora/component-picker/releases)
and loading it unpacked (until the Web Store listing, [#50](https://github.com/niyamvora/component-picker/issues/50), ships).

## Privacy

Everything runs locally in your browser. The extension makes no network requests, has no analytics,
and no server — the bundle only ever reaches your clipboard. It captures whatever the page contains,
including values inside form fields, so check a bundle before pasting it somewhere public.

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
