# Component Picker — site

The public site for the extension: what it captures, every issue that built it, and the shot
list for the demo video.

```sh
npm install
npm run dev     # http://localhost:3000
npm run build   # static export of 60 pages
```

## Routes

| Route | What it is |
|---|---|
| `/` | Hero, the bento of what one capture contains, the milestone timeline |
| `/issues` | All 60 issues, filterable by milestone and status |
| `/issues/[n]` | One issue: what was wrong, the acceptance criterion, its video slot, its shot list |
| `/record` | The full shot list — 12 scenes, the setup checklist, and every clip filename |

## Adding the videos

Every video placeholder on the site is waiting for a file. Drop it in and rebuild — there is no
code change and no config:

```
public/clips/hero-loop.mp4     # the 15s silent loop at the top of /
public/clips/<scene-id>.mp4    # one per scene on /record (install, arm, hover, …)
public/clips/issue-<n>.mp4     # optional, per issue page
```

`VideoSlot` checks for the file at build time. Present → a `<video>`. Absent → the placeholder
stays up with that clip's shot list. A missing file is never an error.

`/record` lists every filename the site is waiting for, in order.

## Data

Everything on the site comes from two files, so the content lives in one place:

- `src/data/issues.ts` — the milestones and all 60 issues, each with the reason it was filed, its
  acceptance criterion, and what to film for it.
- `src/data/scenes.ts` — the recording setup, the hero loop, and the 12 scenes.

Keep them in step with the GitHub board when issues close.

## Stack

Next.js 16 (App Router, Turbopack) · Tailwind v4 · shadcn/ui on Base UI · Aceternity UI
(bento grid, spotlight, timeline, tracing beam, glowing effect, container scroll, background
beams) · `next-themes` for light/dark. Every component comes from a registry; the theme is
defined once as tokens in `src/app/globals.css`.
