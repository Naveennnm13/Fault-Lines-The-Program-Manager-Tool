"use client";

import { Slider } from "@/components/ui/slider";
import type { CascadeResult } from "@/lib/fault-lines/cascade";
import { teamColor } from "@/lib/fault-lines/teams";
import type { Task } from "@/lib/fault-lines/types";

interface DelaySimulatorCardProps {
  task: Task | null;
  delayDays: number;
  onDelayChange: (days: number) => void;
  result: CascadeResult | null;
  programLength: number;
}

const MAX_DELAY = 10;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function DelaySimulatorCard({
  task,
  delayDays,
  onDelayChange,
  result,
  programLength,
}: DelaySimulatorCardProps) {
  const teams = result
    ? Object.entries(result.affectedTeams).sort(
        ([a, da], [b, db]) => db - da || a.localeCompare(b),
      )
    : [];
  // The cascade's affected list always includes the delayed task itself.
  const downstreamShifted = result
    ? result.affectedTasks.filter((t) => t.id !== task?.id).length
    : 0;

  return (
    <section aria-labelledby="delay-simulator-heading" className="space-y-4 py-5">
      <h2 id="delay-simulator-heading" className="text-sm">
        Delay simulator
      </h2>
      <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              {task ? (
                <>
                  Slip{" "}
                  <span className="text-foreground font-medium">{task.id}</span>{" "}
                  by
                </>
              ) : (
                "Select a task to simulate a slip"
              )}
            </span>
            <span className="tabular text-sm font-medium">
              {task ? days(delayDays) : "—"}
            </span>
          </div>

          <Slider
            min={0}
            max={MAX_DELAY}
            step={1}
            value={[delayDays]}
            disabled={!task}
            onValueChange={([value]) => onDelayChange(value)}
            aria-label={
              task
                ? `Delay ${task.name} by up to ${MAX_DELAY} days`
                : "Delay simulator, disabled until a task is selected"
            }
          />
          <div className="text-muted-foreground tabular flex justify-between text-[11px]">
            <span>0</span>
            <span>{MAX_DELAY} days</span>
          </div>
        </div>

        <div
          className="min-h-[5.5rem] border-t pt-4 text-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          {!task ? (
            <p className="text-muted-foreground text-balance">
              Select a task, then drag the slider to see how far a slip travels
              and which teams it lands on.
            </p>
          ) : !result || delayDays === 0 ? (
            <p className="text-muted-foreground">
              No delay applied. The program holds at day{" "}
              <span className="tabular text-foreground">{programLength}</span>.
            </p>
          ) : (
            <div className="space-y-3">
              {result.programSlip > 0 ? (
                <p className="leading-snug">
                  <span className="text-risk tabular text-xl font-semibold">
                    +{days(result.programSlip)}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    program end moves day{" "}
                    <span className="tabular">{result.oldProgramLength}</span> →{" "}
                    <span className="tabular text-foreground">
                      {result.newProgramLength}
                    </span>
                  </span>
                </p>
              ) : (
                <p className="leading-snug">
                  <span className="text-lg font-semibold">Absorbed by slack</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    program end holds at day{" "}
                    <span className="tabular">{result.newProgramLength}</span>
                  </span>
                </p>
              )}

              <p className="text-muted-foreground text-xs">
                {downstreamShifted === 0
                  ? `Only ${task.id} itself moves; nothing downstream shifts.`
                  : `${downstreamShifted} downstream ${downstreamShifted === 1 ? "task shifts" : "tasks shift"}, across ${teams.length} ${teams.length === 1 ? "team" : "teams"}:`}
              </p>

              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {teams.map(([team, shift]) => (
                  <li
                    key={team}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: teamColor(team) }}
                    />
                    {team}
                    <span className="tabular text-muted-foreground">
                      +{shift}d
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
    </section>
  );
}
