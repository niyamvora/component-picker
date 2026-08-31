import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { REPO } from "@/data/types";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pt-24 pb-16 sm:px-6">
      <Separator />
      <div className="flex flex-col gap-4 pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl">
          MIT-licensed and fully open source — no paid tier, no pro version. Everything runs
          locally: no network, no analytics, no account. The optional MCP bridge is the one
          exception, off by default and localhost-only.
        </p>
        <div className="flex shrink-0 gap-4">
          <Link href="/issues" className="hover:text-foreground">
            Issues
          </Link>
          <Link href="/record" className="hover:text-foreground">
            Shot list
          </Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-foreground">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
