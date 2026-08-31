import type { Metadata } from "next";
import Link from "next/link";
import {
  Camera,
  Clapperboard,
  Film,
  ListChecks,
  Repeat,
  Scissors,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TracingBeam } from "@/components/ui/tracing-beam";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { VideoSlot } from "@/components/site/video-slot";
import { loop, scenes, setup } from "@/data/scenes";
import { issues } from "@/data/issues";

export const metadata: Metadata = {
  title: "Shot list",
  description:
    "Exactly what to record, in order, with what has to be in frame — plus the filename each clip needs so it drops straight into the site.",
};

const title = (n: number) => issues.find((i) => i.n === n)?.title ?? "";

export default function RecordPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-4">
        <Badge variant="outline" className="w-fit font-mono text-[11px]">
          <Clapperboard data-icon="inline-start" />
          shot list
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          What to record, in the order to record it
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          Twelve scenes, about three and a half minutes, plus a fifteen-second silent loop for
          the top of the site. Every scene below names its clip file — drop the file in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">public/clips/</code>{" "}
          and the placeholder becomes the video.
        </p>
      </header>

      {/* ── Before you hit record ────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Camera className="size-5 text-primary" />
          Before you hit record
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {setup.map((s) => (
            <div key={s.label} className="glass relative isolate rounded-2xl p-4">
              <GlowingEffect spread={30} glow proximity={60} inactiveZone={0.02} borderWidth={1} />
              <p className="mb-1 text-sm font-medium">{s.label}</p>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The loop ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Repeat className="size-5 text-cyan" />
          {loop.title}
        </h2>
        <p className="text-muted-foreground text-pretty">{loop.detail}</p>
        <VideoSlot id="hero-loop" label="The 15-second hero loop" duration="0:15" />
        <ol className="flex flex-col gap-2">
          {loop.steps.map((s, i) => (
            <li key={i} className="flex items-baseline gap-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="text-pretty">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <Separator />

      {/* ── The twelve scenes ────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Film className="size-5 text-primary" />
          The long video, scene by scene
        </h2>
        <p className="mb-4 text-muted-foreground text-pretty">
          Shoot them in this order. The timecodes are targets, not rules — if a scene runs long,
          it is almost always the bundle scroll, and that one is allowed to.
        </p>

        <TracingBeam className="px-6">
          <div className="flex max-w-2xl flex-col gap-14 pt-4 pb-10">
            {scenes.map((scene, i) => (
              <section key={scene.id} id={scene.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    Scene {i + 1}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {scene.t}
                  </Badge>
                  <Badge variant="ghost" className="font-mono text-[11px]">
                    clips/{scene.id}.mp4
                  </Badge>
                </div>

                <h3 className="text-2xl font-semibold tracking-tight text-balance">
                  {scene.title}
                </h3>
                <p className="text-muted-foreground text-pretty">{scene.goal}</p>

                <VideoSlot id={scene.id} label={scene.title} duration={scene.t} compact />

                <ol className="flex flex-col gap-2.5">
                  {scene.steps.map((s, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                      <p
                        className="text-sm leading-relaxed text-pretty [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs"
                        dangerouslySetInnerHTML={{ __html: md(s) }}
                      />
                    </li>
                  ))}
                </ol>

                <Alert>
                  <ListChecks className="text-cyan" />
                  <AlertTitle>Has to be in frame</AlertTitle>
                  <AlertDescription>{scene.onScreen}</AlertDescription>
                </Alert>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Proves:</span>
                  {scene.issues.map((n) => (
                    <Link key={n} href={`/issues/${n}`} title={title(n)}>
                      <Badge variant="outline" className="font-mono text-[10px] hover:border-primary/40">
                        #{n}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </TracingBeam>
      </section>

      <Separator />

      {/* ── Clip index ───────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Scissors className="size-5 text-amber" />
          Every filename this site is waiting for
        </h2>
        <p className="text-muted-foreground text-pretty">
          {scenes.length + 1} scene clips, plus one per issue if you want the per-issue pages
          filled in too. A missing file is not an error — the placeholder just stays up.
        </p>
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Scene</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Target</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">clips/hero-loop.mp4</td>
                <td className="px-4 py-3">The silent hero loop</td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                  0:15
                </td>
              </tr>
              {scenes.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">clips/{s.id}.mp4</td>
                  <td className="px-4 py-3 text-pretty">{s.title}</td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                    {s.t}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-3 font-mono text-xs">clips/issue-&lt;n&gt;.mp4</td>
                <td className="px-4 py-3">
                  Optional — the per-issue clip on{" "}
                  <Link href="/issues" className="text-primary hover:underline">
                    any issue page
                  </Link>
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                  ≤ 0:20
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The only markup the steps use: **bold** and `code`. Escape first, then convert. */
function md(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
