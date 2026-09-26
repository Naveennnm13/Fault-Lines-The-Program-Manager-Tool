"use client";

import * as React from "react";

import { X } from "lucide-react";

import { DashedLine } from "@/components/dashed-line";
import { BriefingReport } from "@/components/fault-lines/briefing-report";
import { DelaySimulatorCard } from "@/components/fault-lines/delay-simulator-card";
import { DependencyGraph } from "@/components/fault-lines/dependency-graph";
import { GraphLegend } from "@/components/fault-lines/graph-legend";
import { RiskBoard } from "@/components/fault-lines/risk-board";
import { RiskBriefingCard } from "@/components/fault-lines/risk-briefing-card";
import { TaskDetailCard } from "@/components/fault-lines/task-detail-card";
import { ViewTabs, type ViewId } from "@/components/fault-lines/view-tabs";
import { buildTaskBriefing, narrativeSource } from "@/lib/fault-lines/briefing";
import { buildCascadeContext, simulateDelay } from "@/lib/fault-lines/cascade";
import { buildRiskItems } from "@/lib/fault-lines/severity";
import { teamColor } from "@/lib/fault-lines/teams";
import type { ProgramData } from "@/lib/fault-lines/types";

/**
 * Owns the one piece of state both panes share: which task is selected. The
 * graph writes it, the cards read it, and the cards can write it back (via
 * dependent chips and briefing links) so the two panes stay in sync.
 */
export function ProgramConsole({ data }: { data: ProgramData }) {
  const { tasks, analysis, narrative, program } = data;

  const [view, setView] = React.useState<ViewId>("graph");
  const asideRef = React.useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [delayDays, setDelayDays] = React.useState(0);
  const [hiddenTeams, setHiddenTeams] = React.useState<Set<string>>(
    () => new Set(),
  );

  const taskById = React.useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );
  const scoreById = React.useMemo(
    () => new Map(analysis.bottleneck_scores.map((s) => [s.id, s])),
    [analysis.bottleneck_scores],
  );
  const atRiskIds = React.useMemo(
    () => analysis.bottleneck_scores.filter((s) => s.at_risk).map((s) => s.id),
    [analysis.bottleneck_scores],
  );

  // Built once: the topological order the cascade walks on every slider step.
  const cascadeCtx = React.useMemo(
    () => buildCascadeContext(tasks, analysis.cpm),
    [tasks, analysis.cpm],
  );

  const result = React.useMemo(() => {
    if (!selectedId || delayDays === 0) return null;
    return simulateDelay(cascadeCtx, selectedId, delayDays);
  }, [cascadeCtx, selectedId, delayDays]);

  const cascadeMap = React.useMemo(() => {
    if (!result) return null;
    return new Map(result.affectedTasks.map((t) => [t.id, t.shift]));
  }, [result]);

  // Changing the subject resets the simulation, the same way picking a new
  // node reset the slider in the original dashboard.
  const selectTask = React.useCallback((id: string | null) => {
    setSelectedId(id);
    setDelayDays(0);
  }, []);

  const toggleTeam = React.useCallback((team: string) => {
    setHiddenTeams((current) => {
      const next = new Set(current);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  }, []);

  const selectedTask = selectedId ? (taskById.get(selectedId) ?? null) : null;
  const dependents = React.useMemo(
    () =>
      selectedId
        ? tasks.filter((t) => t.deps.includes(selectedId))
        : [],
    [tasks, selectedId],
  );

  const riskItems = React.useMemo(
    () => buildRiskItems(tasks, analysis),
    [tasks, analysis],
  );
  const escalateCount = riskItems.filter((i) => i.tier === "escalate").length;

  // Narrative mitigations for board tickets: per-task prose first, then the
  // top-risk entries — the same precedence the briefing card uses.
  const mitigations = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of narrative.risks) map.set(r.task_id, r.mitigation);
    for (const [id, b] of Object.entries(narrative.task_briefings ?? {})) {
      map.set(id, b.mitigation);
    }
    return map;
  }, [narrative]);

  const taskBriefing = React.useMemo(
    () =>
      selectedId
        ? buildTaskBriefing(data, cascadeCtx, riskItems, selectedId)
        : null,
    [data, cascadeCtx, riskItems, selectedId],
  );
  const knownTaskIds = React.useMemo(() => new Set(taskById.keys()), [taskById]);

  // Jumping from a board ticket to the graph should land on that node.
  const showInGraph = React.useCallback(
    (id: string) => {
      selectTask(id);
      setView("graph");
    },
    [selectTask],
  );

  if (view === "board") {
    return (
      <div className="flex h-full flex-col lg:min-h-0">
        <ViewTabs
          value={view}
          onChange={setView}
          counts={{ board: escalateCount }}
        />
        <div className="flex-1 lg:min-h-0">
          <RiskBoard
            items={riskItems}
            cascadeCtx={cascadeCtx}
            mitigations={mitigations}
            mitigationSource={narrativeSource(narrative)}
            hiddenCount={tasks.length - riskItems.length}
            onShowInGraph={showInGraph}
          />
        </div>
      </div>
    );
  }

  if (view === "briefing") {
    return (
      <div className="flex h-full flex-col lg:min-h-0">
        <ViewTabs
          value={view}
          onChange={setView}
          counts={{ board: escalateCount }}
        />
        <div className="flex-1 lg:min-h-0">
          <BriefingReport data={data} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col lg:min-h-0">
      <ViewTabs
        value={view}
        onChange={setView}
        counts={{ board: escalateCount }}
      />
      <div className="lg:grid lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_auto_26rem]">
      <section
        className="relative h-[60svh] border-b lg:h-auto lg:min-h-0 lg:border-b-0"
        aria-label="Dependency graph"
      >
        <DependencyGraph
          tasks={tasks}
          criticalPath={analysis.cpm.critical_path}
          atRiskIds={atRiskIds}
          selectedId={selectedId}
          onSelect={selectTask}
          cascade={cascadeMap}
          hiddenTeams={hiddenTeams}
        />
        <GraphLegend
          teams={program.teams}
          hiddenTeams={hiddenTeams}
          onToggleTeam={toggleTeam}
          className="absolute top-3 left-3 z-10 lg:top-4 lg:left-4"
        />

        {selectedTask ? (
          // Phones only: the detail sections are below the fold, so without
          // this a successful tap changes nothing but an 8px ring.
          <div className="bg-background absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-md border py-1.5 pr-1.5 pl-3 lg:hidden">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: teamColor(selectedTask.team) }}
            />
            <p className="min-w-0 flex-1 text-sm leading-tight">
              <span className="block truncate font-medium">
                {selectedTask.name}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                <span className="font-mono">{selectedTask.id}</span> ·{" "}
                {selectedTask.owner}
              </span>
            </p>
            <button
              type="button"
              onClick={() =>
                asideRef.current?.scrollIntoView({ behavior: "smooth" })
              }
              className="bg-foreground text-background focus-visible:ring-ring h-10 shrink-0 rounded px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => selectTask(null)}
              aria-label="Clear selection"
              className="text-muted-foreground hover:text-foreground flex size-10 shrink-0 items-center justify-center rounded"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground pointer-events-none absolute bottom-3 left-3 text-[11px] lg:bottom-4 lg:left-4">
            <span className="lg:hidden">Tap a task to inspect it · drag to move it</span>
            <span className="max-lg:hidden">
              Scroll to zoom · drag a task to move it · drag the canvas to pan
            </span>
          </p>
        )}
      </section>

      <DashedLine orientation="vertical" className="max-lg:hidden" />

      {/* One continuous column, divided by the template's dashed rule, rather
          than a stack of identical bordered boxes. */}
      <aside
        ref={asideRef}
        className="scroll-mt-2 px-4 lg:overflow-y-auto lg:px-6"
        aria-label="Program analysis"
      >
        <TaskDetailCard
          task={selectedTask}
          score={selectedId ? (scoreById.get(selectedId) ?? null) : null}
          onCriticalPath={
            selectedId ? analysis.cpm.critical_path.includes(selectedId) : false
          }
          slack={
            selectedId ? (analysis.cpm.slack[selectedId] ?? null) : null
          }
          dependents={dependents}
          onSelectTask={selectTask}
        />

        <DashedLine />

        <DelaySimulatorCard
          task={selectedTask}
          delayDays={delayDays}
          onDelayChange={setDelayDays}
          result={result}
          programLength={analysis.cpm.program_length_days}
        />

        <DashedLine />

        <RiskBriefingCard
          narrative={narrative}
          taskBriefing={taskBriefing}
          knownTaskIds={knownTaskIds}
          selectedId={selectedId}
          onSelectTask={selectTask}
        />
      </aside>
      </div>
    </div>
  );
}
