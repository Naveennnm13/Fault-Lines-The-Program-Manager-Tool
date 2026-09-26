"use client";

import { STATUS_LABEL, teamColor } from "@/lib/fault-lines/teams";
import type { BottleneckScore, Task } from "@/lib/fault-lines/types";
import { cn } from "@/lib/utils";

interface TaskDetailCardProps {
  task: Task | null;
  score: BottleneckScore | null;
  onCriticalPath: boolean;
  slack: number | null;
  dependents: Task[];
  onSelectTask: (id: string) => void;
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "risk" | "critical";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none",
        tone === "risk" && "border-risk/40 text-risk",
        tone === "critical" && "border-foreground/30 text-foreground",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** The selected task's facts. Its name is the section heading. */
export function TaskDetailCard({
  task,
  score,
  onCriticalPath,
  slack,
  dependents,
  onSelectTask,
}: TaskDetailCardProps) {
  if (!task) {
    return (
      <section aria-labelledby="selected-task-heading" className="py-5">
        <h2 id="selected-task-heading" className="text-sm">
          No task selected
        </h2>
        <p className="text-muted-foreground mt-1 text-sm text-balance">
          Select a task in the graph to see its owner, what depends on it, and
          how much delay it can absorb.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="selected-task-heading" className="space-y-4 py-5">
      <div>
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: teamColor(task.team) }}
          />
          <h2
            id="selected-task-heading"
            className="text-base leading-snug tracking-tight"
          >
            {task.name}
          </h2>
        </div>
        <p className="text-muted-foreground mt-1 ml-4.5 text-xs">
          <span className="font-mono">{task.id}</span> · {task.team} ·{" "}
          {task.owner} · <span className="tabular">{task.duration}</span> days
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {onCriticalPath && <Tag tone="critical">Critical path</Tag>}
        {score?.at_risk && task.status !== "blocked" && (
          <Tag tone="risk">At risk</Tag>
        )}
        <Tag tone={task.status === "blocked" ? "risk" : "neutral"}>
          {STATUS_LABEL[task.status] ?? task.status}
        </Tag>
        <Tag>
          <span className="tabular">{task.pct}%</span>&nbsp;complete
        </Tag>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Blast radius</dt>
          <dd className="mt-0.5">
            <span className="tabular">{score?.blast_radius ?? 0}</span>{" "}
            <span className="text-muted-foreground text-xs">
              downstream {score?.blast_radius === 1 ? "task" : "tasks"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Spare time</dt>
          <dd className="mt-0.5">
            {slack === null ? (
              <span className="text-muted-foreground">Unknown</span>
            ) : slack === 0 ? (
              <span className="text-risk">None</span>
            ) : (
              <>
                <span className="tabular">{slack}</span>{" "}
                <span className="text-muted-foreground text-xs">
                  {slack === 1 ? "day" : "days"}
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <div>
        <p className="text-muted-foreground mb-2 text-xs">
          {dependents.length > 0
            ? `Directly unblocks ${dependents.length} ${dependents.length === 1 ? "task" : "tasks"}`
            : "Nothing depends on this directly."}
        </p>
        {dependents.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {dependents.map((dep) => (
              <li key={dep.id}>
                <button
                  type="button"
                  onClick={() => onSelectTask(dep.id)}
                  title={dep.name}
                  className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex min-h-7 items-center gap-1.5 rounded border px-2 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none max-lg:min-h-9"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: teamColor(dep.team) }}
                  />
                  <span className="font-mono">{dep.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
