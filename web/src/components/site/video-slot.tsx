import { existsSync } from "node:fs";
import { join } from "node:path";
import { Clapperboard, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

/**
 * Drop `public/clips/<id>.mp4` in and this becomes the real video.
 * Until then it is the shot list for that clip.
 * ponytail: resolved at build time, so adding a clip needs a rebuild — which
 * is what `next build` does anyway. Move to a route handler only if the clips
 * ever need to appear without a deploy.
 */
export function VideoSlot({
  id,
  label,
  duration,
  className,
  compact = false,
}: {
  id: string;
  label: string;
  duration?: string;
  className?: string;
  compact?: boolean;
}) {
  const shot = existsSync(join(process.cwd(), "public", "clips", `${id}.mp4`));

  return (
    <figure
      className={cn("glass relative isolate overflow-hidden rounded-2xl", className)}
    >
      <GlowingEffect spread={38} glow proximity={72} inactiveZone={0.02} borderWidth={2} />
      {shot ? (
        <video
          className="aspect-video w-full rounded-2xl object-cover"
          src={`/clips/${id}.mp4`}
          controls
          playsInline
          preload="metadata"
        />
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
