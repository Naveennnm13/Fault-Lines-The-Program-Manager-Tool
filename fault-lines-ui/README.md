# Fault Lines — UI

Cross-team dependency and bottleneck radar for multi-team programs. This is the
Next.js front end; the analysis behind it lives in the sibling `fault-lines/`
Python project.

```
fault-lines/          generate_data.py -> analyze.py -> narrative.py, once per program
fault-lines-ui/       this app
```

Three synthetic programs ship with it, each built to show a different risk
pattern:

| Program                           | URL                      | What it shows                                                        |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Q4 Platform Launch                | `/q4-platform-launch`    | A blocked task on the critical path: every day it waits moves launch |
| Custodian Integration             | `/custodian-integration` | Blocked ≠ critical: the blocked task has 20 days of float, while a behind-pace one absorbs 4 days and then breaks |
| Regulatory Reporting Remediation  | `/regulatory-reporting`  | A team as the bottleneck: every workstream converges on Compliance   |

`/` redirects to the default program. Each program is a separate static page,
so any of them can be shared as a link.

## Deploying to Vercel

The app is fully static: every program page is prerendered at build time, and
nothing reads the filesystem at request time. Vercel builds it with no
configuration.

```bash
npx vercel login
npx vercel --prod
```

Accept the defaults when prompted (it detects Next.js). The command prints the
production URL, `https://<project>.vercel.app`. **Share that production URL**,
not the per-deployment URL: on Vercel's default settings, deployment-specific
URLs can sit behind Vercel login, while the production domain is public.

On Vercel the Python pipeline is not present, so `prebuild` finds nothing to run
and the build uses the JSON committed in `src/data/programs/`. **Whatever is
committed is what gets deployed.** Regenerate locally and commit before
deploying if the data changed.

Optional: set `NEXT_PUBLIC_SOURCE_URL` in the Vercel project's environment
variables to show a link to the source code in the app bar. It is hidden when
unset.

### Claude-written briefings in the demo

As committed, the narratives are **sample text**: `narrative.py` ran without an
API key and used hand-written stand-ins. The UI labels them "Sample text — no
API key", never "Written by Claude".

To ship real Claude output, run the pipeline live once, then commit and deploy:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run data:live
git add src/data && git commit -m "Regenerate narratives with Claude"
npx vercel --prod
```

One call per program. The briefings are baked into the static pages, so the
deployed demo never calls the API: there is no key on Vercel, and a public link
can't run up a bill.

A later `npm run dev` without the key will **not** overwrite those live
narratives. `narrative.py` records a fingerprint of the analysis each narrative
was written against, and a mock run only replaces a live one if that analysis
has since changed (in which case the live prose would be describing numbers that
no longer exist).

## Division of labour

The interesting work is deliberately **not** in TypeScript.

| Concern                                    | Where it lives                    |
| ------------------------------------------ | --------------------------------- |
| Critical path method, slack, earliest finish | `fault-lines/analyze.py`          |
| Bottleneck scoring, blast radius             | `fault-lines/analyze.py`          |
| Risk briefing (Claude API)                   | `fault-lines/narrative.py`        |
| Delay cascade — recomputed per slider step   | `src/lib/fault-lines/cascade.ts`  |
| Severity tiering for the board               | `src/lib/fault-lines/severity.ts` |
| Report generation and Markdown export        | `src/lib/fault-lines/report.ts`   |

The last two classify and narrate analysis rather than producing it — they read
the bottleneck score, slack and critical-path flags, and never recompute them.

The cascade is the one piece that exists in both languages, because the slider
has to be instant. It is a direct port of `simulate_delay()`, and
`npm run verify:cascade` replays the `sample_delay_scenarios` that `analyze.py`
wrote into each program's `analysis.json` through the TypeScript version and
fails if any number differs:

```bash
npm run verify:cascade
```

```
Custodian Integration
  ok  C01 +3d    slip 3d, 28 tasks, 6 teams
  ok  C07 +3d    slip 0d, 2 tasks, 1 team
  ok  C03 +3d    slip 3d, 20 tasks, 5 teams
  ok  blast radius matches networkx for all 28 tasks
...
All 9 scenarios across 3 programs match analyze.py.
```

The board and the briefing also need to know *which* teams sit downstream of a
bottleneck, which means walking the DAG in TypeScript. networkx already counted
that set as `blast_radius`, so the check asserts the two agree for every task.

Beyond the committed check, the port was cross-checked exhaustively against
`simulate_delay()`: every task, at every delay from 1 to 10 days, in all three
programs, was 930 cases with 0 mismatches. That run also confirmed the property
the briefings rely on: in every case, slip = max(0, delay − float).

## Running it

```bash
npm install
npm run dev
```

`predev` and `prebuild` run `scripts/sync-data.mjs`, which shells out to
`python run_pipeline.py --mock` in `../fault-lines` and copies every program's
JSON into `src/data/programs/<slug>/`, plus an `index.json` listing them. Each
program page reads its files at build time, so the build always ships whatever
the pipeline last produced.

`predev` and `prebuild` **never call the Claude API**, even with a key in the
environment, so starting the dev server can't spend money. Live narratives come
only from the explicit `npm run data:live`.

The script is defensive on purpose. If Python is missing, `networkx` is not
installed, the pipeline errors, or `../fault-lines` is not there, it prints a
warning and exits 0. The committed JSON is used as-is and the build still
succeeds; that is the path Vercel takes. **If you change the dataset in an
environment without Python, regenerate by hand and commit the result:**

```bash
cd ../fault-lines && python run_pipeline.py --mock
```

Point the script somewhere else with `FAULT_LINES_PY=/path/to/fault-lines`.

To add a program, add a module to `fault-lines/programs/` and list it in
`programs/__init__.py`. It gets a URL and an entry in the picker on the next
build.

## Layout

One page, three views.

### Dependency graph

Two panes.

- **Left.** 35 nodes, coloured by team; edges point dependency → dependent.
  Critical-path edges are drawn in the ink colour, everything else recedes to a
  muted grey. At-risk and blocked tasks carry a red ring. Click a node to
  select it, drag to reposition, scroll to zoom, click empty canvas to clear.
  The legend doubles as a team filter.
- **Right — three cards.** Selected task (owner, blast radius, slack, direct
  dependents), delay simulator (0–10 days, live cascade), and the risk
  briefing. Task references in the detail and briefing cards are buttons that
  select the corresponding node, so the prose and the graph stay in sync.

The risk briefing card has two views. With nothing selected, it shows the
program briefing: headline, top three risks, and cascade summary. Select **any**
task and it becomes that task's briefing: why it matters, who is waiting on it,
what happens at +3/+5/+10 days, and the recommended action.

Every line of prose carries its source, one of **Written by Claude**, **Sample
text — no API key**, or **Computed from the analysis**. Facts and projections
are always computed. Prose comes from `narrative.json` when it covers the task
(`task_briefings`, then the top `risks`), and is otherwise computed by
`src/lib/fault-lines/briefing.ts`. In live mode, `narrative.py` asks Claude for
a briefing for every open task with downstream reach, so Claude's coverage goes
from three tasks to most of the program.

### Risk board

A triage board. Lanes are **severity tiers**, not task status — the point is
what to do first. Tiers are derived in `src/lib/fault-lines/severity.ts` from
values the pipeline already produced:

| Lane           | Rule                                                        |
| -------------- | ----------------------------------------------------------- |
| Escalate now   | at risk **and** (on the critical path **or** blast radius ≥ 10) |
| Act this week  | at risk, **or** zero slack with anything downstream          |
| Watch          | blast radius ≥ 5, **or** ≤ 2 days of slack                   |

Completed tasks are excluded however much hangs off them — T01 is the root of
the whole DAG and scores second overall, but it is done, so putting it at the
top of a triage board would be noise. Anything with plenty of float and no
downstream reach is left off entirely; the board footer says how many.

Each ticket shows the problem in one line plus the POC. Clicking it expands to
the reasons it was flagged, blast radius / slack / score, the teams waiting on
it, a three-day cascade projection, Claude's mitigation where one exists, and a
jump back into the graph. Cards are deliberately **not** draggable: their lane
is computed from the analysis, so moving one would assert something the data
does not support.

### Briefing

A per-team report you can edit and send. Pick an audience (a team, or the whole
program) and the document is generated from the analysis. Every paragraph and
bullet is a textarea bound to the document state, and Markdown export
serialises that same state — so what leaves the app is exactly what is on
screen, with no separate source that can drift.

Sections: bottom line, where the team sits, pain points, what happens if delays
persist (the top bottleneck replayed at +3 / +5 / +10 days), action points, and
a provenance note. Lines taken from the narrative are tagged "Claude" or
"Sample" depending on how it was generated; everything else is derived from the
numbers. Hovering a line reveals a control to drop it.

Same generator runs from the terminal:

```bash
npm run report                                                   # default program
npm run report -- Ops                                            # one team
npm run report -- --program regulatory-reporting Compliance > compliance.md
```

### Graph implementation

`d3-force` runs headless in `src/components/fault-lines/dependency-graph.tsx`:
it owns the physics and mutates its own node objects in a ref, and each tick
publishes a plain snapshot of coordinates into React state. React owns every
DOM node, so selection, cascade highlighting and filtering are ordinary props
rather than d3 selections fighting the render cycle. Drag and pan/zoom are
hand-rolled on pointer events for the same reason — pulling in `d3-drag` and
`d3-zoom` would mean binding d3 to elements React is rendering. `d3-force` is
the only d3 package installed.

The layout is settled synchronously on mount (`sim.tick(400)`) and then framed
to the pane, so the graph appears in place instead of wobbling outward from the
centre for several seconds.

## What came from the template

Mainline (shadcn/ui + Tailwind 4). Kept: the DM Sans / Inter setup in
`layout.tsx`, the oklch token system in `src/styles/globals.css`, `next-themes`
dark mode and `theme-toggle.tsx`, `<DashedLine>` as the divider motif, and the
`Card` / `Button` / `Checkbox` primitives. `Slider` was added from the same
shadcn registry style.

Removed: every marketing page and block (hero, pricing, testimonials, FAQ,
about, contact, login, signup), the MDX pipeline, `react-hook-form` / `zod` /
`next-safe-action`, and the `@styleglide/kit-view-provider` plus the
third-party `tweakcn.com` live-preview script the template loaded in `<head>`.

`Navbar` and `Footer` were rewritten rather than restyled. The template's
navbar is an absolutely positioned floating pill, which would sit on top of the
graph and link to pages that no longer exist; it is now a sticky app bar with
the program picker and the theme toggle. The footer's free-trial CTA and site map
became a one-line provenance strip.

### Team colours

Six hues at low chroma, spaced far enough apart to stay separable at 10px, with
red (hue ~25) deliberately left out of the team palette and reserved for risk
and program slip. Both themes are driven by the same tokens in `globals.css`,
so the graph re-colours on theme change with no JavaScript.
