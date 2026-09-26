"use client";

import * as React from "react";

import { ChevronDown } from "lucide-react";

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
 * on screen anyway, so it may as well be the control. Each team's checkbox is
 * its own swatch: filled in the team colour when shown, outlined when hidden,
 * so a row carries one mark rather than a checkbox beside a dot.
 *
 * On a phone the open legend would cover a third of the graph, so below lg it
 * collapses to a single button. The open/closed state only applies there;
 * desktop always shows it, with no flash on load.
 */
export function GraphLegend({
  teams,
  hiddenTeams,
  onToggleTeam,
  className,
}: GraphLegendProps) {
  const [open, setOpen] = React.useState(false);
  const hiddenCount = teams.filter((t) => hiddenTeams.has(t)).length;

  return (
    <div
      className={cn("bg-background w-44 rounded-md border lg:w-40", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="graph-legend"
        className="flex h-10 w-full items-center justify-between gap-2 px-3 text-xs font-medium lg:hidden"
      >
        <span>
          Teams
          {hiddenCount > 0 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {hiddenCount} hidden
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        id="graph-legend"
        className={cn("p-3 max-lg:border-t", !open && "max-lg:hidden")}
      >
        <ul className="space-y-0.5">
          {teams.map((team) => {
            const visible = !hiddenTeams.has(team);
            return (
              <li key={team}>
                <label className="hover:bg-accent/60 -mx-1.5 flex min-h-8 cursor-pointer items-center gap-2 rounded px-1.5 text-xs lg:min-h-6">
                  <Checkbox
                    checked={visible}
                    onCheckedChange={() => onToggleTeam(team)}
                    aria-label={`${visible ? "Hide" : "Show"} ${team} tasks`}
                    style={{ "--team": teamColor(team) } as React.CSSProperties}
                    className="size-3.5 rounded-full border-[var(--team)] shadow-none data-[state=checked]:border-[var(--team)] data-[state=checked]:bg-[var(--team)] data-[state=checked]:text-background dark:bg-transparent dark:data-[state=checked]:bg-[var(--team)] [&_svg]:size-2.5"
                  />
                  <span
                    className={cn(
                      "transition-colors",
                      visible ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {team}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="text-muted-foreground mt-2.5 space-y-1.5 border-t pt-2.5 text-[11px]">
          <div className="flex items-center gap-2">
            <svg width="14" height="8" aria-hidden className="shrink-0">
              <line
                x1="0"
                y1="4"
                x2="14"
                y2="4"
                stroke="var(--graph-edge-critical)"
                strokeWidth="1.75"
              />
            </svg>
            Critical path
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="10" aria-hidden className="shrink-0">
              <circle
                cx="7"
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
            <svg width="14" height="10" aria-hidden className="shrink-0">
              <circle
                cx="7"
                cy="5"
                r="4"
                fill="var(--muted-foreground)"
                fillOpacity="0.4"
              />
            </svg>
            Not started
          </div>
        </div>
      </div>
    </div>
  );
}
