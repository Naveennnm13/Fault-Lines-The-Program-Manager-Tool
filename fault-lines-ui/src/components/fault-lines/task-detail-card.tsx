"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        "font-mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase",
        tone === "risk" && "border-risk/50 text-risk",
        tone === "critical" && "border-foreground/40 text-foreground font-medium",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function TaskDetailCard({
  task,
  score,
  onCriticalPath,
  slack,
  dependents,
  onSelectTask,
}: TaskDetailCardProps) {
  return (
    <Card className="shadow-none">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-muted-foreground font-mono text-xs font-medium tracking-wide uppercase">
          Selected task
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {!task ? (
          <p className="text-muted-foreground text-sm text-balance">
            Click a node in the graph to inspect its owner, blast radius and
            direct dependents.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: teamColor(task.team) }}
                />
                <h3 className="font-display text-base leading-snug">
                  {task.name}
                </h3>
              </div>
              <p className="text-muted-foreground font-mono mt-1.5 ml-4.5 text-xs">
                {task.id} · {task.team} · {task.owner} · {task.duration}d
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {onCriticalPath && <Tag tone="critical">Critical path</Tag>}
              {score?.at_risk && <Tag tone="risk">At risk</Tag>}
              <Tag tone={task.status === "blocked" ? "risk" : "neutral"}>
                {STATUS_LABEL[task.status] ?? task.status}
              </Tag>
              <Tag>{task.pct}% complete</Tag>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Blast radius</dt>
                <dd className="tabular mt-0.5">
                  {score?.blast_radius ?? 0}{" "}
                  <span className="text-muted-foreground text-xs">
                    downstream {score?.blast_radius === 1 ? "task" : "tasks"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Slack</dt>
                <dd className="tabular mt-0.5">
                  {slack === null ? (
                    "—"
                  ) : slack === 0 ? (
                    <span className="text-risk">0 days</span>
                  ) : (
                    <>
                      {slack}{" "}
                      <span className="text-muted-foreground text-xs">
                        {slack === 1 ? "day" : "days"} of float
                      </span>
                    </>
                  )}
                </dd>
              </div>
            </dl>

            <div className="border-t pt-4">
              <p className="text-muted-foreground mb-2 text-xs">
                {dependents.length > 0
                  ? `Directly unblocks ${dependents.length} ${dependents.length === 1 ? "task" : "tasks"}`
                  : "No direct dependents — nothing waits on this."}
              </p>
              {dependents.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {dependents.map((dep) => (
                    <li key={dep.id}>
                      <button
                        type="button"
                        onClick={() => onSelectTask(dep.id)}
                        title={dep.name}
                        className="font-mono hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring rounded border px-1.5 py-0.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
                          style={{ backgroundColor: teamColor(dep.team) }}
                        />
                        {dep.id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
