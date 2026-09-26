/**
 * Client-side delay cascade.
 *
 * This is a direct port of `clientSideCascade()` from the original
 * `dashboard.html`, which itself mirrors `simulate_delay()` in analyze.py. It
 * is recomputed in the browser so the slider is instant — no round trip — and
 * it must produce exactly the numbers analyze.py produces for the same input.
 * The scenarios in `analysis.sample_delay_scenarios` are the fixture that
 * proves it — run `npm run verify:cascade`.
 *
 * The critical path method and bottleneck scoring are deliberately NOT ported:
 * they stay in Python, and this UI reads their output.
 */
import type { Cpm, Task } from "./types";

export interface CascadeResult {
  /** Days the program end date moves. 0 means the slip was absorbed by slack. */
  programSlip: number;
  /** Every task whose earliest finish moves, with how far it moves. */
  affectedTasks: { id: string; shift: number }[];
  /** Team -> the largest shift any of that team's tasks absorbs. */
  affectedTeams: Record<string, number>;
  newProgramLength: number;
  oldProgramLength: number;
}

/**
 * Precomputed, order-dependent pieces of the cascade. Built once per dataset so
 * dragging the slider only pays for the propagation pass.
 */
export interface CascadeContext {
  byId: Map<string, Task>;
  /** Topological order: every task appears after all of its dependencies. */
  order: string[];
  earliestFinish: Record<string, number>;
  programLength: number;
}

export function buildCascadeContext(tasks: Task[], cpm: Cpm): CascadeContext {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Depth-first post-order over deps, same as the reference implementation.
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    byId.get(id)?.deps.forEach(visit);
    order.push(id);
  };
  tasks.forEach((t) => visit(t.id));

  return {
    byId,
    order,
    earliestFinish: cpm.earliest_finish,
    programLength: cpm.program_length_days,
  };
}

export function simulateDelay(
  ctx: CascadeContext,
  taskId: string,
  delayDays: number,
): CascadeResult {
  const { byId, order, earliestFinish: ef } = ctx;
  const newEf: Record<string, number> = { ...ef };
  newEf[taskId] = ef[taskId] + delayDays;

  for (const id of order) {
    if (id === taskId) continue;
    const task = byId.get(id);
    if (!task || task.deps.length === 0) continue;

    const candidateStart = Math.max(...task.deps.map((p) => newEf[p] ?? ef[p]));
    const candidateFinish = candidateStart + task.duration;
    // A delay can only push tasks later, never pull them earlier.
    if (candidateFinish > newEf[id]) newEf[id] = candidateFinish;
  }

  const newProgramLength = Math.max(...Object.values(newEf));
  const affectedTasks: CascadeResult["affectedTasks"] = [];
  const affectedTeams: Record<string, number> = {};

  for (const id of Object.keys(newEf)) {
    const shift = newEf[id] - ef[id];
    if (shift <= 0) continue;
    affectedTasks.push({ id, shift });
    const team = byId.get(id)?.team;
    if (team) affectedTeams[team] = Math.max(affectedTeams[team] ?? 0, shift);
  }

  affectedTasks.sort((a, b) => b.shift - a.shift || a.id.localeCompare(b.id));

  return {
    programSlip: newProgramLength - ctx.programLength,
    affectedTasks,
    affectedTeams,
    newProgramLength,
    oldProgramLength: ctx.programLength,
  };
}

/** Number of tasks that list `id` as a direct dependency. */
export function directDependents(tasks: Task[], id: string): string[] {
  return tasks.filter((t) => t.deps.includes(id)).map((t) => t.id);
}

/**
 * Every task transitively downstream of `id`. The count matches the
 * `blast_radius` analyze.py computes with networkx (asserted by
 * `npm run verify:cascade`); this returns the ids so the board and the report
 * can say *which* teams are waiting, not just how many tasks.
 */
export function descendantsOf(tasks: Task[], id: string): string[] {
  const dependentsOf = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.deps) {
      const list = dependentsOf.get(dep);
      if (list) list.push(task.id);
      else dependentsOf.set(dep, [task.id]);
    }
  }

  const seen = new Set<string>();
  const queue = [...(dependentsOf.get(id) ?? [])];
  while (queue.length) {
    const next = queue.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(dependentsOf.get(next) ?? []));
  }
  return [...seen];
}

/** Out-degree per task — drives node size in the graph. */
export function outDegreeById(tasks: Task[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const task of tasks) {
    for (const dep of task.deps) out.set(dep, (out.get(dep) ?? 0) + 1);
  }
  return out;
}
