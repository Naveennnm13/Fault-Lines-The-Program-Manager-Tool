/**
 * Triage tiers for the risk board.
 *
 * analyze.py ranks every task by a bottleneck score, but a ranked list of 35
 * rows is not a board. These rules turn that ranking into three lanes a lead
 * can act on, using only values the pipeline already produced: the bottleneck
 * score's inputs (blast radius, at-risk flag, critical-path membership) plus
 * slack from the CPM pass.
 *
 * Nothing here re-derives analysis — it classifies it.
 */
import { descendantsOf } from "./cascade";
import type { AnalysisFile, BottleneckScore, Task } from "./types";

export type SeverityTier = "escalate" | "act" | "watch";

export const TIERS: {
  id: SeverityTier;
  label: string;
  blurb: string;
}[] = [
  // Blurbs must hold for every task a lane can contain. Escalate includes
  // off-critical-path tasks with float (it also admits large reach), and Act
  // includes at-risk tasks that have plenty of float.
  {
    id: "escalate",
    label: "Escalate now",
    blurb: "Slipping, and either on the critical path or holding up a lot of work.",
  },
  {
    id: "act",
    label: "Act this week",
    blurb: "Slipping, or on the critical path with no spare days.",
  },
  {
    id: "watch",
    label: "Watch",
    blurb: "A lot depends on these, or they have little spare time. Nothing is wrong yet.",
  },
];

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export interface RiskItem {
  task: Task;
  score: BottleneckScore;
  tier: SeverityTier;
  slack: number;
  /** One line stating the problem, for the collapsed card. */
  summary: string;
  /** Why this landed in this lane. Shown when the card is expanded. */
  reasons: string[];
  /** Every task transitively downstream, and the teams they belong to. */
  downstream: string[];
  downstreamTeams: string[];
}

function classify(
  score: BottleneckScore,
  slack: number,
): SeverityTier | null {
  // Finished work cannot be a bottleneck, however much hangs off it. T01 is
  // the root of the whole DAG and scores second overall, but it is done —
  // putting it on a triage board would be noise at the top of the list.
  if (score.status === "done") return null;

  if (score.at_risk && (score.on_critical_path || score.blast_radius >= 10)) {
    return "escalate";
  }
  if (score.at_risk || (slack === 0 && score.blast_radius >= 1)) {
    return "act";
  }
  if (score.blast_radius >= 5 || slack <= 2) {
    return "watch";
  }
  // Plenty of float and nothing meaningful behind it.
  return null;
}

/** Summary line and reasons for any task — used by the board and the briefing card. */
export function describeRisk(
  score: BottleneckScore,
  slack: number,
  teamCount: number,
): { summary: string; reasons: string[] } {
  const reasons: string[] = [];

  // The analysis flags "in progress and under 50% done". It has no clock, so
  // the copy says that, rather than claiming the task is behind schedule.
  if (score.status === "blocked") {
    reasons.push("Blocked. No work is moving on it.");
  }
  if (score.status === "in_progress" && score.pct < 50) {
    reasons.push(`In progress but only ${score.pct}% done.`);
  }
  if (score.on_critical_path) {
    reasons.push(
      "On the critical path, so every day it loses moves the end date by a day.",
    );
  }
  if (slack === 0 && !score.on_critical_path) {
    reasons.push("Has no spare days, so any slip moves the end date.");
  } else if (slack > 0) {
    reasons.push(
      `Can slip ${plural(slack, "day")} before the end date moves.`,
    );
  }
  if (score.blast_radius > 0) {
    reasons.push(
      `${plural(score.blast_radius, "task")} across ${plural(teamCount, "team")} ${score.blast_radius === 1 ? "depends" : "depend"} on it.`,
    );
  }

  const waiting = plural(score.blast_radius, "task");
  const depend = score.blast_radius === 1 ? "depends" : "depend";
  const summary =
    score.status === "blocked"
      ? `Blocked, with ${waiting} waiting on it`
      : score.status === "in_progress" && score.pct < 50
        ? `Only ${score.pct}% done, and ${waiting} ${depend} on it`
        : score.on_critical_path
          ? `On the critical path, and ${waiting} ${depend} on it`
          : `${waiting} ${depend} on it, with ${plural(slack, "day")} to spare`;

  return { summary, reasons };
}

/** Every task worth putting on the board, already sorted by score per tier. */
export function buildRiskItems(
  tasks: Task[],
  analysis: AnalysisFile,
): RiskItem[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const items: RiskItem[] = [];

  for (const score of analysis.bottleneck_scores) {
    const task = taskById.get(score.id);
    if (!task) continue;

    const slack = analysis.cpm.slack[score.id] ?? 0;
    const tier = classify(score, slack);
    if (!tier) continue;

    const downstream = descendantsOf(tasks, score.id);
    const downstreamTeams = [
      ...new Set(
        downstream.map((id) => taskById.get(id)?.team).filter(Boolean),
      ),
    ] as string[];

    items.push({
      task,
      score,
      tier,
      slack,
      downstream,
      downstreamTeams,
      ...describeRisk(score, slack, downstreamTeams.length),
    });
  }

  // bottleneck_scores arrives sorted by score descending; preserve that.
  return items;
}

export function groupByTier(items: RiskItem[]): Record<SeverityTier, RiskItem[]> {
  return {
    escalate: items.filter((i) => i.tier === "escalate"),
    act: items.filter((i) => i.tier === "act"),
    watch: items.filter((i) => i.tier === "watch"),
  };
}
