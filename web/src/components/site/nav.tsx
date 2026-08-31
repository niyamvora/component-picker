"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { REPO } from "@/data/types";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview" },
  { href: "/issues", label: "The 59 issues" },
  { href: "/record", label: "Shot list" },
];

export function Nav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-none px-4 sm:px-6 md:mt-4 md:rounded-2xl">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
          <span className="size-2.5 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
          Component Picker
        </Link>
        <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
          v1.4.1
        </Badge>

        <nav className="ml-auto flex items-center gap-0.5">
          {links.map((l) => (
            <Button nativeButton={false}
              key={l.href}
              variant="ghost"
              size="sm"
              className={cn(
                "text-muted-foreground",
                (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)) &&
                  "bg-muted text-foreground"
              )}
              render={<Link href={l.href} />}
            >
              {l.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="block dark:hidden" />
          </Button>
          <Button nativeButton={false}
            variant="ghost"
            size="icon-sm"
            aria-label="GitHub repository"
            render={<a href={REPO} target="_blank" rel="noreferrer" />}
          >
            <IconBrandGithub />
          </Button>
        </nav>
      </div>
    </header>
  );
}
