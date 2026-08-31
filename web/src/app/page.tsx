import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Boxes,
  Contrast,
  Gauge,
  Layers,
  LayoutDashboard,
  MousePointerClick,
  Palette,
  Smartphone,
  Sparkles,
  TerminalSquare,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { Spotlight } from "@/components/ui/spotlight-new";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Timeline } from "@/components/ui/timeline";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { VideoSlot } from "@/components/site/video-slot";
import { issues, issuesInTier, openIssues, shipped, tiers } from "@/data/issues";
import { REPO, VERSION } from "@/data/types";

const stats = [
  { k: String(issues.length), v: "issues filed" },
  { k: String(shipped.length), v: "shipped and closed" },
  { k: "24", v: "bundle sections" },
  { k: "0", v: "network calls" },
  { k: "MIT", v: "free, and staying free" },
];

const capture = [
  {
    icon: MousePointerClick,
    title: "Resolved CSS, not a DOM dump",
    body: "Real px and rgb values, diffed against browser defaults and against the parent — with the rendered box size on every rule.",
    n: [4, 6, 10],
    className: "md:col-span-2",
    clip: "css-resolved",
  },
  {
    icon: Contrast,
    title: "States you cannot screenshot",
    body: ":hover, :focus-visible and :active forced through CDP and diffed against resting — plus every sibling variant.",
    n: [1, 2, 3],
    clip: "states",
  },
  {
    icon: Palette,
    title: "Tokens, named",
    body: "rgba(176,199,217,.145) with /* var(--gray-a3) */ beside it, gradient stop lists, and a W3C Design Tokens JSON export.",
    n: [8, 9, 35],
    clip: "tokens",
  },
  {
    icon: Smartphone,
    title: "Themes and viewports",
    body: "Light and dark in one pick, mobile and tablet as diffs, each annotated with the @media or @container rule behind it.",
    n: [5, 13, 43, 45],
    clip: "themes",
  },
  {
    icon: LayoutDashboard,
    title: "A front door, since v1.6",
    body: "A frosted dock at the bottom of the page — Pick, Fast, Measure, Copy image, Figma, Save — and a settings drawer. No more guessing that G copies for Figma.",
    n: [69],
    clip: "dock",
  },
  {
    icon: Sparkles,
    title: "Motion that survives the copy",
    body: "Running WAAPI/CSS animations, Framer Motion props off the fiber, GSAP timelines, and reveal-on-scroll flagged instead of captured as opacity: 0.",
    n: [29, 30, 31, 32],
    className: "md:col-span-2",
    clip: "motion",
  },
  {
    icon: Boxes,
    title: "Your components, not div soup",
    body: "Repeats collapse to one card plus a data table, and a two-line inventory maps the output onto your own <Button> and <Card>.",
    n: [37, 38],
    clip: "mapping",
  },
  {
    icon: Accessibility,
    title: "Accessibility, which nobody else captures",
    body: "Roles, accessible names, focus order and WCAG contrast — so you do not silently copy someone else's a11y bug into your codebase.",
    n: [40],
    clip: "a11y",
  },
  {
    icon: TerminalSquare,
    title: "Or skip the paste entirely",
    body: "npx component-picker-mcp turns it into a tool your agent calls itself. Off by default, localhost-only.",
    n: [39, 61, 67],
    className: "md:col-span-2",
    clip: "mcp",
  },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pt-20 pb-8 sm:px-6">
        <Spotlight />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
          <Badge variant="outline" className="glass h-7 gap-2 px-3 font-mono text-[11px]">
            <span className="size-1.5 rounded-full bg-lime" />
            v{VERSION} · {shipped.length} of {issues.length} issues shipped
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Copy any component as a bundle{" "}
            <span className="bg-gradient-to-br from-primary via-primary to-cyan bg-clip-text text-transparent">
              an AI can actually rebuild
            </span>
          </h1>

          <TextGenerateEffect
            words="Hover it. Click it. Your clipboard holds the HTML, the browser-resolved CSS, the hover states, both themes, the responsive diffs, the tokens, the animations and the accessibility tree."
            className="max-w-2xl [&_div]:text-base [&_div]:leading-relaxed [&_div]:font-normal [&_div]:tracking-normal [&_div]:text-muted-foreground sm:[&_div]:text-lg"
            duration={0.35}
          />

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/issues" className="rounded-full">
              <HoverBorderGradient
                as="span"
                containerClassName="rounded-full"
                className="flex items-center gap-2 text-sm font-medium"
              >
                Every issue, one by one
                <ArrowRight className="size-4" />
              </HoverBorderGradient>
            </Link>
            <Button nativeButton={false}
              variant="outline"
              size="lg"
              className="glass rounded-full"
              render={<Link href="/record" />}
            >
              <Wand2 data-icon="inline-start" />
              What to record
            </Button>
          </div>

          <dl className="mt-8 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-5">
            {stats.map((s) => (
              <div key={s.v} className="glass flex flex-col items-center gap-1 p-5">
                <dt className="font-mono text-3xl font-semibold tabular-nums">{s.k}</dt>
                <dd className="text-xs text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The hero loop ────────────────────────────────────── */}
      <section className="-mt-10 sm:-mt-4">
        <ContainerScroll
          titleComponent={
            <div className="flex flex-col items-center gap-3 pb-10">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Hover. Click. Paste.
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Fifteen seconds, silent, on a loop — the whole product in one take.
              </p>
            </div>
          }
        >
          <VideoSlot
            id="hero-loop"
            label="Hero loop — hover a component → click → toast → paste into Claude Code → the rebuilt component renders"
            duration="0:15"
            still="/shots/dock.png"
            className="size-full rounded-2xl"
          />
        </ContainerScroll>
      </section>

      {/* ── Bento: what one capture contains ─────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" id="capture">
        <div className="mb-10 flex flex-col gap-3">
          <Badge variant="outline" className="w-fit font-mono text-[11px]">
            one pick
          </Badge>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Twenty-four sections, and every one of them was an issue
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            Nothing here was designed up front. Every section below exists because a specific
            capture came out wrong, or came out missing, and somebody filed it.
          </p>
        </div>

        <BentoGrid className="max-w-none md:auto-rows-[15rem]">
          {capture.map((c) => (
            <BentoGridItem
              key={c.title}
              className={c.className}
              icon={
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                  <c.icon className="size-4" />
                </span>
              }
              title={c.title}
              description={
                <span className="flex flex-col gap-3">
                  <span className="block">{c.body}</span>
                  <span className="flex flex-wrap gap-1">
                    {c.n.map((n) => (
                      <Badge
                        key={n}
                        variant="secondary"
                        className="font-mono text-[10px]"
                        render={<Link href={`/issues/${n}`} />}
                      >
                        #{n}
                      </Badge>
                    ))}
                  </span>
                </span>
              }
            />
          ))}
        </BentoGrid>
      </section>

      {/* ── The tier timeline ────────────────────────────────── */}
      <section id="tiers">
        <Timeline
          heading="Ten milestones, in the order they had to happen"
          subheading="Correctness first — a wrong capture is worse than a missing one — then the sections that save the reader the most time, then the ground nobody else is standing on."
          data={tiers
            .filter((t) => t.id !== "meta")
            .map((tier) => {
              const list = issuesInTier(tier.id);
              return {
                title: `${tier.label}`,
                content: (
                  <div key={tier.id} className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight">{tier.name}</h3>
                      <Badge variant={tier.shipped ? "secondary" : "outline"}>
                        {tier.shipped ? "shipped" : `${list.filter((i) => i.open).length} open`}
                      </Badge>
                    </div>
                    <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {tier.goal}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {list.map((i) => (
                        <li key={i.n}>
                          <Link
                            href={`/issues/${i.n}`}
                            className="group flex items-baseline gap-2.5 text-sm hover:text-primary"
                          >
                            <span className="font-mono text-xs text-muted-foreground group-hover:text-primary">
                              #{i.n}
                            </span>
                            <span className="text-pretty">{i.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              };
            })}
        />
      </section>

      {/* ── Recording CTA ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="glass relative isolate overflow-hidden rounded-3xl p-8 sm:p-12">
          <GlowingEffect spread={44} glow proximity={110} inactiveZone={0.05} borderWidth={2} />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-xl flex-col gap-3">
              <Badge variant="outline" className="w-fit font-mono text-[11px]">
                <Gauge data-icon="inline-start" />
                the video is missing on purpose
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">
                Every slot on this site is waiting for a file
              </h2>
              <p className="text-muted-foreground">
                Drop <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  public/clips/&lt;id&gt;.mp4
                </code>{" "}
                next to a placeholder and it becomes the video — no code change. The shot list
                names every clip, in order, with what has to be in frame.
              </p>
            </div>
            <Button nativeButton={false} size="lg" className="rounded-full" render={<Link href="/record" />}>
              Open the shot list
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── What is left ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Separator className="mb-10" />
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-md flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              <Layers className="mr-2 inline size-5 text-primary" />
              What is still open
            </h2>
            <p className="text-sm text-muted-foreground">
              {openIssues.length} of {issues.length}. Two of them are the same thing: the Web Store
              listing needs a person and a paid developer account, not code.
            </p>
          </div>
          <ul className="flex flex-1 flex-col gap-2">
            {openIssues.map((i) => (
              <li key={i.n}>
                <Link
                  href={`/issues/${i.n}`}
                  className="glass flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition hover:border-primary/30"
                >
                  <span className="font-mono text-xs text-muted-foreground">#{i.n}</span>
                  <span className="flex-1 text-pretty">{i.title}</span>
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {i.tier}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Close ────────────────────────────────────────────── */}
      <section className="relative isolate mx-auto flex min-h-[22rem] w-full max-w-6xl flex-col items-center justify-center gap-5 overflow-hidden rounded-3xl border px-6 py-16 text-center">
        <BackgroundBeams />
        <h2 className="relative z-10 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Nothing leaves the browser
        </h2>
        <p className="relative z-10 max-w-xl text-muted-foreground">
          No network calls, no analytics, no account. Load the folder and paste. It is MIT-licensed
          and open source end to end — no paid tier, no pro version, nothing held back.
        </p>
        <div className="relative z-10 flex flex-wrap justify-center gap-3">
          <Button nativeButton={false}
            size="lg"
            className="rounded-full"
            render={<a href={`${REPO}/releases/latest`} target="_blank" rel="noreferrer" />}
          >
            Download the release
          </Button>
          <Button nativeButton={false}
            variant="outline"
            size="lg"
            className="glass rounded-full"
            render={<a href={REPO} target="_blank" rel="noreferrer" />}
          >
            Read the source
          </Button>
        </div>
      </section>
    </>
  );
}
