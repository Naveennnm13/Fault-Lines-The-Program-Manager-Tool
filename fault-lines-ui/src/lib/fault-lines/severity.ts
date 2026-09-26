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
    blurb: "Slipping, and on the critical path or holding up a large share of the work",
  },
  {
    id: "act",
    label: "Act this week",
    blurb: "Slipping, or on the critical path with no float to spare",
  },
  {
    id: "watch",
    label: "Watch",
    blurb: "Real downstream reach or thin float, but nothing is wrong yet",
  },
];

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

  if (score.status === "blocked") {
    reasons.push("Blocked right now — no work is moving on it.");
  }
  if (score.status === "in_progress" && score.pct < 50) {
    reasons.push(
      `${score.pct}% complete and behind pace for the time elapsed.`,
    );
  }
  if (score.on_critical_path) {
    reasons.push(
      "Sits on the critical path, so a day lost here is a day lost off the program end date.",
    );
  }
  if (slack === 0 && !score.on_critical_path) {
    reasons.push("Has zero float — it cannot absorb any slip.");
  } else if (slack > 0) {
    reasons.push(
      `Has ${slack} ${slack === 1 ? "day" : "days"} of float before it starts pushing the end date.`,
    );
  }
  if (score.blast_radius > 0) {
    reasons.push(
      `${score.blast_radius} ${score.blast_radius === 1 ? "task" : "tasks"} downstream across ${teamCount} ${teamCount === 1 ? "team" : "teams"}.`,
    );
  }

  const summary =
    score.status === "blocked"
      ? `Blocked with ${score.blast_radius} tasks waiting behind it`
      : score.status === "in_progress" && score.pct < 50
        ? `Behind pace at ${score.pct}%, ${score.blast_radius} tasks downstream`
        : score.on_critical_path
          ? `On the critical path with no float, ${score.blast_radius} tasks downstream`
          : `${score.blast_radius} tasks downstream, ${slack} ${slack === 1 ? "day" : "days"} of float`;

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
