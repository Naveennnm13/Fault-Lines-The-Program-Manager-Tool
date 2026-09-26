# Fault Lines - The Program Manager tool

A cross-team dependency and bottleneck radar. It finds the few tasks that
actually threaten a program's delivery date and shows what a slip would cost
before it happens. It also drafts the risk briefing a program manager would
send to each team.

**Live demo:** https://fault-lines-ui.vercel.app

Jira can tell you a ticket is blocked. It can't tell you that the ticket costs
the program three days and stalls four other teams. Fault Lines answers that
second question.

## What it does

- **Critical path and slack.** Models the program as a dependency graph and
  runs the critical path method. The result is which tasks have zero float,
  and how many days every other task can slip before the end date moves.
- **Bottleneck scoring.** Ranks tasks by how much work sits downstream of them
  (blast radius), weighted up when they're at risk or on the critical path.
- **Delay simulation.** Pick any task, push it out N days, and see which tasks
  and teams absorb the slip and whether the end date moves.
- **Risk board.** Triage lanes (Escalate now / Act this week / Watch) derived
  from the analysis, with the owner and a briefing on every ticket.
- **Briefings.** A per-task briefing for any selected issue, and an editable,
  per-team report with Markdown export that's ready to send.
- **AI narrative.** Claude turns the analysis into a headline, the top risks
  and concrete mitigations. The numbers are computed; only the prose is
  model-written, and every line in the UI says which it is.

## Repository layout

```
fault-lines/        Python: the analysis pipeline
  programs/           the three hand-authored example programs
  generate_data.py    writes a program's tasks.json
  analyze.py          critical path, slack, bottleneck scoring, delay cascade
  narrative.py        Claude risk briefing (live) or a stand-in (--mock)
  run_pipeline.py     runs all three for every program
  dashboard.html      the original single-file D3 prototype

fault-lines-ui/     Next.js: the web app deployed to Vercel
  scripts/            data sync, cascade verification, report CLI
  src/data/programs/  pipeline output, committed (this is what Vercel serves)
  LIVE-MONITORING.md  design for Jira ingest and live Claude monitoring
```

## Running it

```bash
# 1. The analysis
cd fault-lines
pip install -r requirements.txt
python run_pipeline.py --mock        # drop --mock and set ANTHROPIC_API_KEY for Claude-written briefings

# 2. The web app
cd ../fault-lines-ui
npm install
npm run dev                          # re-runs the pipeline first, if Python is available
```

`npm run verify:cascade` checks that the app's delay cascade matches the
Python analysis. An exhaustive cross-check of every task at every delay from 1
to 10 days, in all three programs (930 cases), found no differences.

See [`fault-lines/README.md`](fault-lines/README.md) and
[`fault-lines-ui/README.md`](fault-lines-ui/README.md) for detail, including
deployment.

## The example data

The three programs are **synthetic**, written so that each shows a different
risk pattern. They are not real program or company data.

| Program | What it shows |
| --- | --- |
| Q4 Platform Launch | A blocked task on the critical path: every day it waits moves the launch by a day |
| Custodian Integration | Blocked isn't the same as critical: the blocked task has weeks of float, while a slower one breaks the date after 4 days |
| Regulatory Reporting Remediation | A team as the bottleneck: every workstream converges on Compliance |

The committed briefings are hand-written stand-in text (the pipeline ran
without an API key), and the app labels them as sample text.

## Known limitations

- A task counts as **at risk** when it is blocked, or in progress and under
  50% complete. That is a simple heuristic: it doesn't yet compare progress
  against time elapsed.
- The critical path method assumes fixed durations and finish-to-start
  dependencies. It surfaces structural risk; it isn't a forecast.
- Connecting to Jira is designed ([`LIVE-MONITORING.md`](fault-lines-ui/LIVE-MONITORING.md))
  but not built.
