"use client";

import * as React from "react";

import { ChevronRight, GitBranch } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SOURCE_LABEL, type ProseSource } from "@/lib/fault-lines/briefing";
import type { CascadeContext } from "@/lib/fault-lines/cascade";
import { simulateDelay } from "@/lib/fault-lines/cascade";
import { groupByTier, TIERS, type RiskItem } from "@/lib/fault-lines/severity";
import { STATUS_LABEL, teamColor } from "@/lib/fault-lines/teams";
import { cn } from "@/lib/utils";

interface RiskBoardProps {
  items: RiskItem[];
  cascadeCtx: CascadeContext;
  /** Narrative mitigations, keyed by task id, where one exists for this task. */
  mitigations: Map<string, string>;
  /** Whether those mitigations were written by Claude or are sample text. */
  mitigationSource: ProseSource;
  hiddenCount: number;
  onShowInGraph: (id: string) => void;
}

/**
 * Triage board. Lanes are severity tiers derived from the bottleneck score,
 * not task status — the point is what to do first, not what state things are
 * in. Cards are read-only on purpose: their lane is computed from the
 * analysis, so dragging one would be asserting something the data does not
 * support.
 */
export function RiskBoard({
  items,
  cascadeCtx,
  mitigations,
  mitigationSource,
  hiddenCount,
  onShowInGraph,
}: RiskBoardProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const grouped = React.useMemo(() => groupByTier(items), [items]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 gap-px overflow-hidden bg-border lg:min-h-0 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const lane = grouped[tier.id];
          return (
            <section
              key={tier.id}
              aria-label={tier.label}
              className="bg-background flex flex-col lg:min-h-0"
            >
              <header className="flex shrink-0 items-baseline gap-2 px-4 pt-4 pb-3">
                <h2 className="text-sm font-medium">{tier.label}</h2>
                <span
                  className={cn(
                    "tabular font-mono rounded px-1.5 py-0.5 text-[11px]",
                    tier.id === "escalate"
                      ? "bg-risk/10 text-risk"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {lane.length}
                </span>
                <p className="text-muted-foreground ml-auto hidden text-[11px] xl:block">
                  {tier.blurb}
                </p>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4 lg:min-h-0">
                {lane.length === 0 ? (
                  <p className="text-muted-foreground border-dashed border py-6 text-center text-xs rounded-lg">
                    Nothing in this lane.
                  </p>
                ) : (
                  lane.map((item) => (
                    <RiskTicket
                      key={item.task.id}
                      item={item}
                      cascadeCtx={cascadeCtx}
                      mitigation={mitigations.get(item.task.id)}
                      mitigationSource={mitigationSource}
                      expanded={expandedId === item.task.id}
                      onToggle={() =>
                        setExpandedId((current) =>
                          current === item.task.id ? null : item.task.id,
                        )
                      }
                      onShowInGraph={() => onShowInGraph(item.task.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-[11px]">
        {hiddenCount} tasks are not on this board — completed, or with no
        downstream reach and more than two days of float.
      </p>
    </div>
  );
}

function RiskTicket({
  item,
  cascadeCtx,
  mitigation,
  mitigationSource,
  expanded,
  onToggle,
  onShowInGraph,
}: {
  item: RiskItem;
  cascadeCtx: CascadeContext;
  mitigation?: string;
  mitigationSource: ProseSource;
  expanded: boolean;
  onToggle: () => void;
  onShowInGraph: () => void;
}) {
  const { task, score, slack, summary, reasons, downstream, downstreamTeams } =
    item;

  // Only computed when the ticket opens; the board would otherwise run 21
  // cascades on mount.
  const projection = React.useMemo(
    () => (expanded ? simulateDelay(cascadeCtx, task.id, 3) : null),
    [expanded, cascadeCtx, task.id],
  );

  const panelId = `ticket-${task.id}`;

  return (
    <Card className="overflow-hidden shadow-none">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="hover:bg-accent/40 focus-visible:ring-ring flex w-full gap-2.5 p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: teamColor(task.team) }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-muted-foreground text-[11px]">
              {task.id}
            </span>
            <span className="truncate text-sm font-medium">{task.name}</span>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {summary}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">
              POC{" "}
              <span className="text-foreground font-medium">{task.owner}</span>
            </span>
            <span
              className={cn(
                "font-mono rounded border px-1 py-px text-[10px] uppercase",
                task.status === "blocked"
                  ? "border-risk/50 text-risk"
                  : "text-muted-foreground",
              )}
            >
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
            {score.on_critical_path && (
              <span className="font-mono border-foreground/40 rounded border px-1 py-px text-[10px] uppercase">
                Critical path
              </span>
            )}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div id={panelId} className="space-y-3 border-t p-3 text-xs">
          <ul className="space-y-1.5">
            {reasons.map((reason) => (
              <li key={reason} className="flex gap-2 leading-relaxed">
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                {reason}
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-3 gap-2 border-t pt-3">
            <div>
              <dt className="text-muted-foreground text-[11px]">Blast radius</dt>
              <dd className="tabular mt-0.5">{downstream.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px]">Slack</dt>
              <dd
                className={cn("tabular mt-0.5", slack === 0 && "text-risk")}
              >
                {slack}d
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px]">Score</dt>
              <dd className="tabular mt-0.5">{score.score}</dd>
            </div>
          </dl>

          {downstreamTeams.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-1.5 text-[11px]">
                Teams waiting on this
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {downstreamTeams.sort().map((team) => (
                  <li key={team} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: teamColor(team) }}
                    />
                    {team}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {projection && (
            <p className="border-t pt-3 leading-relaxed">
              <span className="text-muted-foreground">If it slips 3 days: </span>
              {projection.programSlip > 0 ? (
                <>
                  <span className="text-risk font-medium">
                    the program end date moves to day {projection.newProgramLength}
                  </span>{" "}
                  ({projection.programSlip}d later), shifting{" "}
                  {projection.affectedTasks.length} tasks.
                </>
              ) : (
                <>
                  absorbed by float — the end date holds at day{" "}
                  {projection.newProgramLength}, but{" "}
                  {projection.affectedTasks.length} tasks still move.
                </>
              )}
            </p>
          )}

          {mitigation && (
            <div className="border-risk/40 border-l-2 pl-3">
              <p className="text-muted-foreground mb-1 text-[11px]">
                Recommended mitigation · {SOURCE_LABEL[mitigationSource]}
              </p>
              <p className="leading-relaxed">{mitigation}</p>
            </div>
          )}

          <button
            type="button"
            onClick={onShowInGraph}
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <GitBranch className="size-3" />
            Show in dependency graph
          </button>
        </div>
      )}
    </Card>
  );
}
