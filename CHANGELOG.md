# Changelog

One version = one git tag = one GitHub Release = one milestone (`vX.Y`). `VERSION` is the single
source of truth — the build stamps it into `manifest.json` — and the Release carries the zip you
can load unpacked without building. Versions follow
[Semantic Versioning](https://semver.org): a milestone bumps the **minor**, a hotfix bumps the
**patch**, and the **major** stays 0 until the Chrome Web Store listing ships.
Format follows [Keep a Changelog](https://keepachangelog.com). `./scripts/release.sh <version>`
typechecks, runs both suites, moves the Unreleased block under a new heading, bumps `VERSION`
(which `build.mjs` stamps into the manifest), tags, zips `dist/` and publishes the Release.

## [Unreleased]

### Added
- **The capture is kept as named parts** (#80): alongside the one joined Markdown string, every section of a capture is now recorded as `{ id, title, body }` — `html`, `css`, `tokens`, `states`, `responsive` and the rest. Building the list where the bundle is assembled means it can never drift from what the bundle actually contains, and the joined output is byte-for-byte what it was. Read it from `chrome.storage.session` under `sections`, or from `window.__cp.lastSections()`. Groundwork for copying only the sections you want.

### Fixed
- **The breadcrumb and the copy toast rendered underneath the dock.** Both are bottom-centred (`bottom:12px` and `bottom:24px`) and so is the dock (`bottom:20px`), so since the HUD landed in 1.6 the breadcrumb sat behind the glass pill and the "copied" toast was hidden by it. `dockClearance()` in `hud.ts` reports the space the dock occupies and `overlay.ts` offsets both by it, so they stack above the dock when it is mounted and sit where they always did when it is not.
- **The compare reference is now session-scoped**: it lives in `chrome.storage.session` (cleared when the browser closes) instead of `chrome.storage.local`. A reference set with `R` and then forgotten used to persist forever and silently attach a "Compared with reference" section to every later capture on every site; now it lasts only for the session you set it in, which matches how compare is actually used (reference → ours → done).

## [1.7.0] — 2026-08-31

### Added
- **Dock on every page** (#72): the glass dock now appears automatically on every page and session — a content script on `<all_urls>` — so you never have to click the toolbar icon first. Behind a **Show dock on every page** toggle in the drawer (default on); turn it off to go back to per-tab activation. This is why the extension now asks for access to all sites; nothing is sent anywhere.
- **Visible compare reference** (#73): the drawer shows `Comparing against <label> · <host>` with a clear button, read from global storage — so the reference you set with `R` is obviously retained across tabs and sessions (it always was; now you can see it). Fixes the impression that switching tabs lost the compare context.
- **Incognito support** (#74): `"incognito": "spanning"`, so the extension works correctly the moment you enable it in incognito. (Chrome cannot let an extension enable its own incognito access, or install across separate profiles — those are one-time user toggles; see the README.)

## [1.6.0] — 2026-08-31

### Added
- **In-page glass HUD** (#69): activating the extension on a tab now shows a frosted floating dock (bottom-centre, Apple-style glass — a backdrop blur over a dark translucent pill with a hairline border) instead of jumping straight to the crosshair. Lucide icons with tooltips: Pick, Fast-mode toggle, Measure, Copy image, Figma, Save to library, plus a **Settings** button that slides in a right glass drawer with every output toggle. Makes the tool mouse-discoverable rather than keyboard-only; recedes at rest, brightens on hover. (activeTab: the dock appears on the tab you activate, not automatically on every page.)

## [1.5.0] — 2026-08-31

### Added
- **Source file locations** (#60): on a React **dev build**, the bundle names where each component was written — `Source: src/components/Card.tsx:12:4` in the header, plus a `## Source locations` section. Read from the fiber's `_debugSource`; absent (no error) on production/minified sites. Covers what React Grab and MCP Pointer offer.
- **Inferred prop shape** (#62): `## Props (inferred from the React fiber)` lists a component's props with inferred types (`variant: "primary" (string)`, `onClick: ƒ`) — the API to rebuild, not just the markup.
- **Alt/Option-click instant capture** (#61): with the MCP bridge on, holding Alt and clicking any element sends its bundle straight to the connected agent — no picker arming. (MCP Pointer's UX; works on a tab once the picker has run there.)
- **Copy-as-image** (#63) and **copy-for-Figma** (#66): while picking, `C` copies a PNG of the highlighted element to the clipboard, `G` copies it as a Figma-ready SVG (boxes, text, images) to paste into Figma as layers.
- **styled-components and CSS Modules output** (#64): two more opt-in code targets beside Tailwind and Vue/Svelte.
- **Saved component library** (#65): a "Studio" in the popup — save a pick with a name and thumbnail, re-copy or delete it later; survives restarts.
- **WebSocket transport for the MCP bridge** (#67): real-time delivery instead of a 2s poll, with the HTTP path as fallback.

## [1.4.1] — 2026-08-31

### Fixed
- **SVG internals no longer bloat the bundle**: an `<svg>`'s descendants — every `<path>`, `<filter>`, `<stop>`, `<mask>` — were each given a `data-cp` and a CSS block that was almost always just `box-sizing: border-box`. That could be hundreds of lines of noise for one icon. The `<svg>` element itself is still captured (size, colour, filter matter) and its full markup stays in the HTML; only the per-node CSS blocks are dropped. Icon naming (#18) still works.
- **False "Platform: Webflow"** on Tailwind sites: the detector matched any class starting with `w-`, which Tailwind uses heavily (`w-full`, `w-[270px]`). It now matches Webflow's actual class names (`w-container`, `w-row`, `w-nav`…).
- **`.undefined` in the Repeated-structure labels** for class-less SVG nodes (`rect.undefined` → `rect`).
- **Side-panel flicker**: every capture called `chrome.sidePanel.open()` from an async handler with no user gesture, so Chrome flashed the panel open-and-shut with nothing to show. The preview is now stored and pushed to the panel if it is already open; open it yourself from Chrome's side-panel button when you want it.

## [1.4.0] — 2026-08-31

### Added
- **Edit before capturing** (#52): press `E` on the highlighted element for a small panel of the six most-changed properties (padding, gap, radius, font-size, background, colour). Changes apply live and are captured as-is, with `> Edited before capture: gap 12px → 16px` in the bundle; Esc reverts the page exactly, since it is someone else's.
- **A landing page and a committed example** (#51): a static one-pager in `web/` (drop in a `demo.gif`), and a real capture at `examples/sample-capture.md` so a reader can judge the output quality without installing anything.

### Chore
- **Chrome Web Store listing prepared** (#50): draft copy, permission justifications, data disclosure and a promo tile in `store/`. The submission itself is deferred — it needs a paid developer account and review, which is a person's step, not code.

## [1.3.0] — 2026-08-31

### Added
- **Container queries and `:has()`** (#43): `@container` rules are matched and printed, and the selector stripper no longer corrupts `:has(...)`/`:is(...)`/`:where(...)` — a `:has(> img)` rule now matches instead of being skipped. `container-type` and `container-name` are captured on elements that are containers.
- **Print / reduced-motion / forced-colors captures** (#45): each emulated as a diff against the default rendering, behind an option (off by default; it adds ~1.2s and is usually empty). Each case sets the full media state so one does not leak into the next.
- **Palette and type summary** (#47): the distinct colours (by frequency), the type scale, and the spacing values — with a note when they are all multiples of 4 or 8, which names the target project's grid. Plus **measure mode** (`M` while picking): distances from the hovered element to its parent's edges, drawn as labelled rulers.
- **Vue, Svelte and plain-HTML output** (#48): the captured markup as a Vue SFC, a Svelte component, or an HTML+CSS pair — the same tree with different attribute rules, removing the "not for my stack" objection.
- **Asset export** (#44): a **Download assets** button in the side panel collects the images, fonts and background images the subtree uses into a `component-assets.zip` (store-only, no dependency) with the HTML rewritten to local paths. Anything CORS refuses is listed in `SKIPPED.txt`, not fatal.

## [1.2.0] — 2026-08-31

### Added
- **W3C design-token JSON** (#35): the Tokens section can emit the tokens again as [W3C Design Tokens format](https://www.designtokens.org/tr/drafts/format/) JSON — what Style Dictionary, Tokens Studio and Figma Variables read. `$type` is inferred from the resolved value and omitted rather than guessed when the value does not clearly fit.
- **Tailwind class output** (#36): the resolved CSS again as Tailwind v4 utilities, preferring the *token* behind a value (`bg-gray-a3`, not a hex arbitrary value) — the one thing every paid competitor charges for. Lossy by nature; the resolved CSS stays authoritative and nothing is silently dropped.
- **Repeated-structure detection** (#37): a grid of identical cards captures as *one* card plus a table of what differs between instances, and the HTML carries one of each — Locofy's headline paid feature. Cuts a repetitive bundle roughly by the repeat count.
- **Map onto your components** (#38): a two-line inventory (`Card  .card`) makes the bundle reference `<Card>` and `<Button variant={…}>` instead of div soup — Builder.io's headline paid feature — with unmatched elements listed explicitly. An icon maps to its component's `name` prop automatically.
- **MCP server** (#39): `npx component-picker-mcp` exposes `pick_component` and `last_capture` so an agent can request a capture instead of waiting for a paste. Opt-in: the localhost bridge opens only when turned on in the popup, and the host permission is requested then.
- **Accessibility snapshot** (#40): roles, accessible names, WCAG contrast warnings and focus order — computed from the DOM, so it works in fast mode and Firefox too. No competitor captures it.
- **JSX component output** (#41): the captured HTML as a ready-to-paste `.tsx` — `className`, camelCased attrs, self-closed void elements, style objects — removing the step where an AI transcribes markup by hand.
- **Fast mode** (#46): a capture with no debugger attach — no viewport, state, theme or screenshot sections, and no "started debugging this browser" bar. For the common "what font and spacing is this?" pick.

## [1.1.0] — 2026-08-30

### Added
- **Running-animation capture** (#29): `element.getAnimations()` reports every live animation — CSS animations, CSS transitions, and the Web Animations API (which is what Framer Motion compiles to) — with its *resolved* timing and keyframes. A CSS animation already shown in `## Keyframes` is not repeated.
- **Framer Motion props** (#30): `initial`, `animate`, `whileHover`, `variants`, `transition`, `layoutId` and the rest, read off the React fiber in the page's MAIN world — the declarative source of truth for a component's motion, including states WAAPI cannot see.
- **GSAP timelines** (#31): tweens from `gsap.globalTimeline` whose targets are in the picked subtree, with their vars, duration, start and paused state. A GSAP-driven hero is no longer captured as a static frame.
- **Scroll behaviour** (#32): native scroll timelines (`animation-timeline: view()`) and reveal-on-scroll patterns are reported with *both* the resting and revealed states — a hero that fades in on scroll no longer captures as a silently invisible `opacity: 0` box.
- **Site-builder detection** (#33): the header names the builder behind the page — Webflow, Framer, Shopify, WordPress — and a Platform notes section flags Webflow's `w-*` utility classes to replace, Framer layer names, Shopify section types and WordPress block names.

### Changed
- `src/` is split into `core/` (the engine, one concern per file), `ui/`, `bg/`, `shared/` and `assets/`, with every file under 200 lines (#53). `extract.ts` had grown to 1,100 lines and every planned feature added another section to it. Build output is unchanged — `dist/` keeps the same four flat filenames, because the manifest and `executeScript({ files })` address them by bare name.

## [1.0.0] — 2026-08-30

### Added
- **A real toolbar icon and a Firefox build** (#23): `npm run build` now also writes `dist-firefox/`, loadable through `about:debugging`. Firefox has no `chrome.debugger`, so the viewport, state, theme and screenshot sections are absent there and the bundle says so; everything else is identical. Releases carry both zips.
- **Named icons** (#18): an inline `<svg>` whose geometry matches a known icon is tagged `data-icon="lucide:eye-off"` and listed in the header. 1,733 icons ship as a 53 KB hash table (`scripts/gen-icons.mjs` rebuilds it); matching is on path geometry alone, so formatting, stroke width and viewBox do not matter. The raw paths stay in the HTML for exact parity when no name is found.
- **Shadow DOM and iframes** (#21): the subtree walk descends into open shadow roots, so a design system built on web components no longer captures as an empty `<my-button>`; the markup travels back as declarative shadow DOM (`<template shadowrootmode="open">`), which renders the same way when pasted. The picker is injected into every frame, so a Stripe field or an embedded demo can be picked in its own iframe.
- **Side-panel preview** (#20): the bundle's own HTML and CSS rendered in a sandboxed iframe with nothing else on the page — anything that only looked right because the real site's stylesheet was still loaded shows up here as wrong.
- **Box-model overlay and breadcrumb bar** (#19): padding and margin are shaded the way DevTools shades them, because a single outline says where an element ends but not where its own space stops and its spacing begins. The breadcrumb (`main › section.pricing › div.card › button`) is hoverable and clickable — ↑/↓ alone made reaching the right ancestor slow.
- **Multi-select and whole-page capture** (#22): shift-click adds elements to the selection, `Backspace` removes the last, and the next plain click captures them all as one bundle with per-component `data-cp` prefixes. `P` selects the page's top-level sections, for a landing page section by section.
- **Element screenshots** (#15): a PNG of the picked element at each viewport, embedded as a data URI so it renders inline where you paste it. An AI that can see the target *and* read its CSS makes far fewer mistakes than one that can only read. Appended after the text, so an oversized bundle never trades CSS for a picture.
- **Theme pairs** (#13): the same component in the theme you are not looking at, as a diff. `prefers-color-scheme` is emulated through the debugger; a `.dark` class or `data-theme` attribute is flipped in the page and put back. A site whose framework re-applies its own theme on mutation is reported as such rather than returning a mislabelled snapshot of the theme you already had.
- **Compare with a reference** (#14): press `R` while the copy toast is up to store a pick, then pick again anywhere — the bundle ends with only what differs, each line carrying the reference value. `Shift+R` clears it. This is the reference → ours → fix → re-pick loop, minus the by-hand part.
- **Options popup** (#16): what a capture includes (screenshots, states, themes, JS, `@font-face`), the viewport list (name, size, DPR — editable), the current compare reference, and the last ten picks with a one-click re-copy. A badge marks the tab while the picker is armed.
- **Note with the pick, and freeze mode** (#17): after clicking, a one-line note goes into the bundle as `> Note: …` — the intent the DOM cannot carry. It is prompted while the capture is already running, so it costs no time. `F` freezes the picker so a menu, dropdown or modal can be opened and then picked; the picker otherwise eats the very click that would reveal it.

## [0.3.0] — 2026-08-30

### Added
- **Typography as a developer writes it** (#12): `- Inter 500 — 14px/20px (button.btn, a)`, grouped by family and weight, listing the elements wearing each size. The `@font-face` block is now behind `window.__cp.opts.fontFace` (the options popup in #16 will drive the same switch) — it is rarely what a rebuild needs and costs a lot of tokens.
- **Component-library hint** in the header (#11): `UI: Base UI + Tailwind v4`. Recognises Base UI, Radix, shadcn/ui, Headless UI, MUI, Chakra, Ant Design, Mantine, Bootstrap, styled-components, Emotion, Vue, Svelte, Angular, Astro and Tailwind v3 vs v4 — the difference between "rebuild this markup" and "this is a Radix tabs trigger".
- **Context section** (#10): up to three ancestors and the siblings, layout properties only — the parent's padding, the wrapper's `position: relative`, the icon slot pinned at `right: 6px`. A picked element's own CSS never explains why it sits where it does. Values Chrome resolved rather than anyone writing (`left: 710.875px` on an `auto` inset) are left out.
- **Gradients read as stop lists** (#9): the resolved stops are printed with the source expression beside them — `linear-gradient(to right in oklab, var(--green-a4) 0%, var(--green-a1) 100%)` — and the interpolation space (`oklab`) is called out, since it changes the midpoint colour and is easy to lose in a rebuild.
- **Token names beside resolved values** (#8): `background-color: rgba(176, 199, 217, 0.145); /* var(--gray-a3) */`. The rgba is the truth about pixels; the token is the half that maps onto the target project's own scale and the only half that is greppable. Tailwind v4's `--tw-*` plumbing is followed through to the name a person actually wrote, and a **Tokens used** section resolves every token the bundle names.

## [0.2.1] — 2026-08-30

### Added
- `px` values on scale properties (font-size, spacing, radius…) carry their `rem` equivalent as a comment (#6) — `14px` is `.875rem` is Tailwind's `text-sm`, and only the rem is greppable in the target repo. Conversions nobody would have typed (a UA button's `13.3333px`) stay px.
- Responsive diffs name the `@media` rule that caused each change, and say whether it applies or no longer applies at that viewport (#5) — `font-size: 16px` on mobile is a breakpoint stopping, not the layout reflowing, and the two want different fixes.

## [0.2.0] — 2026-08-30

### Added
- **Interaction states** (#2): `:hover`, `:focus-visible` and `:active` are forced through the Chrome DevTools Protocol and emitted as diffs against the resting capture. States are forced on every element the site has a rule for — not just the picked root — so a card whose hover styling lives on a child is captured correctly.
- **Sibling variants** (#3): siblings that differ from the picked element only by `data-state` / `aria-selected` / `aria-current` / `disabled` (and similar) are captured as diffs — a stepper's done and pending steps, a tab bar's unselected tabs.

### Changed
- `npm test` (typecheck + build + both suites) is the gate before pushing. The GitHub Actions workflow added in 0.2.1 (#7) has been removed and Actions disabled for the repository — the minutes are billed, and the same checks run locally in seconds.

### Removed
- The header's `Root font-size` line (#6): every value in the bundle was already px, so it explained nothing. The root size now appears where it is actually used — in the note explaining the `rem` comments.

### Fixed
- **Hover leak** (#1): the resting desktop CSS was measured while the pointer still sat on the element the user had just clicked, so the site's `:hover` styles were recorded as if they were the resting ones. The capture now parks the pointer before measuring anything, and every measurement — desktop included — comes from one debugger session.
- **Zero-width borders** (#4): Tailwind's preflight sets `border: 0 solid` on every element, which was reported as a border on every node. A zero-width border is no border.
- Interaction states are no longer read part-way through a CSS transition: the settle time is derived from the page's own longest `transition-duration` instead of a fixed guess.

### Changed
- **Ported to TypeScript**, bundled with esbuild (`npm run build` → `dist/`, which is now the folder you load unpacked). The picker is split into an extraction engine (`src/extract.ts`), the overlay and messaging layer (`src/picker.ts`), and the debugger driver (`src/background.ts`); the payloads they exchange are declared once in `src/types.ts`, so a rename in one execution world is a compile error in the others.
- Repository layout: sources in `src/`, checks in `test/`, release tooling in `scripts/`.
- `test/check.sh` builds before it runs and honours a `CHROME` environment variable, so it can run on Linux CI.

### Note on Plasmo
Evaluated and skipped. Plasmo's on-demand content-script filename is undocumented and hashed, while this extension deliberately injects a named file under `activeTab` rather than declaring an `<all_urls>` content script. Its real benefit — React popup and side panel — arrives with #16 and #20 and can be reconsidered then.

## [0.1.0] — 2026-08-30

### Added
- Toolbar/`Alt+Shift+C` picker with hover outline, ↑/↓ parent–child navigation, Enter/click to copy, Esc to exit.
- HTML capture of the picked subtree: scripts/`on*` stripped, URLs absolutized, `data-cp="n"` ids cross-referencing CSS.
- Resolved-CSS capture diffed against a neutral `div` baseline *and* the tag's UA default, and against the parent for inherited properties; shorthands for padding/margin/gap/border/radius/transition/animation; rendered `W×H` comments; `::before/::after`.
- Hover/focus and `@media` rules matched from the site's stylesheets with `var()` resolved against the element's computed custom properties.
- Keyframes and `@font-face` (URLs absolutized) limited to what the subtree uses.
- Mobile 390×844 and tablet 768×1024 snapshots via Chrome DevTools Protocol device emulation on the live tab, emitted as diffs vs desktop.
- React detection in the page's MAIN world: framework, component chain, handler source from fiber props; Vue name; inline `on*` handlers.
- `check.sh` (headless extraction check) and `e2e.mjs` (real extension + debugger in Chrome for Testing).

### Fixed
- Comma-splitting inside `cubic-bezier(…)` garbled `transition`.
- `top/right/bottom/left: 0px` reported for `position: relative` (Chrome renders `auto` as `0px`).
- Default `transform-origin` and mid-animation `transform` matrices leaking into CSS.

[Unreleased]: https://github.com/niyamvora/component-picker/compare/v1.7.0...main
[1.7.0]: https://github.com/niyamvora/component-picker/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/niyamvora/component-picker/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/niyamvora/component-picker/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/niyamvora/component-picker/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/niyamvora/component-picker/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/niyamvora/component-picker/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/niyamvora/component-picker/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/niyamvora/component-picker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/niyamvora/component-picker/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/niyamvora/component-picker/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/niyamvora/component-picker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/niyamvora/component-picker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niyamvora/component-picker/releases/tag/v0.1.0
