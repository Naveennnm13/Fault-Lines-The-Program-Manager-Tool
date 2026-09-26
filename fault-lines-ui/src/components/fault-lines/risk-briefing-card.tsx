"use client";

import { ArrowLeft, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  narrativeSource,
  SOURCE_LABEL,
  type Prose,
  type ProseSource,
  type TaskBriefing,
} from "@/lib/fault-lines/briefing";
import { TIERS } from "@/lib/fault-lines/severity";
import { teamColor } from "@/lib/fault-lines/teams";
import type { NarrativeFile } from "@/lib/fault-lines/types";
import { cn } from "@/lib/utils";

interface RiskBriefingCardProps {
  narrative: NarrativeFile;
  /** The briefing for the selected task, or null to show the program view. */
  taskBriefing: TaskBriefing | null;
  /** Ids present in the graph, so we only link risks we can actually select. */
  knownTaskIds: Set<string>;
  selectedId: string | null;
  onSelectTask: (id: string | null) => void;
}

/**
 * Two views in one card. With nothing selected it is the program briefing
 * from narrative.json: headline, top risks, cascade summary. Select any task —
 * in the graph, on the board, or from a risk below — and it becomes that
 * task's briefing, so every issue gets one, not just the three the narrative
 * singled out.
 */
export function RiskBriefingCard({
  narrative,
  taskBriefing,
  knownTaskIds,
  selectedId,
  onSelectTask,
}: RiskBriefingCardProps) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-5 pb-3">
        <CardTitle className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
          {taskBriefing ? "Task briefing" : "Risk briefing"}
        </CardTitle>
        {taskBriefing && (
          <button
            type="button"
            onClick={() => onSelectTask(null)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-1 inline-flex items-center gap-1 rounded-sm text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="size-3" />
            Program briefing
          </button>
        )}
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {taskBriefing ? (
          <TaskView briefing={taskBriefing} />
        ) : (
          <ProgramView
            narrative={narrative}
            knownTaskIds={knownTaskIds}
            selectedId={selectedId}
            onSelectTask={onSelectTask}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SourceTag({ source }: { source: ProseSource }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        source === "claude" ? "text-foreground/70" : "text-muted-foreground",
      )}
    >
      {source === "claude" && <Sparkles aria-hidden className="size-2.5" />}
      {SOURCE_LABEL[source]}
    </span>
  );
}

function ProseBlock({ label, prose }: { label: string; prose: Prose }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">{label}</p>
        <SourceTag source={prose.source} />
      </div>
      <p className="text-sm leading-relaxed">{prose.text}</p>
    </div>
  );
}

function TaskView({ briefing }: { briefing: TaskBriefing }) {
  const { task, tier, done, slack, onCriticalPath, blastRadius } = briefing;
  const tierMeta = TIERS.find((t) => t.id === tier);
  const others = briefing.downstreamTeams.filter((t) => t !== task.team);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: teamColor(task.team) }}
          />
          <h3 className="font-display text-base leading-snug">{task.name}</h3>
        </div>
        <p className="text-muted-foreground mt-1.5 ml-4.5 text-xs">
          <span className="font-mono">{task.id}</span> · POC{" "}
          <span className="text-foreground">{task.owner}</span> ·{" "}
          {tierMeta ? (
            <span
              className={cn(
                tier === "escalate" && "text-risk font-medium",
                tier === "act" && "text-foreground",
              )}
            >
              {tierMeta.label}
            </span>
          ) : done ? (
            "Complete"
          ) : (
            "Not flagged"
          )}
        </p>
      </div>

      <ProseBlock label="Why it matters" prose={briefing.whyItMatters} />

      {others.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[11px]">
            {done ? "Built on by" : "Waiting on it"} · {blastRadius}{" "}
            {blastRadius === 1 ? "task" : "tasks"}
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {others.map((team) => (
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

      {!done && briefing.projections.length > 0 && (
        <div className="space-y-1.5 border-t pt-4">
          <p className="text-muted-foreground text-[11px]">
            If it slips —{" "}
            {onCriticalPath
              ? "on the critical path, so the end date moves one-for-one"
              : `absorbs ${slack} ${slack === 1 ? "day" : "days"}, then the end date moves`}
          </p>
          <table className="w-full text-xs">
            <tbody>
              {briefing.projections.map((p) => (
                <tr key={p.delay} className="border-b border-dashed last:border-0">
                  <td className="tabular text-muted-foreground py-1.5 pr-3">
                    +{p.delay}d
                  </td>
                  <td className="tabular py-1.5">
                    {p.slip > 0 ? (
                      <span className="text-risk font-medium">
                        end date +{p.slip}d → day {p.newLength}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        absorbed · holds at day {p.newLength}
                      </span>
                    )}
                  </td>
                  <td className="tabular text-muted-foreground py-1.5 text-right">
                    {p.affected} {p.affected === 1 ? "task" : "tasks"} move
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t pt-4">
        <ProseBlock label="Recommended action" prose={briefing.action} />
      </div>
    </div>
  );
}

function ProgramView({
  narrative,
  knownTaskIds,
  selectedId,
  onSelectTask,
}: Omit<RiskBriefingCardProps, "taskBriefing">) {
  const source = narrativeSource(narrative);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="border-risk border-l-2 pl-3 text-sm leading-relaxed text-balance">
          {narrative.headline}
        </p>
        <div className="pl-3">
          <SourceTag source={source} />
        </div>
      </div>

      <ol className="divide-y border-t">
        {narrative.risks.map((risk) => {
          const linkable = knownTaskIds.has(risk.task_id);
          const isSelected = selectedId === risk.task_id;
          return (
            <li key={risk.task_id} className="py-4 first:pt-4 last:pb-0">
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: teamColor(risk.team) }}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    {linkable ? (
                      <button
                        type="button"
                        onClick={() => onSelectTask(risk.task_id)}
                        aria-current={isSelected ? "true" : undefined}
                        className="hover:decoration-foreground/40 focus-visible:ring-ring rounded-sm text-left text-sm font-medium underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {risk.task_name}
                      </button>
                    ) : (
                      <span className="text-sm font-medium">
                        {risk.task_name}
                      </span>
                    )}
                    <p className="text-muted-foreground font-mono mt-0.5 text-[10px]">
                      {risk.task_id} · {risk.team}
                    </p>
                  </div>

                  <p className="text-sm leading-relaxed">
                    {risk.why_it_matters}
                  </p>

                  <p className="text-muted-foreground text-xs leading-relaxed">
                    <span className="text-foreground font-medium">
                      Do this:
                    </span>{" "}
                    {risk.mitigation}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground border-t pt-4 text-xs leading-relaxed">
        {narrative.cascade_summary}
      </p>

      <p className="text-muted-foreground text-[11px]">
        Select any task in the graph for its own briefing.
      </p>
    </div>
  );
}
