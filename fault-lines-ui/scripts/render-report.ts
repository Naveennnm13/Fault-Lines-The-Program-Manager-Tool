/**
 * render-report.ts — print a briefing to stdout, without opening the browser.
 *
 * Same generator the Briefing tab uses, so what you see here is what the UI
 * renders before anyone edits it. Useful for eyeballing the copy, diffing it
 * after a data change, or piping it somewhere from CI.
 *
 *   npm run report                                    # default program, whole program
 *   npm run report -- --program custodian-integration # another program
 *   npm run report -- Ops                             # one team
 *   npm run report -- --program regulatory-reporting Compliance > compliance.md
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateReport, toMarkdown } from "../src/lib/fault-lines/report.ts";
import type {
  AnalysisFile,
  NarrativeFile,
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

const argv = process.argv.slice(2);
const programFlag = argv.indexOf("--program");
const index = read<ProgramIndex>("index.json");
const slug = programFlag >= 0 ? argv[programFlag + 1] : index.default;
const team = argv.filter((_, i) => i !== programFlag && i !== programFlag + 1)[0];

if (!index.programs.some((p) => p.slug === slug)) {
  console.error(
    `Unknown program "${slug}". Known programs: ${index.programs.map((p) => p.slug).join(", ")}`,
  );
  process.exit(1);
}

const tasksFile = read<TasksFile>(slug, "tasks.json");
const data = {
  program: tasksFile.program,
  tasks: tasksFile.tasks,
  analysis: read<AnalysisFile>(slug, "analysis.json"),
  narrative: read<NarrativeFile>(slug, "narrative.json"),
};

if (team && !data.program.teams.includes(team)) {
  console.error(
    `Unknown team "${team}". Known teams: ${data.program.teams.join(", ")}`,
  );
  process.exit(1);
}

process.stdout.write(toMarkdown(generateReport(data, team ?? null)));
