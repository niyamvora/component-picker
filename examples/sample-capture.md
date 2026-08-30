# Sample capture

A real Component Picker bundle, captured from the test fixture (a card with a button, an icon, a gradient and a shadow-DOM badge). This is what lands on your clipboard.

---

# Component picked from Component Picker self-check — file:///Users/niyamvora/Code/miniapp/chrome/componentpicker/test/fixture.html

Picked: div#card.card.w-container 354×321 at (28, 28). Desktop viewport 756×469 @1x. Framework: not detected. UI: Radix + shadcn/ui + Tailwind. Icons: lucide:x.

> How to use: paste this to your AI. `data-cp` ids on HTML nodes match the CSS selectors below. CSS values are browser-resolved (px/rgb) diffs against browser defaults and the parent element; `/* … W×H */` comments are the real rendered box. State, Variant and Responsive sections list ONLY what changes vs the resting desktop capture. `/* …rem */` comments restate px against the page's root size (16px), and `/* @media … */` names the breakpoint behind a responsive change. Rebuild as a React/Next.js component in the project's styling system (Tailwind/CSS modules), keep hover/focus/animation rules, swap absolute asset URLs for local assets.

## Context (what the picked element sits in)
```css
section#wrap { /* 740×361, parent */ display: grid; position: relative; grid-template-columns: 700px; padding: 20px; gap: 8px; }
Siblings of the picked element:
- aside 23×18 (after) — position: absolute; top: 0px; right: 6px; height: 18px;
```

## HTML
```html
<div id="card" class="card w-container" style="display:flex;gap:12px;border:1px solid #ddd;border-radius:8px;width:320px;font-family:Georgia;color:rgb(17,24,39)" data-cp="1">
  <h2 class="title" data-slot="title" data-cp="2">Hello</h2>
  <button class="btn" data-slot="trigger" data-state="open" data-orientation="horizontal" data-cp="3">Go</button>
  <a href="file:///rel" data-cp="4">rel link</a>
  <span hidden="" data-cp="5"><b>secret child</b></span>
  <div class="grad" data-cp="7">gradient</div>
  <div class="reveal" data-cp="8">reveal me</div>
  <div id="waapi" data-cp="9">waapi</div>
  <my-badge><template shadowrootmode="open"><span class="pill" style="padding:2px 6px;border-radius:9px;background:rgb(30,64,175);color:#fff" data-cp="11">shadow</span></template></my-badge>
  <!-- lucide:x, verbatim from lucide-static -->
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x" data-cp="12" data-icon="lucide:x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
  
</div>
```

## CSS (desktop, resting state)
_Measured with the pointer still on the element — hover styles may be included._
```css
[data-cp="1"] { /* div#card.card.w-container 354×321 */
  display: flex;
  width: 320px; /* 20rem */
  flex-direction: column;
  font-family: Georgia;
  color: rgb(17, 24, 39);
  background-color: rgb(250, 250, 250); /* var(--panel) */
  outline-style: solid;
  outline-color: rgb(1, 2, 3);
  container-type: inline-size;
  padding: 16px; /* var(--pad) · 1rem */
  gap: 12px; /* 0.75rem */
  border: 1px solid rgb(221, 221, 221);
  border-radius: 8px; /* 0.5rem */
}

[data-cp="2"] { /* h2.title 320×27 */
  font-size: 24px; /* 1.5rem */
  font-weight: 700;
  letter-spacing: 1px;
  margin: 19.92px 0px; /* 1.245rem 0 */
}

[data-cp="3"] { /* button.btn 320×17 */
  position: relative;
  box-sizing: border-box;
  font-family: Arial;
  font-size: 13.3333px;
  text-align: center;
  color: rgb(0, 0, 0);
  background-color: rgb(239, 239, 239);
  cursor: default;
  appearance: auto;
  padding: 1px 6px; /* 1px 0.375rem */
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0s, color 0.3s ease 0s; /* background-color .2s var(--ease), color .3s ease */
  animation: spin 1s linear 0s infinite normal none;
}

[data-cp="3"]::after {
  content: "→";
  margin: 0px 0px 0px 4px;
}

[data-cp="4"] { /* a 320×19 */
  text-decoration-line: underline;
  color: rgb(0, 0, 238);
  cursor: pointer;
}

[data-cp="5"] { /* span */
  display: none;
}

[data-cp="7"] { /* div.grad 320×19 */
  background-image: linear-gradient(to right in oklab, rgba(0, 200, 83, 0.2) 0%, rgba(0, 200, 83, 0.05) 100%); /* linear-gradient(to right in oklab, var(--green-a4) 0%, var(--green-a1) 100%) — interpolation: oklab */
}

[data-cp="8"] { /* div.reveal 320×19 */
  opacity: 0;
}

[data-cp="9"] { /* div#waapi 320×19 */
  opacity: 0;
}

[data-cp="11"] { /* span.pill 66×23 */
  color: rgb(255, 255, 255);
  background-color: rgb(30, 64, 175);
  padding: 2px 6px; /* 0.125rem 0.375rem */
  border-radius: 9px;
}

[data-cp="12"] { /* svg 24×24 */
  width: 24px; /* 1.5rem */
  height: 24px; /* 1.5rem */
  fill: none;
  stroke: rgb(17, 24, 39);
  stroke-width: 2px;
}
```

## Source rules (hover/focus/media, from the site's stylesheets)
```css
/* → [data-cp="3"] */
.btn:hover { background: red; color: blue; }

/* → [data-cp="3"] */
.btn:active { background: green; }

/* → [data-cp="1"] */
@media (max-width: 600px) {
  .card { flex-direction: row; }
}

/* → [data-cp="2"] */
@media @container (min-width: 100px) {
  .title { letter-spacing: 1px; }
}

/* → [data-cp="3"] */
@media (prefers-reduced-motion: reduce) {
  .btn { animation-name: none; }
}
```

## Responsive + states
_Viewport and interaction-state snapshots unavailable: not running as an extension. Use the source rules above._

## Tokens used
```css
--ease: cubic-bezier(0.4, 0, 0.2, 1);
--green-a1: rgba(0, 200, 83, 0.05);
--green-a4: rgba(0, 200, 83, 0.2);
--pad: 16px;
--panel: rgb(250, 250, 250);
```

## Accessibility
[data-cp="2"] role=heading  name="Hello"
[data-cp="3"] role=button  name="Go"  focusable
[data-cp="4"] role=link  name="rel link"  focusable
Focus order: [data-cp="3"] → [data-cp="4"]

## Palette and type
Colours: rgb(17, 24, 39) · rgb(250, 250, 250) · rgb(0, 0, 0) · rgb(239, 239, 239) · rgb(0, 0, 238) · rgb(255, 255, 255) · rgb(30, 64, 175)
Type:    24px/700 · 13.3333px
Spacing: 0px · 1px · 2px · 6px ×2 · 12px · 16px · 19.92px

## Animations (running)
[data-cp="9"] — (WAAPI) · 400ms · linear · 1× · normal · running
  0% { opacity: 0; }
  100% { opacity: 1; }

## Scroll behaviour
[data-cp="8"] — hidden at rest (opacity: 0), revealed by adding `.is-visible` → { opacity: 1; }

## Keyframes
```css
@keyframes spin { 
  100% { transform: rotate(1turn); }
}
```

## Fonts
- Georgia 700 — 24px/normal (h2.title) · 16px/normal (b)
- Arial 400 — 13.3333px/normal (button.btn)
- Georgia 400 — 16px/normal (a, div.grad, div.reveal, +2 more)
- 1 @font-face rule(s) omitted — set `window.__cp.opts.fontFace = true` to include them.

## JS / handlers (React props + inline)
```
[data-cp="3"] onclick="alert(1)"
```