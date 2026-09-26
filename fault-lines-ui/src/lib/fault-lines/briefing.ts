/**
 * Per-task briefing: what the Risk briefing card shows when a task is selected.
 *
 * Every task gets one, not just the three the narrative singles out. The facts
 * (slack, reach, projections) are always computed from the analysis. The prose
 * comes from narrative.json when it has something for this task, and falls
 * back to computed text when it doesn't — and each piece records which of
 * those it is, so the UI never labels computed or stand-in text as Claude's.
 */
import {
  descendantsOf,
  simulateDelay,
  type CascadeContext,
} from "./cascade";
import { describeRisk, type RiskItem, type SeverityTier } from "./severity";
import type { NarrativeFile, ProgramData, Task } from "./types";

/**
 * - claude:   narrative.py ran live; Claude wrote it.
 * - sample:   narrative.py ran without an API key; hand-written stand-in.
 * - computed: derived directly from the analysis numbers here.
 */
export type ProseSource = "claude" | "sample" | "computed";

export function narrativeSource(narrative: NarrativeFile): "claude" | "sample" {
  return narrative.mode === "live" ? "claude" : "sample";
}

export const SOURCE_LABEL: Record<ProseSource, string> = {
  claude: "Written by Claude",
  sample: "Sample text (no API key)",
  computed: "Computed from the analysis",
};

export interface Prose {
  text: string;
  source: ProseSource;
}

export interface TaskBriefing {
  task: Task;
  /** Board lane, or null when the task isn't on the board. */
  tier: SeverityTier | null;
  done: boolean;
  slack: number;
  onCriticalPath: boolean;
  blastRadius: number;
  downstreamTeams: string[];
  reasons: string[];
  whyItMatters: Prose;
  action: Prose;
  /** Delay at which the end date starts moving: total float + 1. */
  breakingPoint: number | null;
  projections: {
    delay: number;
    slip: number;
    newLength: number;
    affected: number;
  }[];
}

const PROJECTIONS = [3, 5, 10];

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The fallback recommended action, keyed off why the task was flagged. Shared
 * with the report generator so the card and the shippable briefing say the
 * same thing about the same task.
 */
export function computedAction(args: {
  task: Task;
  slack: number;
  downstreamCount: number;
  onCriticalPath: boolean;
}): string {
  const { task, slack, downstreamCount, onCriticalPath } = args;

  if (task.status === "done") {
    return downstreamCount > 0
      ? `Done. ${plural(downstreamCount, "task")} build on it, so handle any change to ${task.id} as a change request.`
      : `Done. Nothing more to do here.`;
  }
  if (task.status === "blocked") {
    return slack === 0
      ? `Find out what's blocking it and escalate this week. There are no spare days, so every day it waits moves the end date.`
      : `Find out what's blocking it and agree a date with ${task.owner}. There are ${plural(slack, "day")} to spare, so it can wait a little, but not indefinitely.`;
  }
  if (task.status === "in_progress" && task.pct < 50) {
    return slack === 0
      ? `Talk to ${task.owner} this week about adding help or cutting scope. There are no spare days to absorb a slip.`
      : `Talk to ${task.owner} about adding help or cutting scope while there are still ${plural(slack, "day")} to spare.`;
  }
  if (onCriticalPath) {
    return `Check that ${task.owner} has everything needed to start on time. A late start can't be made up later.`;
  }
  if (downstreamCount > 0) {
    return `Check in at the next stand-up. ${plural(downstreamCount, "task")} ${downstreamCount === 1 ? "depends" : "depend"} on it, with ${plural(slack, "day")} to spare.`;
  }
  return `No action needed. Nothing depends on it, and it has ${plural(slack, "day")} to spare.`;
}

export function buildTaskBriefing(
  data: ProgramData,
  ctx: CascadeContext,
  riskItems: RiskItem[],
  taskId: string,
): TaskBriefing | null {
  const { tasks, analysis, narrative } = data;
  const task = tasks.find((t) => t.id === taskId);
  const score = analysis.bottleneck_scores.find((s) => s.id === taskId);
  if (!task || !score) return null;

  const slack = analysis.cpm.slack[taskId] ?? 0;
  const done = task.status === "done";
  const onCriticalPath = score.on_critical_path;
  const downstream = descendantsOf(tasks, taskId);
  const teamOf = new Map(tasks.map((t) => [t.id, t.team]));
  const downstreamTeams = [
    ...new Set(downstream.map((id) => teamOf.get(id)).filter(Boolean)),
  ].sort() as string[];

  const { reasons } = describeRisk(score, slack, downstreamTeams.length);

  // Prose from the narrative, if it covers this task. The top-risk entries and
  // the per-task entries use the same shape; per-task wins if both exist.
  const fromNarrative =
    narrative.task_briefings?.[taskId] ??
    narrative.risks.find((r) => r.task_id === taskId);
  const narrated = narrativeSource(narrative);

  const whyItMatters: Prose = fromNarrative
    ? { text: fromNarrative.why_it_matters, source: narrated }
    : {
        text: done
          ? `Complete${downstream.length ? `, and ${plural(downstream.length, "task")} across ${plural(downstreamTeams.length, "team")} built on it` : ""}.`
          : reasons.join(" ") || "Not currently flagged by the analysis.",
        source: "computed",
      };

  const action: Prose = fromNarrative
    ? { text: fromNarrative.mitigation, source: narrated }
    : {
        text: computedAction({
          task,
          slack,
          downstreamCount: downstream.length,
          onCriticalPath,
        }),
        source: "computed",
      };

  // Finished work can't be delayed, so it has no projections.
  const projections = done
    ? []
    : PROJECTIONS.map((delay) => {
        const r = simulateDelay(ctx, taskId, delay);
        return {
          delay,
          slip: r.programSlip,
          newLength: r.newProgramLength,
          affected: r.affectedTasks.length,
        };
      });

  return {
    task,
    tier: riskItems.find((i) => i.task.id === taskId)?.tier ?? null,
    done,
    slack,
    onCriticalPath,
    blastRadius: downstream.length,
    downstreamTeams,
    reasons,
    whyItMatters,
    action,
    breakingPoint: done ? null : slack + 1,
    projections,
  };
}
