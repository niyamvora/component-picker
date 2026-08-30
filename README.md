# Component Picker

[![ci](https://github.com/niyamvora/component-picker/actions/workflows/ci.yml/badge.svg)](https://github.com/niyamvora/component-picker/actions/workflows/ci.yml)

Chrome extension: hover any component on any site, click, and your clipboard holds an AI-ready
Markdown bundle — HTML, browser-resolved CSS, hover/focus + media-query rules, keyframes, fonts,
React component chain + handler source, and **mobile/tablet diffs** measured on the live page.
Paste it into Claude/Cursor with "rebuild this in our Next.js project" and you get pixel-perfect output.

## Install (once)

1. `chrome://extensions` → toggle **Developer mode** (top right).
2. **Load unpacked** → choose this folder (`componentpicker/`).
3. Optional: pin it from the puzzle-piece menu. Shortcut is **Alt+Shift+C** (change at `chrome://extensions/shortcuts`).

Works in any Chromium browser (Chrome, Edge, Brave, Arc). Not Firefox/Safari — the mobile snapshots
need the `chrome.debugger` API, which only Chromium exposes to extensions.

## Use

1. Click the toolbar icon (or Alt+Shift+C). Cursor turns into a crosshair, a banner appears at the top.
2. Hover — the outline follows the element under the pointer; the label shows `tag#id.class`, size and
   the React component (⚛) when the site is React.
3. **↑** selects the parent, **↓** the first child (use this to grab the whole card, not the button inside it).
4. **Click** or **Enter** to copy. **Esc** cancels.
5. Chrome briefly shows "Component Picker started debugging this browser" — that is the mobile/tablet
   measurement (≈1 s). If DevTools is open on that tab, close it first, otherwise that section is skipped
   and the bundle notes why.
6. Paste. A toast confirms `Copied div.card — 23 KB`. The last bundle is also at `window.__cp.last` in the console.

## What the bundle contains

| Section | Source | Notes |
|---|---|---|
| Header | — | URL, picked size/position, viewport, root font-size (for rem), framework, React component chain |
| HTML | `cloneNode` | scripts/styles/`on*` stripped, URLs absolutized, `data-cp="n"` ids link nodes to CSS |
| CSS (desktop) | `getComputedStyle` | diff vs a neutral `div` baseline for box props, vs the **parent** for inherited props; `/* … W×H */` = rendered box; `::before/::after` included |
| Hover/focus + media rules | `document.styleSheets` | matched to the subtree; cross-origin sheets can't be read (Chrome restriction) |
| Responsive: mobile 390×844 / tablet 768×1024 | CDP device emulation on the same tab | only what **changes** vs desktop, plus elements that appear/disappear |
| Keyframes / Fonts | stylesheets | only the ones the subtree uses |
| JS / handlers | React fiber `memoizedProps`, inline `on*` | handler source (minified on prod sites, still shows intent) |

Caps: 300 elements, ~180 KB. Pick a smaller component if it truncates.

## Checks

```sh
./check.sh      # extraction logic in headless Chrome (test.html)
node e2e.mjs    # real extension + debugger emulation in Chrome for Testing (needs Node ≥ 22)
```

`e2e.mjs` uses Playwright's Chrome for Testing binary by default (`CHROME=/path/to/binary` to override) —
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
3. `./check.sh` and `node e2e.mjs` must both print `PASS` before pushing.
4. Add the assertions the issue lists under **Tests**, and a `CHANGELOG.md` line under `## [Unreleased]`.
5. PR body says `Closes #<issue>`.

**Labels:** `type:*` (feature/bug/chore/task/plan), `priority:P0–P3`, `area:*`
(capture · cdp · output · ui · infra · docs). **Board fields:** Status, Priority, Kind.

## Versioning & releases

Semantic versioning; the git tag, the GitHub Release, the milestone and `manifest.json`'s `version`
always match. `VERSION` holds the current number and [CHANGELOG.md](CHANGELOG.md) follows
[Keep a Changelog](https://keepachangelog.com).

```sh
./release.sh 0.2.0     # runs both checks, bumps VERSION + manifest, tags, zips, publishes the Release
```

Users install by downloading the zip from the [Releases page](https://github.com/niyamvora/component-picker/releases)
and loading it unpacked (until the Web Store listing in #23 ships).

## Privacy

Everything runs locally in your browser. The extension makes no network requests, has no analytics,
and no server — the bundle only ever reaches your clipboard. It captures whatever the page contains,
including values inside form fields, so check a bundle before pasting it somewhere public.

## Known limits

- Width/height are emitted only for replaced elements, absolutely-positioned boxes, or when set inline/by
  attribute — computed values are always px, so fluid widths would lie. The `W×H` comment carries the real size.
- Shadow DOM internals and cross-origin iframes are not entered.
- CSS custom properties are emitted resolved (values), not as tokens.
