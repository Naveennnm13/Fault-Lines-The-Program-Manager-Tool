"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type ViewId = "graph" | "board" | "briefing";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "graph", label: "Dependency graph" },
  { id: "board", label: "Risk board" },
  { id: "briefing", label: "Briefing" },
];

/**
 * Plain tablist with roving focus. Radix Tabs would work, but the panels here
 * are full-height layouts owned by the console rather than siblings in a
 * container, so the primitive's structure gets in the way.
 */
export function ViewTabs({
  value,
  onChange,
  counts,
}: {
  value: ViewId;
  onChange: (id: ViewId) => void;
  counts?: Partial<Record<ViewId, number>>;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + VIEWS.length) % VIEWS.length;
    onChange(VIEWS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Views"
      className="flex shrink-0 items-center gap-1 border-b px-3"
    >
      {VIEWS.map((view, index) => {
        const selected = view.id === value;
        const count = counts?.[view.id];
        return (
          <button
            key={view.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(view.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "focus-visible:ring-ring relative flex items-center gap-2 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {view.label}
            {count !== undefined && (
              <span
                className={cn(
                  "tabular font-mono rounded px-1.5 py-0.5 text-[10px]",
                  selected
                    ? "bg-risk/10 text-risk"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
            {/* Sits on the container's bottom border rather than adding height. */}
            <span
              aria-hidden
              className={cn(
                "bg-foreground absolute inset-x-2 -bottom-px h-px transition-opacity",
                selected ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
