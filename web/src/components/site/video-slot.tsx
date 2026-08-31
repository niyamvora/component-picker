import { existsSync } from "node:fs";
import { join } from "node:path";
import { Camera, Clapperboard, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

/**
 * Three states, in order of preference:
 *   public/clips/<id>.mp4 exists  → the video
 *   a `still` was passed          → the real screenshot, captioned as a still
 *   neither                       → the shot list for that clip
 *
 * ponytail: resolved at build time, so a new clip needs a rebuild — which is
 * what `next build` does anyway. Move to a route handler only if clips ever
 * need to appear without a deploy.
 */
export function VideoSlot({
  id,
  label,
  duration,
  still,
  className,
  compact = false,
}: {
  id: string;
  label: string;
  duration?: string;
  still?: string;
  className?: string;
  compact?: boolean;
}) {
  const clip = existsSync(join(process.cwd(), "public", "clips", `${id}.mp4`));

  return (
    <figure
      className={cn("glass relative isolate overflow-hidden rounded-2xl", className)}
    >
      <GlowingEffect spread={38} glow proximity={72} inactiveZone={0.02} borderWidth={2} />

      {clip ? (
        <video
          className="aspect-video w-full rounded-2xl object-cover"
          src={`/clips/${id}.mp4`}
          poster={still}
          controls
          playsInline
          preload="metadata"
        />
      ) : still ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static shot, already sized */}
          <img
            src={still}
            alt={label}
            className="aspect-video w-full rounded-2xl bg-black/40 object-contain"
          />
          {/* Below the image, never over it — the dock lives at the bottom of these shots. */}
          <figcaption className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
            <Badge variant="outline" className="font-mono text-[10px]">
              <Camera data-icon="inline-start" />
              still
            </Badge>
            <span className="text-[11px] text-muted-foreground">clip pending — {label}</span>
          </figcaption>
        </>
      ) : (
        <div
          className={cn(
            "grid-bg flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center",
            compact && "gap-2"
          )}
        >
          <span className="relative flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25">
            <Play className="size-4 translate-x-px fill-current" />
          </span>
          <figcaption className="flex flex-col items-center gap-2">
            <span
              className={cn(
                "max-w-lg font-medium text-balance",
                compact ? "text-xs" : "text-sm"
              )}
            >
              {label}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                <Clapperboard data-icon="inline-start" />
                clips/{id}.mp4
              </Badge>
              {duration ? (
                <Badge variant="ghost" className="font-mono text-[10px]">
                  {duration}
                </Badge>
              ) : null}
            </span>
          </figcaption>
        </div>
      )}
    </figure>
  );
}
