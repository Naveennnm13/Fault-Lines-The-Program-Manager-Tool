"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { teamColor } from "@/lib/fault-lines/teams";
import { cn } from "@/lib/utils";

interface GraphLegendProps {
  teams: string[];
  hiddenTeams: Set<string>;
  onToggleTeam: (team: string) => void;
  className?: string;
}

/**
 * Colour key for the graph, doubling as a team filter — the legend has to be
 * on screen anyway, so it may as well be the control.
 */
export function GraphLegend({
  teams,
  hiddenTeams,
  onToggleTeam,
  className,
}: GraphLegendProps) {
  return (
    <div
      className={cn(
        "bg-background/80 w-40 rounded-lg border p-3 backdrop-blur-sm",
        className,
      )}
    >
      <ul className="space-y-1.5">
        {teams.map((team) => {
          const visible = !hiddenTeams.has(team);
          return (
            <li key={team}>
              <label className="group flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={visible}
                  onCheckedChange={() => onToggleTeam(team)}
                  aria-label={`${visible ? "Hide" : "Show"} ${team} tasks`}
                  className="size-3.5"
                />
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: teamColor(team),
                    opacity: visible ? 1 : 0.3,
                  }}
                />
                <span
                  className={cn(
                    "transition-colors",
                    visible
                      ? "text-foreground"
                      : "text-muted-foreground line-through",
                  )}
                >
                  {team}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="text-muted-foreground mt-3 space-y-1.5 border-t pt-3 text-[11px]">
        <div className="flex items-center gap-2">
          <svg width="16" height="8" aria-hidden className="shrink-0">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="var(--graph-edge-critical)"
              strokeWidth="1.75"
            />
          </svg>
          Critical path
        </div>
        <div className="flex items-center gap-2">
          <svg width="16" height="10" aria-hidden className="shrink-0">
            <circle
              cx="8"
              cy="5"
              r="3.5"
              fill="none"
              stroke="var(--risk)"
              strokeWidth="1.5"
            />
          </svg>
          At risk
        </div>
        <div className="flex items-center gap-2">
          <svg width="16" height="10" aria-hidden className="shrink-0">
            <circle cx="8" cy="5" r="4" fill="var(--muted-foreground)" fillOpacity="0.4" />
          </svg>
          Not started
        </div>
      </div>
    </div>
  );
}
