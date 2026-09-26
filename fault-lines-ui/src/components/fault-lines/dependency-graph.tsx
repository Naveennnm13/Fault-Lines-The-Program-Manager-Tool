"use client";

import * as React from "react";

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { outDegreeById } from "@/lib/fault-lines/cascade";
import { STATUS_LABEL, teamColor } from "@/lib/fault-lines/teams";
import type { Task } from "@/lib/fault-lines/types";

/**
 * Force-directed dependency graph.
 *
 * d3-force runs headless: it owns the physics and mutates its own node objects
 * in a ref, and every tick publishes a plain snapshot of coordinates into React
 * state. React owns the DOM — there is no d3 selection touching it — so
 * selection, cascade highlighting and team filtering are ordinary props.
 *
 * Drag and zoom are hand-rolled on pointer events for the same reason: d3-drag
 * and d3-zoom would need to bind to the nodes React is rendering.
 */

interface SimNode extends SimulationNodeDatum {
  id: string;
  task: Task;
  radius: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

interface Point {
  x: number;
  y: number;
}

export interface DependencyGraphProps {
  tasks: Task[];
  criticalPath: string[];
  atRiskIds: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Task id -> days it shifts under the current delay. Null when idle. */
  cascade: Map<string, number> | null;
  hiddenTeams: Set<string>;
}

const ARROW_LENGTH = 7;

/**
 * Space the fitted layout keeps clear of the pane edges. The left gutter is
 * wider because the legend floats there; below a narrow pane it is dropped,
 * since reserving 180px of a 380px pane would squash the graph to nothing.
 */
const FIT_INSET = { top: 20, right: 20, bottom: 48, left: 20 };
const LEGEND_GUTTER = 184;
const LEGEND_MIN_PANE = 560;

interface View {
  x: number;
  y: number;
  k: number;
}

/** Transform that centres the settled layout in the pane at up to 1:1 scale. */
function fitToNodes(
  nodes: SimNode[],
  size: { width: number; height: number },
): View {
  if (!nodes.length || !size.width || !size.height) return { x: 0, y: 0, k: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const pad = n.radius + 12; // leave room for the id label above each node
    minX = Math.min(minX, (n.x ?? 0) - pad);
    minY = Math.min(minY, (n.y ?? 0) - pad);
    maxX = Math.max(maxX, (n.x ?? 0) + pad);
    maxY = Math.max(maxY, (n.y ?? 0) + pad);
  }

  const left =
    size.width >= LEGEND_MIN_PANE ? LEGEND_GUTTER : FIT_INSET.left;
  const boxW = Math.max(80, size.width - left - FIT_INSET.right);
  const boxH = Math.max(80, size.height - FIT_INSET.top - FIT_INSET.bottom);

  const w = maxX - minX;
  const h = maxY - minY;
  const k = Math.min(1, boxW / w, boxH / h);

  // Centre within the clear box, not within the whole pane.
  return {
    k,
    x: left + boxW / 2 - ((minX + maxX) / 2) * k,
    y: FIT_INSET.top + boxH / 2 - ((minY + maxY) / 2) * k,
  };
}

export function DependencyGraph({
  tasks,
  criticalPath,
  atRiskIds,
  selectedId,
  onSelect,
  cascade,
  hiddenTeams,
}: DependencyGraphProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const simRef = React.useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = React.useRef<SimNode[]>([]);

  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const sizeRef = React.useRef(size);
  sizeRef.current = size;
  const [points, setPoints] = React.useState<Map<string, Point>>(new Map());
  const [view, setView] = React.useState<View>({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const fittedRef = React.useRef(false);
  const userMovedRef = React.useRef(false);

  const criticalSet = React.useMemo(() => new Set(criticalPath), [criticalPath]);
  const atRiskSet = React.useMemo(() => new Set(atRiskIds), [atRiskIds]);
  const taskById = React.useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  );

  /** Edges point dependency -> dependent, i.e. the direction work flows. */
  const edges = React.useMemo(
    () =>
      tasks.flatMap((t) =>
        t.deps
          .filter((dep) => taskById.has(dep))
          .map((dep) => ({ source: dep, target: t.id })),
      ),
    [tasks, taskById],
  );

  const radii = React.useMemo(() => {
    const outDegree = outDegreeById(tasks);
    return new Map(
      tasks.map((t) => [t.id, 5 + Math.min(outDegree.get(t.id) ?? 0, 10)]),
    );
  }, [tasks]);

  // --- Measure -------------------------------------------------------------
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Physics -------------------------------------------------------------
  // Same forces and constants as the reference dashboard, so the layout keeps
  // its familiar shape: a long critical-path spine with team clusters hanging
  // off it.
  // Gated on `measured` rather than on the size itself: the layout is built
  // once the pane has a size, and later resizes only re-centre it (below).
  const measured = size.width > 0 && size.height > 0;

  React.useEffect(() => {
    if (!measured) return;
    const { width, height } = sizeRef.current;

    const nodes: SimNode[] = tasks.map((task) => ({
      id: task.id,
      task,
      radius: radii.get(task.id) ?? 6,
    }));
    const links: SimLink[] = edges.map((e) => ({ ...e }));

    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-180))
      .force("x", forceX(width / 2).strength(0.06))
      .force("y", forceY(height / 2).strength(0.06))
      .force("collide", forceCollide<SimNode>((d) => d.radius + 8));

    const publish = () => {
      setPoints(
        new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
      );
    };

    // Settle the whole layout synchronously, then frame it. Animating the
    // initial spread would mean fitting against a moving target, and a graph
    // that wobbles into place for four seconds reads as instability rather
    // than as physics. 35 nodes settle in a few milliseconds.
    sim.stop();
    sim.tick(400);
    publish();
    sim.on("tick", publish);

    // The force layout has no idea how big the pane is and routinely settles
    // wider than it. Frame it once, and never over a view the user has set.
    if (!userMovedRef.current) {
      fittedRef.current = true;
      setView(fitToNodes(nodes, sizeRef.current));
    }

    simRef.current = sim;
    nodesRef.current = nodes;

    return () => {
      sim.on("tick", null);
      sim.stop();
      simRef.current = null;
    };
    // Resizing re-centres the forces below rather than rebuilding the layout.
  }, [tasks, edges, radii, measured]);

  // Re-centre on resize without throwing away the settled positions.
  React.useEffect(() => {
    const sim = simRef.current;
    if (!sim || !size.width || !size.height) return;
    const { width, height } = size;
    sim.force("x", forceX(width / 2).strength(0.06));
    sim.force("y", forceY(height / 2).strength(0.06));
    sim.alpha(0.15).restart();

    // A pane that got narrower would otherwise leave the layout hanging off
    // the edge. Only re-frame views we placed ourselves.
    if (fittedRef.current && !userMovedRef.current) {
      setView(fitToNodes(nodesRef.current, { width, height }));
    }
  }, [size]);

  // --- Pan / zoom ----------------------------------------------------------
  const toGraphCoords = React.useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - view.x) / view.k,
        y: (clientY - rect.top - view.y) / view.k,
      };
    },
    [view],
  );

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Registered manually because React's onWheel is passive and cannot
    // preventDefault the page scroll.
    const onWheel = (event: WheelEvent) => {
      // Below lg the console is a scrolling page and the graph is only 60vh
      // of it — swallowing the wheel there would trap the reader. Desktop has
      // nothing to scroll, so the pane takes the gesture.
      const canvasOwnsWheel = window.matchMedia("(min-width: 1024px)").matches;
      if (!canvasOwnsWheel && !event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      userMovedRef.current = true;
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView((v) => {
        const k = Math.min(4, Math.max(0.35, v.k * Math.exp(-event.deltaY * 0.0015)));
        // Keep the point under the cursor fixed while scaling.
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const panRef = React.useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
    };
  };

  const onBackgroundPointerMove = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      pan.moved = true;
      userMovedRef.current = true;
    }
    setView((v) => ({ ...v, x: pan.vx + dx, y: pan.vy + dy }));
  };

  const onBackgroundPointerUp = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pan = panRef.current;
    panRef.current = null;
    // A click on empty canvas clears the selection.
    if (pan && !pan.moved && event.target === event.currentTarget) onSelect(null);
  };

  const refit = React.useCallback(() => {
    userMovedRef.current = false;
    setView(fitToNodes(nodesRef.current, sizeRef.current));
  }, []);

  // --- Node drag -----------------------------------------------------------
  const dragRef = React.useRef<{
    node: SimNode;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const onNodePointerDown = (event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;

    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      node,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.2).restart();
  };

  const onNodePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    // Pointers jitter by a pixel or two during an ordinary click; without a
    // threshold every click would be classified as a drag and never select.
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
    ) {
      return;
    }
    drag.moved = true;

    const { x, y } = toGraphCoords(event.clientX, event.clientY);
    drag.node.fx = x;
    drag.node.fy = y;
  };

  const onNodePointerUp = (event: React.PointerEvent, id: string) => {
    const drag = dragRef.current;
    if ((event.currentTarget as Element).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (!drag) return;

    simRef.current?.alphaTarget(0);
    drag.node.fx = null;
    drag.node.fy = null;
    // A press that never moved is a click, not a drag.
    if (!drag.moved) onSelect(id === selectedId ? null : id);
  };

  // --- Render --------------------------------------------------------------
  const isDimmed = React.useCallback(
    (task: Task) => {
      if (hiddenTeams.has(task.team)) return "hidden" as const;
      if (cascade && !cascade.has(task.id)) return "muted" as const;
      return null;
    },
    [cascade, hiddenTeams],
  );

  const hovered = hoveredId ? taskById.get(hoveredId) : null;
  const hoveredPoint = hoveredId ? points.get(hoveredId) : null;

  return (
    // touch-pan-y keeps a one-finger swipe scrolling the page on mobile, where
    // the graph is only part of a taller document.
    <div
      ref={containerRef}
      className="relative h-full w-full touch-pan-y overflow-hidden lg:touch-none"
    >
      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        role="application"
        aria-label={`Dependency graph of ${tasks.length} tasks. Use tab to move between tasks and enter to select one.`}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp}
        onPointerCancel={onBackgroundPointerUp}
      >
        <defs>
          {[
            ["arrow-slack", "var(--graph-edge)"],
            ["arrow-critical", "var(--graph-edge-critical)"],
            ["arrow-cascade", "var(--risk)"],
          ].map(([id, color]) => (
            <marker
              key={id}
              id={id}
              viewBox="0 -4 8 8"
              refX={0}
              refY={0}
              markerWidth={6}
              markerHeight={6}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0,-3.2L7,0L0,3.2" fill={color} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g>
            {edges.map(({ source, target }) => {
              const a = points.get(source);
              const b = points.get(target);
              if (!a || !b) return null;

              const sourceTask = taskById.get(source);
              const targetTask = taskById.get(target);
              if (!sourceTask || !targetTask) return null;

              if (
                hiddenTeams.has(sourceTask.team) ||
                hiddenTeams.has(targetTask.team)
              ) {
                return null;
              }

              // Stop the line at the target circle's edge so the arrowhead
              // points at the node instead of burying itself inside it.
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy) || 1;
              const trim = (radii.get(target) ?? 6) + ARROW_LENGTH;
              const ex = b.x - (dx / dist) * trim;
              const ey = b.y - (dy / dist) * trim;

              const onCascade = cascade?.has(target) && cascade.has(source);
              const onCritical =
                criticalSet.has(source) && criticalSet.has(target);
              const faded = cascade && !onCascade;

              const stroke = onCascade
                ? "var(--risk)"
                : onCritical
                  ? "var(--graph-edge-critical)"
                  : "var(--graph-edge)";

              return (
                <line
                  key={`${source}->${target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={ex}
                  y2={ey}
                  stroke={stroke}
                  strokeWidth={onCascade || onCritical ? 1.75 : 1}
                  strokeDasharray={onCascade ? "4 3" : undefined}
                  opacity={faded ? 0.15 : 1}
                  markerEnd={`url(#${
                    onCascade
                      ? "arrow-cascade"
                      : onCritical
                        ? "arrow-critical"
                        : "arrow-slack"
                  })`}
                />
              );
            })}
          </g>

          <g>
            {tasks.map((task) => {
              const p = points.get(task.id);
              if (!p) return null;

              const dim = isDimmed(task);
              if (dim === "hidden") return null;

              const r = radii.get(task.id) ?? 6;
              const selected = task.id === selectedId;
              const flagged = atRiskSet.has(task.id) || task.status === "blocked";
              const onCritical = criticalSet.has(task.id);
              const shift = cascade?.get(task.id);

              return (
                <g
                  key={task.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer outline-none"
                  opacity={dim === "muted" ? 0.2 : 1}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  aria-label={`${task.id} ${task.name}, ${task.team}, ${STATUS_LABEL[task.status] ?? task.status}`}
                  onPointerDown={(e) => onNodePointerDown(e, task.id)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={(e) => onNodePointerUp(e, task.id)}
                  onPointerCancel={(e) => onNodePointerUp(e, task.id)}
                  onPointerEnter={() => setHoveredId(task.id)}
                  onPointerLeave={() =>
                    setHoveredId((current) => (current === task.id ? null : current))
                  }
                  onFocus={() => setHoveredId(task.id)}
                  onBlur={() =>
                    setHoveredId((current) => (current === task.id ? null : current))
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelect(task.id === selectedId ? null : task.id);
                  }}
                >
                  {selected && (
                    <circle
                      r={r + 6}
                      fill="none"
                      stroke="var(--foreground)"
                      strokeWidth={1.25}
                    />
                  )}
                  {shift !== undefined && shift > 0 && (
                    <circle
                      r={r + 3.5}
                      fill="none"
                      stroke="var(--risk)"
                      strokeWidth={1.25}
                      strokeDasharray="3 2"
                    />
                  )}
                  <circle
                    r={r}
                    fill={teamColor(task.team)}
                    fillOpacity={task.status === "not_started" ? 0.4 : 1}
                    stroke={flagged ? "var(--risk)" : "var(--background)"}
                    strokeWidth={onCritical ? 2.5 : 1.5}
                  />
                  <text
                    y={-(r + 6)}
                    textAnchor="middle"
                    className="font-mono pointer-events-none"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                  >
                    {task.id}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {hovered && hoveredPoint && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: view.x + hoveredPoint.x * view.k,
            top:
              view.y +
              hoveredPoint.y * view.k -
              ((radii.get(hovered.id) ?? 6) * view.k + 44),
          }}
        >
          <div className="font-medium">{hovered.name}</div>
          <div className="text-muted-foreground font-mono mt-0.5 text-[10px]">
            {hovered.id} · {hovered.team} · {hovered.owner}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={refit}
        className="text-muted-foreground hover:text-foreground hover:bg-accent bg-background/80 absolute right-4 bottom-4 rounded-md border px-2.5 py-1 text-xs backdrop-blur-sm transition-colors"
      >
        Fit to view
      </button>
    </div>
  );
}
