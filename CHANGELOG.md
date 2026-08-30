# Changelog

One version = one git tag = one GitHub Release = one milestone (`vX.Y`). The tag is the
`version` in `manifest.json`, and the Release carries the loadable zip. Versions follow
[Semantic Versioning](https://semver.org): a milestone bumps the **minor**, a hotfix bumps the
**patch**, and the **major** stays 0 until the Chrome Web Store listing ships.
Format follows [Keep a Changelog](https://keepachangelog.com). `./release.sh <version>` moves
the Unreleased block under a new heading, bumps `VERSION` + `manifest.json`, tags, zips and
publishes the Release.

## [Unreleased]

### Changed
- Repository layout: the extension now lives in `src/` (load **that** folder unpacked), checks in `test/`, release tooling in `scripts/`.
- `test/check.sh` honours a `CHROME` environment variable so it can run on Linux CI.

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

[Unreleased]: https://github.com/niyamvora/component-picker/compare/v0.1.0...main
[0.1.0]: https://github.com/niyamvora/component-picker/releases/tag/v0.1.0
