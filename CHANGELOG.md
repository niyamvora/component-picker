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

[Unreleased]: https://github.com/niyamvora/component-picker/compare/v1.0.0...main
[1.0.0]: https://github.com/niyamvora/component-picker/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/niyamvora/component-picker/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/niyamvora/component-picker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/niyamvora/component-picker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niyamvora/component-picker/releases/tag/v0.1.0
