/**
 * Shapes of the JSON emitted by the Python pipeline in `fault-lines/`.
 *
 *   generate_data.py -> data/tasks.json
 *   analyze.py       -> data/analysis.json   (critical path, bottleneck scores)
 *   narrative.py     -> data/narrative.json  (Claude risk briefing)
 *
 * These are hand-written to match that output. They are the contract between
 * the analysis layer and this UI — if the pipeline's output changes, change
 * these first and let the compiler find the call sites.
 */

export type TaskStatus = "done" | "in_progress" | "not_started" | "blocked";

export interface Task {
  id: string;
  name: string;
  team: string;
  owner: string;
  duration: number;
  deps: string[];
  status: TaskStatus;
  pct: number;
}

export interface TasksFile {
  program: {
    slug: string;
    name: string;
    start_date: string;
    teams: string[];
  };
  tasks: Task[];
}

/** data/programs/index.json — the program list, written by run_pipeline.py. */
export interface ProgramIndex {
  default: string;
  programs: { slug: string; name: string; task_count: number }[];
}

export interface Cpm {
  program_length_days: number;
  critical_path: string[];
  /** Task id -> days of float before the task starts pushing the end date. */
  slack: Record<string, number>;
  /** Task id -> earliest day the task can finish. Basis for the cascade math. */
  earliest_finish: Record<string, number>;
}

export interface BottleneckScore {
  id: string;
  name: string;
  team: string;
  owner: string;
  status: TaskStatus;
  pct: number;
  /** Count of tasks transitively downstream of this one. */
  blast_radius: number;
  on_critical_path: boolean;
  at_risk: boolean;
  score: number;
}

export interface TeamLoad {
  critical_path_tasks: number;
  total_blast_radius: number;
  at_risk_tasks: number;
}

export interface DelayScenario {
  task_id: string;
  delay_days: number;
  old_program_length_days: number;
  new_program_length_days: number;
  program_slip_days: number;
  affected_teams: Record<string, number>;
  affected_tasks: { id: string; name: string; team: string; shift_days: number }[];
}

export interface AnalysisFile {
  cpm: Cpm;
  bottleneck_scores: BottleneckScore[];
  team_bottleneck_load: Record<string, TeamLoad>;
  sample_delay_scenarios: DelayScenario[];
}

export interface NarrativeRisk {
  task_id: string;
  task_name: string;
  team: string;
  why_it_matters: string;
  mitigation: string;
}

export interface TaskBriefingProse {
  why_it_matters: string;
  mitigation: string;
}

export interface NarrativeFile {
  /**
   * "live" means Claude wrote it. "mock" means narrative.py ran without an API
   * key and used hand-written stand-in prose. The UI must only say "written by
   * Claude" for live — see `narrativeSource()`.
   */
  mode: "live" | "mock";
  model: string | null;
  generated_at?: string;
  source_fingerprint: string;
  headline: string;
  risks: NarrativeRisk[];
  cascade_summary: string;
  /** Prose for individual tasks, beyond the top risks. Sparse in mock mode. */
  task_briefings: Record<string, TaskBriefingProse>;
}

export interface ProgramData {
  program: TasksFile["program"];
  tasks: Task[];
  analysis: AnalysisFile;
  narrative: NarrativeFile;
}
