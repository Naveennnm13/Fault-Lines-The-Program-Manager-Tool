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
        `Nothing ${audience} owns is flagged right now. None of its tasks are blocked, stalled early, or holding up work on the critical path.`,
      ),
    );
  } else if (scope) {
    const worst = simulateDelay(ctx, top.task.id, 3);
    // Only call it a risk when something is actually wrong; otherwise the lead
    // reads an alarming sentence about a task that is on track.
    const lead =
      top.tier === "watch"
        ? `Nothing ${audience} owns needs escalating. The task with the most riding on it is ${top.task.name} (${top.task.id}), owned by ${top.task.owner}. ${top.summary}.`
        : `${audience}'s biggest risk is ${top.task.name} (${top.task.id}), owned by ${top.task.owner}. ${top.summary}.`;
    bottomLine.push(
      para(
        `${lead} ` +
          (worst.programSlip > 0
            ? `If it slips 3 days, the program's end date moves from day ${worst.oldProgramLength} to day ${worst.newProgramLength}.`
            : `It has ${plural(top.slack, "day")} to spare, so it can slip that long before the end date moves.`),
      ),
    );
    const escalate = scoped.filter((i) => i.tier === "escalate").length;
    const act = scoped.filter((i) => i.tier === "act").length;
    bottomLine.push(
      para(
        `${audience} owns ${plural(owned.length, "task")} in this program. ` +
          (escalate > 0
            ? `${plural(escalate, "needs", "need")} escalating now`
            : `None need escalating`) +
          (act > 0
            ? `, and ${plural(act, "more needs", "more need")} attention this week.`
            : `, and none need attention this week.`),
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
          ? `On the critical path: ${onCritical}. Any slip on these moves the end date.`
          : `On the critical path: none, so nothing this team owns moves the end date on its own.`,
      ),
    );
    standing.push(
      bullet(`Flagged at risk: ${load?.at_risk_tasks ?? 0}.`),
    );
    standing.push(
      bullet(
        `Downstream load: ${load?.total_blast_radius ?? 0}. That's how many tasks sit downstream of each of this team's tasks, added up.`,
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
          `${team}: ${load.critical_path_tasks} on the critical path, ${load.at_risk_tasks} at risk, downstream load ${load.total_blast_radius}.`,
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
          `${item.task.name} (${item.task.id}, owned by ${item.task.owner} in ${item.task.team}). ${item.reasons.join(" ")}` +
            (others.length
              ? ` Teams waiting on it: ${others.join(", ")}.`
              : ""),
        );
      }),
    });
  }

  // --- If these slip -------------------------------------------------------
  if (top) {
    const projections: ReportBlock[] = [
      para(
        `These numbers come from pushing ${top.task.id} back and recalculating every date that depends on it.`,
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
            ? `If ${top.task.id} slips ${plural(delayDays, "day")}, the end date moves to day ${result.newProgramLength}, ${plural(result.programSlip, "day")} late. ${plural(result.affectedTasks.length, "task")} shift: ${teams}.`
            : `If ${top.task.id} slips ${plural(delayDays, "day")}, the end date stays at day ${result.newProgramLength}. ${plural(result.affectedTasks.length, "task")} still shift: ${teams}.`,
        ),
      );
    }

    // The breaking point is exact from the CPM output: a task absorbs its
    // total float, and each day beyond that moves the end date by one. Reading
    // it off the sampled 3/5/10 projections would overstate it: a task with
    // one day of float would appear to break at three.
    projections.push(
      para(
        top.slack === 0
          ? `${top.task.id} has no spare days, so every day it slips moves the end date by a day.`
          : `${top.task.id} can slip ${plural(top.slack, "day")} without moving the end date. After that, every extra day moves it by a day.`,
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
        bullet(`${item.task.id}: ${fromNarrative.mitigation}`, narrated),
      );
      continue;
    }

    actions.push(
      bullet(
        `${item.task.name} (${item.task.id}): ${computedAction({
          task: item.task,
          slack: item.slack,
          downstreamCount: item.downstream.length,
          onCriticalPath: item.score.on_critical_path,
        })}`,
      ),
    );
  }

  if (!actions.length) {
    actions.push(bullet("Nothing needed from this team this week."));
  }

  sections.push({ id: "actions", heading: "Action points", blocks: actions });

  // --- Provenance ----------------------------------------------------------
  sections.push({
    id: "provenance",
    heading: "How this was produced",
    blocks: [
      para(
        `The critical path, spare days and downstream counts come from analyze.py, run over all ${tasks.length} tasks. The delay figures come from recalculating the schedule from the same starting point. ` +
          (narrative.mode === "live"
            ? `Lines marked "Claude" were written by ${narrative.model ?? "Claude"} from that analysis. Everything else comes straight from the numbers.`
            : `The lines marked "Sample" are hand-written stand-ins, because this briefing was made without an API key. Everything else comes straight from the numbers.`),
      ),
    ],
  });

  const scopedDownstream = scope
    ? new Set(scoped.flatMap((i) => descendantsOf(tasks, i.task.id)))
    : null;

  return {
    title: scope
      ? `Risk briefing for ${scope}`
      : `${program.name} risk briefing`,
    subtitle: scope
      ? `${program.name} · ${plural(owned.length, "task")} owned · ${scopedDownstream?.size ?? 0} downstream tasks depend on them · planned end day ${analysis.cpm.program_length_days}`
      : `${plural(tasks.length, "task")} · ${plural(program.teams.length, "team")} · planned end day ${analysis.cpm.program_length_days} · starts ${program.start_date}`,
    sections,
  };
}

/**
 * The tag shown after a line that came from the narrative rather than the
 * numbers. The provenance section tells the reader lines are marked, so every
 * export format has to carry the mark, not just the on-screen editor.
 */
export function sourceTag(source: BlockSource): string | null {
  if (source === "claude") return "Written by Claude";
  if (source === "sample") return "Sample text";
  return null;
}

/** Serialises the document, including any edits, to Markdown. */
export function toMarkdown(doc: ReportDoc): string {
  const lines: string[] = [`# ${doc.title}`, "", `_${doc.subtitle}_`, ""];

  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, "");

    const blocks = section.blocks.filter((b) => b.text.trim());
    blocks.forEach((block, index) => {
      const tag = sourceTag(block.source);
      const text = block.text.trim() + (tag ? ` _(${tag})_` : "");
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

export type ExportFormat = "md" | "docx" | "pdf";

export function reportFilename(
  programSlug: string,
  scope: ReportScope,
  format: ExportFormat,
): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const who = scope ? `-${slug(scope)}` : "";
  return `${slug(programSlug)}${who}-risk-briefing.${format}`;
}
