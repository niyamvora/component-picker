# Component Picker

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

## Known limits

- Width/height are emitted only for replaced elements, absolutely-positioned boxes, or when set inline/by
  attribute — computed values are always px, so fluid widths would lie. The `W×H` comment carries the real size.
- Shadow DOM internals and cross-origin iframes are not entered.
- CSS custom properties are emitted resolved (values), not as tokens.
