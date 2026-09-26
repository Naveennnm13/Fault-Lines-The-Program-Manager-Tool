/**
 * Report generation.
 *
 * Turns the pipeline output into a structured document a lead can edit and
 * send to a team. Every number in here comes from analyze.py or from the
 * cascade port. Every sentence taken from narrative.json is tagged with where
 * it came from — "claude" only when narrative.py actually ran live, "sample"
 * when it ran without a key — so the reader knows which lines a model wrote.
 *
 * The document is a data structure rather than a Markdown string so that
 * editing and export stay in sync: the textareas bind to `block.text`, and
 * `toMarkdown` serialises whatever state the user has edited it into.
 */
import { computedAction, narrativeSource, type ProseSource } from "./briefing";
import { buildCascadeContext, descendantsOf, simulateDelay } from "./cascade";
import { buildRiskItems } from "./severity";
import type { ProgramData } from "./types";

export type BlockSource = ProseSource;

export interface ReportBlock {
  id: string;
  kind: "paragraph" | "bullet";
  text: string;
  source: BlockSource;
}

export interface ReportSection {
  id: string;
  heading: string;
  blocks: ReportBlock[];
}

export interface ReportDoc {
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

/** `null` scope means the whole program rather than a single team. */
export type ReportScope = string | null;

const PROJECTIONS = [3, 5, 10];

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function generateReport(
  data: ProgramData,
  scope: ReportScope,
): ReportDoc {
  const { tasks, analysis, narrative, program } = data;
  const items = buildRiskItems(tasks, analysis);
  const ctx = buildCascadeContext(tasks, analysis.cpm);

  const scoped = scope ? items.filter((i) => i.task.team === scope) : items;
  const owned = scope ? tasks.filter((t) => t.team === scope) : tasks;
  const audience = scope ?? program.name;

  // Blocks are keyed by a stable id so React keeps caret position in the
  // textareas while the user edits.
  let seq = 0;
  const para = (text: string, source: BlockSource = "computed"): ReportBlock => ({
    id: `b${seq++}`,
    kind: "paragraph",
    text,
    source,
  });
  const bullet = (text: string, source: BlockSource = "computed"): ReportBlock => ({
    id: `b${seq++}`,
    kind: "bullet",
    text,
    source,
  });

  const sections: ReportSection[] = [];

  // --- Bottom line ---------------------------------------------------------
  const top = scoped[0];
  const bottomLine: ReportBlock[] = [];

  if (!top) {
    bottomLine.push(
      para(
        `Nothing owned by ${audience} is currently flagged. No task in this scope is blocked, behind pace, or sitting on the critical path without float.`,
      ),
    );
  } else if (scope) {
    const worst = simulateDelay(ctx, top.task.id, 3);
    // Only call it an "exposure" when something is actually wrong; otherwise
    // the lead reads an alarming sentence about a task that is on track.
    const lead =
      top.tier === "watch"
        ? `Nothing ${audience} owns is flagged for escalation. The item carrying the most weight is ${top.task.name} (${top.task.id}), owned by ${top.task.owner}: ${top.summary}.`
        : `${audience}'s biggest exposure is ${top.task.name} (${top.task.id}), owned by ${top.task.owner}. ${top.summary}.`;
    bottomLine.push(
      para(
        `${lead} ` +
          (worst.programSlip > 0
            ? `If it slips three days, the program end date moves from day ${worst.oldProgramLength} to day ${worst.newProgramLength} — this is not absorbed anywhere.`
            : `A three-day slip is still absorbed by float today, but that margin is what is protecting the end date.`),
      ),
    );
    const escalate = scoped.filter((i) => i.tier === "escalate").length;
    const act = scoped.filter((i) => i.tier === "act").length;
    bottomLine.push(
      para(
        `${audience} owns ${plural(owned.length, "task")} in this program. ` +
          (escalate > 0
            ? `${plural(escalate, "needs", "need")} escalation now`
            : `None need escalation today`) +
          (act > 0
            ? `, and ${plural(act, "more needs", "more need")} action this week.`
            : `, and nothing else is on zero float.`),
      ),
    );
  } else {
    bottomLine.push(para(narrative.headline, narrativeSource(narrative)));
    bottomLine.push(para(narrative.cascade_summary, narrativeSource(narrative)));
  }

  sections.push({ id: "bottom-line", heading: "Bottom line", blocks: bottomLine });

  // --- Standing ------------------------------------------------------------
  const standing: ReportBlock[] = [];
  if (scope) {
    const load = analysis.team_bottleneck_load[scope];
    standing.push(
      bullet(`Tasks owned: ${owned.length} of ${tasks.length} in the program.`),
    );
    const onCritical = load?.critical_path_tasks ?? 0;
    standing.push(
      bullet(
        onCritical > 0
          ? `On the critical path: ${onCritical}. These have zero float by definition — any slip moves the end date.`
          : `On the critical path: none. Nothing this team owns moves the end date on its own.`,
      ),
    );
    standing.push(
      bullet(`Flagged at risk: ${load?.at_risk_tasks ?? 0}.`),
    );
    standing.push(
      bullet(
        `Total downstream reach: ${load?.total_blast_radius ?? 0} task-dependencies hang off work this team owns.`,
      ),
    );
    const blockedTeams = new Set<string>();
    for (const item of scoped) {
      for (const team of item.downstreamTeams) {
        if (team !== scope) blockedTeams.add(team);
      }
    }
    if (blockedTeams.size) {
      standing.push(
        bullet(
          `Teams waiting on this one: ${[...blockedTeams].sort().join(", ")}.`,
        ),
      );
    }
  } else {
    standing.push(
      bullet(
        `Program length: ${analysis.cpm.program_length_days} days from ${program.start_date}, with ${plural(analysis.cpm.critical_path.length, "task")} on the critical path.`,
      ),
    );
    for (const [team, load] of Object.entries(analysis.team_bottleneck_load).sort(
      ([, a], [, b]) => b.total_blast_radius - a.total_blast_radius,
    )) {
      standing.push(
        bullet(
          `${team}: ${load.critical_path_tasks} critical-path ${load.critical_path_tasks === 1 ? "task" : "tasks"}, ${load.at_risk_tasks} at risk, ${load.total_blast_radius} downstream reach.`,
        ),
      );
    }
  }
  sections.push({
    id: "standing",
    heading: scope ? `Where ${audience} sits` : "Where the program sits",
    blocks: standing,
  });

  // --- Pain points ---------------------------------------------------------
  const painPoints = scoped
    .filter((i) => i.tier !== "watch")
    .slice(0, scope ? 5 : 6);

  if (painPoints.length) {
    sections.push({
      id: "pain-points",
      heading: "Pain points",
      blocks: painPoints.map((item) => {
        const others = item.downstreamTeams
          .filter((t) => t !== item.task.team)
          .sort();
        return para(
          `${item.task.id} — ${item.task.name} (${item.task.owner}, ${item.task.team}). ${item.reasons.join(" ")}` +
            (others.length
              ? ` The teams waiting on it are ${others.join(", ")}.`
              : ""),
        );
      }),
    });
  }

  // --- If these slip -------------------------------------------------------
  if (top) {
    const projections: ReportBlock[] = [
      para(
        `These figures come from replaying the dependency graph with ${top.task.id} pushed out, using the same earliest-finish values the critical-path analysis produced.`,
      ),
    ];

    for (const delayDays of PROJECTIONS) {
      const result = simulateDelay(ctx, top.task.id, delayDays);
      const teams = Object.entries(result.affectedTeams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([team, shift]) => `${team} +${shift}d`)
        .join(", ");

      projections.push(
        bullet(
          result.programSlip > 0
            ? `${top.task.id} slips ${plural(delayDays, "day")} → program end moves to day ${result.newProgramLength}, a ${result.programSlip}-day hit. ${plural(result.affectedTasks.length, "task")} shift: ${teams}.`
            : `${top.task.id} slips ${plural(delayDays, "day")} → absorbed by float, end date holds at day ${result.newProgramLength}. ${plural(result.affectedTasks.length, "task")} still move internally: ${teams}.`,
        ),
      );
    }

    // The breaking point is exact from the CPM output: a task absorbs its
    // total float, and each day beyond that moves the end date by one. Reading
    // it off the sampled 3/5/10 projections would overstate it — a task with
    // one day of float would appear to break at three.
    projections.push(
      para(
        top.slack === 0
          ? `In short: ${top.task.id} has no room. Every day of slip moves the end date by a day.`
          : `In short: ${top.task.id} can absorb ${plural(top.slack, "day")} of slip. From day ${top.slack + 1}, the end date moves one-for-one.`,
      ),
    );

    sections.push({
      id: "projections",
      heading: "What happens if delays persist",
      blocks: projections,
    });
  }

  // --- Action points -------------------------------------------------------
  const actions: ReportBlock[] = [];
  const narrated = narrativeSource(narrative);
  const seen = new Set<string>();

  for (const item of scoped.slice(0, 6)) {
    if (item.tier === "watch" && actions.length >= 3) break;
    if (seen.has(item.task.id)) continue;
    seen.add(item.task.id);

    // Same precedence as the briefing card: per-task prose, then top-risk
    // prose, then the computed action — so the card and the report agree.
    const fromNarrative =
      narrative.task_briefings?.[item.task.id] ??
      narrative.risks.find((r) => r.task_id === item.task.id);
    if (fromNarrative) {
      actions.push(
        bullet(`${item.task.id} — ${fromNarrative.mitigation}`, narrated),
      );
      continue;
    }

    actions.push(
      bullet(
        `${item.task.id} — ${item.task.name}: ${computedAction({
          task: item.task,
          slack: item.slack,
          downstreamCount: item.downstream.length,
          onCriticalPath: item.score.on_critical_path,
        })}`,
      ),
    );
  }

  if (!actions.length) {
    actions.push(bullet("No action required from this team this week."));
  }

  sections.push({ id: "actions", heading: "Action points", blocks: actions });

  // --- Provenance ----------------------------------------------------------
  sections.push({
    id: "provenance",
    heading: "How this was produced",
    blocks: [
      para(
        `Critical path, slack and blast radius were computed by analyze.py over the ${tasks.length}-task dependency graph. Delay projections were recomputed from the same earliest-finish baseline. ` +
          (narrative.mode === "live"
            ? `Lines marked as model-written were generated by ${narrative.model ?? "Claude"} from the analysis output; everything else is derived directly from the numbers.`
            : `The narrative lines are hand-written sample text standing in for Claude's output, because this briefing was generated without an API key; everything else is derived directly from the numbers.`),
      ),
    ],
  });

  const scopedDownstream = scope
    ? new Set(scoped.flatMap((i) => descendantsOf(tasks, i.task.id)))
    : null;

  return {
    title: scope
      ? `${scope} — program risk briefing`
      : `${program.name} — program risk briefing`,
    subtitle: scope
      ? `${program.name} · ${plural(owned.length, "task")} owned · ${scopedDownstream?.size ?? 0} downstream tasks depend on them · baseline day ${analysis.cpm.program_length_days}`
      : `${plural(tasks.length, "task")} · ${plural(program.teams.length, "team")} · baseline day ${analysis.cpm.program_length_days} · starts ${program.start_date}`,
    sections,
  };
}

/** Serialises the document — including any edits — to Markdown. */
export function toMarkdown(doc: ReportDoc): string {
  const lines: string[] = [`# ${doc.title}`, "", `_${doc.subtitle}_`, ""];

  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, "");

    const blocks = section.blocks.filter((b) => b.text.trim());
    blocks.forEach((block, index) => {
      const text = block.text.trim();
      if (block.kind === "bullet") {
        lines.push(`- ${text}`);
        // Keep runs of bullets tight; a blank line between them makes
        // Markdown render a loose list with paragraph spacing.
        if (blocks[index + 1]?.kind !== "bullet") lines.push("");
      } else {
        lines.push(text, "");
      }
    });
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function reportFilename(scope: ReportScope): string {
  const who = (scope ?? "program").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `fault-lines-${who}-briefing.md`;
}
