# Fault Lines

A cross-team dependency and bottleneck radar for a synthetic 35-task, 6-team
program ("Q4 Platform Launch"). Built to demonstrate how a program analyst
uses AI to turn raw project data into a decision a leadership team can act on
in five minutes, not a spreadsheet they have to interpret themselves.

## What it does

1. **Models the program as a dependency graph.** 35 tasks across Engineering,
   Data, Design, Compliance, Ops, and Marketing, with real dependency chains
   (a compliance sign-off can't happen before KYC checks, a launch can't
   happen before the go/no-go review, and so on).
2. **Runs the critical path method** to find which tasks have zero slack, and
   scores every task on "blast radius" (how many downstream tasks depend on
   it) combined with current risk status, to surface structural bottlenecks,
   not just late tasks.
3. **Simulates cascading delay.** Pick any task, push its finish date out by
   N days, and see exactly which downstream tasks shift, by how much, and
   which teams absorb the hit. This runs live in the browser, no server
   round trip.
4. **Uses Claude to write the risk briefing.** The graph output alone is a
   table of slack values and blast-radius scores, useful to an analyst, not
   to a VP. Claude turns that into a headline, the top 3 risks in plain
   language, and one concrete mitigation per risk, no generic advice.

## Running it

```bash
pip install -r requirements.txt

# Run the whole pipeline for every program (add --mock to skip the API call)
export ANTHROPIC_API_KEY=your_key_here
python3 run_pipeline.py

# Serve the original dashboard (fetch() needs http://, not file://)
python3 -m http.server 8000
# visit http://localhost:8000/dashboard.html
```

Three programs are defined in `programs/`, each telling a different story (see
below). `run_pipeline.py` writes each one to `data/programs/<slug>/` plus an
`index.json`, and copies the default program to `data/` for `dashboard.html`.
The Next.js app in `../fault-lines-ui` reads `data/programs/`.

The steps also run individually for one program:

```bash
python generate_data.py --program custodian-integration --data-dir data/programs/custodian-integration
python analyze.py  --data-dir data/programs/custodian-integration
python narrative.py --data-dir data/programs/custodian-integration --mock
```

`narrative.py --mock` uses hand-written stand-in prose, but takes every number
from the analysis. The output records `"mode": "mock"` or `"live"`, so the UI
only claims Claude wrote it when that's true. A mock run won't overwrite a live
narrative unless the analysis underneath it has changed.

## The story this dataset tells

The dependencies aren't random. They're built so the analysis actually finds
something: **T05, "Vendor data feed contracts,"** is blocked, sits on the
critical path, and is the direct or indirect blocker for 15 other tasks
across 5 teams. It's the kind of single point of failure that's invisible in
a status meeting where each team reports their own progress as "on track,"
and only shows up when you look at the dependency structure across teams.

The other two programs show patterns this one doesn't:

- **Custodian Integration.** Blocked is not the same as critical. The blocked
  task (C05) has 20 days of float and never moves the end date. The real
  problem is a behind-pace task (C07) that absorbs 4 days of slip and then
  starts moving go-live.
- **Regulatory Reporting Remediation.** The bottleneck is a team, not a task.
  Every workstream converges on a Compliance evidence pack and attestation, and
  Compliance's downstream load is double that of the next team.

## Files

- `programs/`: the three hand-authored program definitions, plus the mock prose for each
- `generate_data.py`: writes one program's dataset
- `analyze.py`: critical path method, bottleneck scoring, delay cascade simulation
- `narrative.py`: the AI layer (live Claude API call with structured outputs, or `--mock` fallback)
- `dashboard.html`: the original interactive graph, click-to-inspect, delay slider
- `run_pipeline.py`: runs all three Python steps for every program
