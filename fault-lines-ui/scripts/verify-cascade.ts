/**
 * verify-cascade.ts — proves the TypeScript cascade agrees with Python.
 *
 * analyze.py writes `sample_delay_scenarios` into each program's
 * analysis.json: the program slip, affected tasks and per-team absorption it
 * computed for a handful of delays. This replays every one of those scenarios,
 * for every program, through the browser-side port in
 * src/lib/fault-lines/cascade.ts and diffs the results.
 *
 * Run: npm run verify:cascade
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCascadeContext,
  descendantsOf,
  simulateDelay,
} from "../src/lib/fault-lines/cascade.ts";
import type {
  AnalysisFile,
  ProgramIndex,
  TasksFile,
} from "../src/lib/fault-lines/types.ts";

const DATA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "programs",
);
const read = <T,>(...segments: string[]): T =>
  JSON.parse(readFileSync(join(DATA, ...segments), "utf8")) as T;

const index = read<ProgramIndex>("index.json");
const failures: string[] = [];
let scenarioCount = 0;

for (const { slug, name } of index.programs) {
  console.log(`\n${name}`);
  const { tasks } = read<TasksFile>(slug, "tasks.json");
  const analysis = read<AnalysisFile>(slug, "analysis.json");
  const ctx = buildCascadeContext(tasks, analysis.cpm);

  for (const expected of analysis.sample_delay_scenarios) {
    scenarioCount += 1;
    const label = `${slug} ${expected.task_id} +${expected.delay_days}d`;
    const actual = simulateDelay(ctx, expected.task_id, expected.delay_days);
    const before = failures.length;

    const check = (what: string, got: unknown, want: unknown) => {
      const a = JSON.stringify(got);
      const b = JSON.stringify(want);
      if (a !== b) failures.push(`${label}: ${what}\n    got  ${a}\n    want ${b}`);
    };

    check("program slip", actual.programSlip, expected.program_slip_days);
    check("program length", actual.newProgramLength, expected.new_program_length_days);

    const sortIds = (ids: string[]) => [...ids].sort();
    check(
      "affected task ids",
      sortIds(actual.affectedTasks.map((t) => t.id)),
      sortIds(expected.affected_tasks.map((t) => t.id)),
    );

    const actualShifts = Object.fromEntries(actual.affectedTasks.map((t) => [t.id, t.shift]));
    const wantShifts = Object.fromEntries(expected.affected_tasks.map((t) => [t.id, t.shift_days]));
    for (const id of Object.keys(wantShifts)) {
      check(`shift for ${id}`, actualShifts[id], wantShifts[id]);
    }

    const sortKeys = (o: Record<string, number>) =>
      Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    check("affected teams", sortKeys(actual.affectedTeams), sortKeys(expected.affected_teams));

    if (failures.length === before) {
      const tasksN = actual.affectedTasks.length;
      const teamsN = Object.keys(actual.affectedTeams).length;
      console.log(
        `  ok  ${`${expected.task_id} +${expected.delay_days}d`.padEnd(10)} slip ${actual.programSlip}d, ` +
          `${tasksN} ${tasksN === 1 ? "task" : "tasks"}, ` +
          `${teamsN} ${teamsN === 1 ? "team" : "teams"}`,
      );
    }
  }

  // The board and the briefing list *which* teams sit downstream of a
  // bottleneck, which means walking the DAG in TypeScript. networkx already
  // counted the same set as `blast_radius`, so the two must agree everywhere.
  const before = failures.length;
  for (const score of analysis.bottleneck_scores) {
    const got = descendantsOf(tasks, score.id).length;
    if (got !== score.blast_radius) {
      failures.push(
        `${slug} ${score.id}: blast radius\n    got  ${got}\n    want ${score.blast_radius}`,
      );
    }
  }
  if (failures.length === before) {
    console.log(
      `  ok  blast radius matches networkx for all ${analysis.bottleneck_scores.length} tasks`,
    );
  }
}

if (failures.length) {
  console.error(`\n${failures.length} mismatch(es) vs analyze.py:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `\nAll ${scenarioCount} scenarios across ${index.programs.length} programs match analyze.py.`,
);
