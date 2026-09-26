import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AnalysisFile,
  NarrativeFile,
  ProgramData,
  ProgramIndex,
  TasksFile,
} from "./types";

/**
 * Reads the pipeline output from src/data/programs/, which
 * `scripts/sync-data.mjs` regenerates on predev/prebuild.
 *
 * Server-only. Every program page is statically generated
 * (`generateStaticParams` + `dynamicParams = false`), so these reads happen
 * once at build time and never at request time — which is what lets the
 * deployed app serve plain static HTML with no filesystem access.
 */
const ROOT = join(process.cwd(), "src", "data", "programs");

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(ROOT, ...segments), "utf8")) as T;
}

export function getProgramIndex(): ProgramIndex {
  return readJson<ProgramIndex>("index.json");
}

export function getProgramData(slug: string): ProgramData | null {
  const index = getProgramIndex();
  // Only slugs the pipeline listed are readable, so a crafted slug can't be
  // used to walk the filesystem.
  if (!index.programs.some((p) => p.slug === slug)) return null;

  const tasksFile = readJson<TasksFile>(slug, "tasks.json");
  return {
    program: tasksFile.program,
    tasks: tasksFile.tasks,
    analysis: readJson<AnalysisFile>(slug, "analysis.json"),
    narrative: readJson<NarrativeFile>(slug, "narrative.json"),
  };
}
