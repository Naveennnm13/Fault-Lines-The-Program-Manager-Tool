"use client";

import { ArrowLeft } from "lucide-react";

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
 * Two views in one section. With nothing selected it is the program briefing
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
    <section
      id="risk-briefing"
      aria-labelledby="risk-briefing-heading"
      className="scroll-mt-4 space-y-4 py-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="risk-briefing-heading" className="text-sm">
          {taskBriefing ? `Briefing on ${taskBriefing.task.id}` : "Risk briefing"}
        </h2>
        {taskBriefing && (
          <button
            type="button"
            onClick={() => onSelectTask(null)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-2 inline-flex min-h-8 items-center gap-1 rounded-sm text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="size-3" />
            Program briefing
          </button>
        )}
      </div>

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
    </section>
  );
}

/** Provenance, stated plainly. Only live output is attributed to Claude. */
function SourceNote({ source }: { source: ProseSource }) {
  return (
    <span
      className={cn(
        "text-[11px]",
        source === "claude" ? "text-foreground/70" : "text-muted-foreground",
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function ProseBlock({ label, prose }: { label: string; prose: Prose }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-muted-foreground text-xs font-normal">{label}</h3>
        <SourceNote source={prose.source} />
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
      {/* The name, owner and status are in the section above; this line
          adds only what that one doesn't say: where it sits on the board. */}
      <p className="text-xs">
        <span
          className={cn(
            tier === "escalate" && "text-risk font-medium",
            tier === "act" && "text-foreground font-medium",
            !tier && "text-muted-foreground",
          )}
        >
          {tierMeta ? tierMeta.label : done ? "Complete" : "Not on the risk board"}
        </span>
        {tierMeta && (
          <span className="text-muted-foreground"> · {tierMeta.blurb.toLowerCase()}</span>
        )}
      </p>

      <ProseBlock label="Why it matters" prose={briefing.whyItMatters} />

      {others.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-normal">
            {done ? "Built on by" : "Waiting on it"} ·{" "}
            <span className="tabular">{blastRadius}</span>{" "}
            {blastRadius === 1 ? "task" : "tasks"}
          </h3>
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
          <h3 className="text-muted-foreground text-xs font-normal">
            If it slips —{" "}
            {onCriticalPath
              ? "no float, so the end date moves day for day"
              : `it absorbs ${slack} ${slack === 1 ? "day" : "days"}, then the end date moves`}
          </h3>
          <table className="w-full text-xs">
            <caption className="sr-only">
              Projected effect of delaying {task.id}
            </caption>
            <tbody>
              {briefing.projections.map((p) => (
                <tr key={p.delay} className="border-b border-dashed last:border-0">
                  <th
                    scope="row"
                    className="tabular text-muted-foreground py-1.5 pr-3 text-left font-normal"
                  >
                    +{p.delay} days
                  </th>
                  <td className="tabular py-1.5">
                    {p.slip > 0 ? (
                      <span className="text-risk">
                        end date +{p.slip} → day {p.newLength}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        absorbed, holds at day {p.newLength}
                      </span>
                    )}
                  </td>
                  <td className="tabular text-muted-foreground py-1.5 text-right">
                    {p.affected} {p.affected === 1 ? "task moves" : "tasks move"}
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
      <div className="space-y-1.5">
        <p className="text-[15px] leading-relaxed font-medium text-balance">
          {narrative.headline}
        </p>
        <SourceNote source={source} />
      </div>

      <ol className="divide-y border-t">
        {narrative.risks.map((risk) => {
          const linkable = knownTaskIds.has(risk.task_id);
          const isSelected = selectedId === risk.task_id;
          return (
            <li key={risk.task_id} className="py-4 last:pb-0">
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
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      <span className="font-mono">{risk.task_id}</span> ·{" "}
                      {risk.team}
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

      <p className="text-muted-foreground text-xs">
        Select any task in the graph for a briefing on that task alone.
      </p>
    </div>
  );
}
