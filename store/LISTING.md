# Chrome Web Store listing (draft — submit when ready)

This is everything the store form needs. The submission itself needs a person: a
one-time US$5 developer account, and going through the review (the `debugger`
permission draws a closer look — the justification below is written for it).

## Name
Component Picker

## Summary (132 chars max)
Hover any component, click, and copy its HTML, resolved CSS, states, themes and responsive diffs as an AI-ready bundle.

## Category
Developer Tools

## Description
Component Picker turns any element on any site into a bundle an AI can rebuild pixel-perfect.
Hover, click, paste.

What it captures:
• HTML + browser-resolved CSS (real px/rgb, diffed against defaults — not a flat DOM dump)
• Interaction states: forced :hover, :focus-visible, :active, as diffs
• Light/dark theme pairs, and mobile/tablet responsive diffs
• Design tokens — every var(--…) named and resolved — with optional Tailwind and W3C token JSON
• Running animations (WAAPI/CSS), Framer Motion props, GSAP timelines, scroll reveals
• Repeated cards collapsed to one component + a data table; mapping onto your own <Button>/<Card>
• Accessibility: roles, names, WCAG contrast, focus order
• A side-panel preview that renders the capture in isolation, and an asset zip

Everything runs locally. No network calls, no analytics, no account. The one exception — an
optional MCP bridge that lets a local AI agent request a capture — is off by default and localhost-only.

Tip: a "started debugging this browser" bar shows for ~2 seconds while it measures viewports and
states. Turn on Fast mode to skip it (and those sections) entirely.

## Permission justifications
• host permissions (all sites) + scripting: show the dock and inject the picker. The dock appears on
  every page since v1.7; turn off "Show dock on every page" in the drawer for per-tab activation.
• debugger: emulate mobile/tablet viewports, force :hover/:focus/:active, capture the other theme,
  and take element screenshots. Used only during a capture; nothing leaves the browser.
• clipboardWrite: put the bundle on your clipboard.
• storage: remember your options, recent picks and compare reference — locally.
• alarms + optional 127.0.0.1 host permission: only when you turn on the MCP bridge.

## Data disclosure
Collects no user data. Makes no network requests except the optional, off-by-default localhost
MCP bridge. No analytics, no remote server, no account.

## Screenshots to capture (1280×800)
1. `store/assets/screenshot-1-dock.png` — the glass dock with a component outlined and its box model shaded
2. `store/assets/screenshot-2-selective-copy.png` — the drawer's Copy group: prompt, live output box, per-section checkboxes
3. `store/assets/screenshot-3-drawer.png` — the Design group: swatches, spacing bars, type specimens
4. The pasted bundle open in Claude Code / Cursor
5. The side panel beside the real page

Regenerate 1–3 from the running build rather than mocking them up; GPU compositing has to be on or
`backdrop-filter` does not render and the glass comes out a flat slab.

## Assets
• promo tile 440×280 — store/promo-tile.svg (render to PNG)
• icon — src/assets/icons/128.png
