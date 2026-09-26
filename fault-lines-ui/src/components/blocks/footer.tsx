import type { NarrativeFile } from "@/lib/fault-lines/types";

/**
 * A one-line provenance bar. The template's marketing footer (free-trial CTA,
 * site map, giant wordmark) has nothing to say on a single-page tool; what a
 * reader actually wants to know here is where the numbers came from.
 */
export function Footer({
  narrativeMode,
  startDate,
}: {
  narrativeMode: NarrativeFile["mode"];
  startDate: string;
}) {
  return (
    <footer className="text-muted-foreground flex h-9 shrink-0 items-center justify-between gap-4 border-t px-4 text-[11px] lg:px-6">
      <p className="truncate">
        Critical path, slack and bottleneck scores computed in{" "}
        <code className="font-mono">analyze.py</code> ·{" "}
        {narrativeMode === "live" ? (
          <>
            briefing written by Claude in{" "}
            <code className="font-mono">narrative.py</code>
          </>
        ) : (
          <>
            briefing is sample text —{" "}
            <code className="font-mono">narrative.py</code> ran without an API
            key
          </>
        )}{" "}
        · cascade recomputed in the browser
      </p>
      <p className="font-mono hidden shrink-0 sm:block">
        Program start {startDate}
      </p>
    </footer>
  );
}
