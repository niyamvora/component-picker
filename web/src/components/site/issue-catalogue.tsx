"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bug,
  CircleDot,
  Clapperboard,
  Flag,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { issues, tiers } from "@/data/issues";
import type { Kind } from "@/data/types";
import { cn } from "@/lib/utils";

const kindIcon: Record<Kind, typeof Bug> = {
  feature: Sparkles,
  bug: Bug,
  chore: Wrench,
  task: Wrench,
  epic: Flag,
};

const kindTone: Record<Kind, string> = {
  feature: "bg-primary/12 text-primary ring-primary/20",
  bug: "bg-rose/12 text-rose ring-rose/25",
  chore: "bg-cyan/12 text-cyan ring-cyan/25",
  task: "bg-cyan/12 text-cyan ring-cyan/25",
  epic: "bg-amber/12 text-amber ring-amber/25",
};

const status = ["all", "shipped", "open"] as const;

export function IssueCatalogue() {
  const [tier, setTier] = useState("all");
  const [state, setState] = useState<(typeof status)[number]>("all");

  const shown = useMemo(
    () =>
      issues.filter(
        (i) =>
          (tier === "all" || i.tier === tier) &&
          (state === "all" || (state === "open") === i.open)
      ),
    [tier, state]
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="glass sticky top-20 z-30 flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Tier</span>
          <ToggleGroup
            value={[tier]}
            onValueChange={(v) => setTier(v[0] ?? "all")}
            className="flex-wrap"
          >
            <ToggleGroupItem value="all" size="sm">
              All
            </ToggleGroupItem>
            {tiers.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id} size="sm">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <ToggleGroup
            value={[state]}
            onValueChange={(v) =>
              setState((v[0] as (typeof status)[number]) ?? "all")
            }
          >
            {status.map((s) => (
              <ToggleGroupItem key={s} value={s} size="sm" className="capitalize">
                {s}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Badge variant="secondary" className="ml-auto font-mono text-[11px]">
            {shown.length} shown
          </Badge>
        </div>
      </div>

      <BentoGrid className="max-w-none md:auto-rows-[15.5rem]">
        {shown.map((i) => {
          const Icon = kindIcon[i.kind];
          return (
            <BentoGridItem
              key={i.n}
              className={cn(
                "relative isolate cursor-pointer",
                i.span === "wide" && "md:col-span-2"
              )}
              header={
                <>
                  <GlowingEffect
                    spread={34}
                    glow
                    proximity={64}
                    inactiveZone={0.02}
                    borderWidth={2}
                  />
                  <Link
                    href={`/issues/${i.n}`}
                    className="absolute inset-0 z-10 rounded-2xl"
                  >
                    <span className="sr-only">Issue #{i.n}</span>
                  </Link>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl ring-1",
                        kindTone[i.kind]
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {i.tier}
                      </Badge>
                      <Badge
                        variant={i.open ? "outline" : "secondary"}
                        className="font-mono text-[10px]"
                      >
                        <CircleDot
                          data-icon="inline-start"
                          className={i.open ? "text-amber" : "text-lime"}
                        />
                        {i.open ? "open" : "shipped"}
                      </Badge>
                    </span>
                  </div>
                </>
              }
              title={
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{i.n}</span>
                  <span className="text-pretty">{i.title}</span>
                </span>
              }
              description={
                <span className="flex h-full flex-col justify-between gap-3">
                  <span className="line-clamp-3">{i.why}</span>
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clapperboard className="size-3" />
                    {i.record.length} shot{i.record.length === 1 ? "" : "s"}
                    <span className="ml-auto font-mono">
                      {i.areas.map((a) => `area:${a}`).join(" · ")}
                    </span>
                  </span>
                </span>
              }
            />
          );
        })}
      </BentoGrid>
    </div>
  );
}
