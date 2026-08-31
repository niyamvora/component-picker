import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, CircleDot, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { VideoSlot } from "@/components/site/video-slot";
import { issues, tierOf } from "@/data/issues";
import { issueUrl } from "@/data/types";

export function generateStaticParams() {
  return issues.map((i) => ({ n: String(i.n) }));
}

export async function generateMetadata(
  props: PageProps<"/issues/[n]">
): Promise<Metadata> {
  const { n } = await props.params;
  const issue = issues.find((i) => String(i.n) === n);
  if (!issue) return {};
  return { title: `#${issue.n} — ${issue.title}`, description: issue.why };
}

export default async function IssuePage(props: PageProps<"/issues/[n]">) {
  const { n } = await props.params;
  const idx = issues.findIndex((i) => String(i.n) === n);
  if (idx === -1) notFound();

  const issue = issues[idx];
  const tier = tierOf(issue.tier);
  const prev = issues[idx - 1];
  const next = issues[idx + 1];

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-16 sm:px-6">
      <Button nativeButton={false}
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground"
        render={<Link href="/issues" />}
      >
        <ArrowLeft data-icon="inline-start" />
        All issues
      </Button>

      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="font-mono text-[11px]">
            #{issue.n}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            {tier.label} · {tier.name}
          </Badge>
          <Badge variant={issue.open ? "outline" : "secondary"} className="font-mono text-[11px]">
            {issue.open ? (
              <CircleDot data-icon="inline-start" className="text-amber" />
            ) : (
              <CircleCheck data-icon="inline-start" className="text-lime" />
            )}
            {issue.open ? "open" : "shipped"}
          </Badge>
          <Badge variant="ghost" className="font-mono text-[11px]">
            type:{issue.kind}
          </Badge>
          {issue.priority ? (
            <Badge variant="ghost" className="font-mono text-[11px]">
              {issue.priority}
            </Badge>
          ) : null}
          {issue.areas.map((a) => (
            <Badge key={a} variant="ghost" className="font-mono text-[11px]">
              area:{a}
            </Badge>
          ))}
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {issue.title}
        </h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          What was wrong
        </h2>
        <p className="text-lg leading-relaxed text-pretty">{issue.why}</p>
      </section>

      <Alert>
        <CircleCheck className="text-lime" />
        <AlertTitle>Acceptance criterion</AlertTitle>
        <AlertDescription>{issue.proof}</AlertDescription>
      </Alert>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          The clip
        </h2>
        <VideoSlot
          id={`issue-${issue.n}`}
          label={issue.proof}
          duration={`${issue.record.length} shot${issue.record.length === 1 ? "" : "s"}`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          What to record
        </h2>
        <ol className="flex flex-col gap-3">
          {issue.record.map((step, i) => (
            <li key={i} className="glass relative isolate flex gap-4 rounded-2xl p-4">
              <GlowingEffect spread={30} glow proximity={56} inactiveZone={0.02} borderWidth={1} />
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-xs text-primary ring-1 ring-primary/20">
                {i + 1}
              </span>
              <p
                className="flex-1 text-sm leading-relaxed text-pretty [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs"
                dangerouslySetInnerHTML={{ __html: md(step) }}
              />
            </li>
          ))}
        </ol>
      </section>

      <Separator />

      <footer className="flex flex-col gap-6">
        <Button nativeButton={false}
          variant="outline"
          size="sm"
          className="glass w-fit"
          render={<a href={issueUrl(issue.n)} target="_blank" rel="noreferrer" />}
        >
          Read issue #{issue.n} on GitHub
          <ExternalLink data-icon="inline-end" />
        </Button>

        <nav className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {prev ? (
            <Link
              href={`/issues/${prev.n}`}
              className="glass flex flex-1 items-center gap-3 rounded-2xl p-4 text-sm transition hover:border-primary/30"
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-mono text-[11px] text-muted-foreground">#{prev.n}</span>
                <span className="text-pretty">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/issues/${next.n}`}
              className="glass flex flex-1 items-center gap-3 rounded-2xl p-4 text-right text-sm transition hover:border-primary/30"
            >
              <span className="ml-auto flex flex-col">
                <span className="font-mono text-[11px] text-muted-foreground">#{next.n}</span>
                <span className="text-pretty">{next.title}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </footer>
    </article>
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
