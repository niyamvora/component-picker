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
- CI runs the typecheck, the build and both suites on every push and pull request against Chrome for Testing (#7).

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

[Unreleased]: https://github.com/niyamvora/component-picker/compare/v0.2.1...main
[0.2.1]: https://github.com/niyamvora/component-picker/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/niyamvora/component-picker/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/niyamvora/component-picker/releases/tag/v0.1.0
