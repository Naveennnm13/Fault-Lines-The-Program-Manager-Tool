import { Github } from "lucide-react";

import { ProgramSwitcher } from "@/components/fault-lines/program-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ProgramIndex } from "@/lib/fault-lines/types";

/**
 * App bar for a single-page tool. The template's floating marketing pill is
 * gone: there is nowhere to navigate to, and an absolutely positioned bar would
 * sit on top of the graph.
 */
export function Navbar({
  programs,
  currentSlug,
  taskCount,
  teamCount,
}: {
  programs: ProgramIndex["programs"];
  currentSlug: string;
  taskCount: number;
  teamCount: number;
}) {
  // Set at build time. Unset means no link, rather than a link to nowhere.
  const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL;

  return (
    <header className="bg-background/80 sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur-md lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-display shrink-0 text-base tracking-tight">
          Fault Lines
        </span>
        <span aria-hidden className="text-muted-foreground/60 shrink-0">
          /
        </span>
        <ProgramSwitcher programs={programs} currentSlug={currentSlug} />
        <span className="text-muted-foreground font-mono hidden shrink-0 text-xs md:block">
          {taskCount} tasks · {teamCount} teams
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        {sourceUrl && (
          <a
            href={sourceUrl}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <Github className="size-4" />
            <span className="sr-only">Source code</span>
          </a>
        )}
      </div>
    </header>
  );
}
