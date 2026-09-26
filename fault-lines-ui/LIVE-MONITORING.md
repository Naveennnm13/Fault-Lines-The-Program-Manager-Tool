# Fault Lines, live: Jira ingest + Claude monitoring

How this prototype becomes a tool that watches a real program instead of a
synthetic one — and an honest read on what would actually be hard.

---

## 1. The load-bearing architectural fact

The pipeline is already four separable stages:

```
generate_data.py  →  analyze.py  →  narrative.py  →  UI
  (data source)      (the math)     (the language)   (the surface)
```

`analyze.py` does not know or care where tasks come from. It takes a list of
`{id, name, team, owner, duration, deps, status, pct}` and returns critical
path, slack, blast radius and cascade scenarios.

**So going live is one replacement: `generate_data.py` → `jira_ingest.py`.**
Same output schema, same `tasks.json`. Nothing downstream changes. The
critical-path code, the UI, the board, the report generator and the cascade
port all keep working untouched.

That is the whole migration, and it is worth saying out loud in a pitch,
because it is the difference between "a demo" and "a prototype with a
production path".

---

## 2. Layer by layer

### 2.1 Ingest — Jira → task graph

A scheduled job that pulls issues and emits the same `tasks.json` schema.

| Our field  | Jira source                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `id`       | issue key (`PROJ-123`)                                                      |
| `name`     | `fields.summary`                                                            |
| `team`     | component, board/project, or a team custom field — **decide this up front** |
| `owner`    | `fields.assignee.displayName`                                               |
| `duration` | `fields.timeoriginalestimate`, story points × velocity, or historical cycle time |
| `deps`     | `fields.issuelinks` where the link type is `Blocks` / `is blocked by`        |
| `status`   | `fields.status.statusCategory.key` (`new`/`indeterminate`/`done`) + a blocked signal |
| `pct`      | `timespent / timeoriginalestimate`, or workflow-stage heuristic             |

Notes that matter in practice:

- **Endpoints move.** Jira Cloud retired the old `GET /rest/api/3/search` in
  2025 in favour of a POST JQL search endpoint with token pagination. Check
  Atlassian's current REST v3 reference before writing the client rather than
  trusting any example — including this one.
- **Auth.** OAuth 2.0 (3LO) for anything shipped; a scoped API token over
  HTTPS is fine for a pilot. Read-only scopes for phases 1–3.
- **Rate limits.** Jira Cloud uses a cost-based budget and returns 429 with
  `Retry-After`. Request only the fields you need and page at `maxResults=100`;
  a 200-issue program is a handful of calls.
- **Blocked is not a status in Jira.** Teams express it as a label, a flag
  field, a status name, or a comment. You will need a per-project mapping
  config. Do not guess.
- **Cycles.** Jira will happily let two issues block each other. CPM requires a
  DAG. Detect cycles at ingest, break them with a logged heuristic, and surface
  the fact — silently discarding an edge changes the critical path.

### 2.2 Analyze — unchanged

`analyze.py` runs as-is. Add two things for monitoring:

- **Persist every run** (program, timestamp, analysis blob) in Postgres or S3.
  History is what turns a report into monitoring: *"T05 has been the top
  bottleneck for 11 straight days"* is a far stronger signal than today's
  ranking.
- **Diff against the previous run** — new/resolved bottlenecks, slack that
  fell, critical path that changed shape.

### 2.3 Narrate — where Claude belongs, and where it doesn't

This is the part most teams get wrong, so it is worth being precise.

**Do not ask Claude to find the bottleneck.** Finding it is graph math:
deterministic, auditable, instant, and free. An LLM asked to rank 200 tasks by
criticality will be plausible and occasionally wrong, and you will not be able
to tell which. `analyze.py` is right every time and can be unit-tested.

**Claude's job is judgement and language**, on top of a computed shortlist:

1. Of the top N computed bottlenecks, which actually merit a human's attention
   this week?
2. Why should a VP who does not know the dependency graph care?
3. What is the specific action, for the specific owner?
4. What changed since yesterday that is worth interrupting someone about?

That last one is what makes it monitoring rather than a daily report nobody
opens. **Alert fatigue is the number-one failure mode of tools in this
category.** The delta pass should be allowed to conclude "nothing worth saying
today" and send nothing.

Concretely, `narrative.py` grows a second mode:

```python
# Today's analysis + yesterday's, plus the current briefing.
# Ask: what changed, and is it worth telling someone?
```

Implementation details that matter:

- **Structured outputs, not "return only JSON".** The current script prompts
  for raw JSON and parses it. Use `output_config: {format: {...}}` with a JSON
  schema (note: the older top-level `output_format` parameter is deprecated),
  or define the briefing as a tool with `strict: true`. Either removes a whole
  class of parse failures from a job that runs unattended.
- **Prompt caching.** The system prompt, the scoring rubric and the program
  structure are stable across runs; the analysis delta is not. Put the stable
  content first with a `cache_control` breakpoint after it. Cache reads bill at
  roughly a tenth of input rate. Verify with `usage.cache_read_input_tokens` —
  if it is zero on repeated runs, something volatile (a timestamp, unsorted
  JSON keys) is sitting in the cached prefix.
- **Batch API** if you monitor many programs. Async, 50% cost, ideal for an
  overnight job where latency is irrelevant.

**Model selection** (current IDs and list prices):

| Job                                             | Model                | $/MTok in | $/MTok out |
| ----------------------------------------------- | -------------------- | --------- | ---------- |
| Nightly delta pass, per-team briefings          | `claude-sonnet-5`    | $2        | $10        |
| Weekly exec roll-up; large structural changes   | `claude-opus-5`      | $5        | $25        |
| High-volume classification (e.g. "is this blocked?" across 5k issues) | `claude-haiku-4-5` | $1 | $5 |

### 2.4 Act — write-back

In rough order of how much trust each one costs you if it misfires:

1. **Slack/Teams message** to a team channel. Cheapest to get wrong.
2. **Confluence page** updated with the program briefing.
3. **Jira comment** on the epic, containing the team's briefing.
4. **Jira field change** — flag the bottleneck issue, add a label.

**Gate write-back behind human approval for the first few months.** An agent
that autonomously comments on people's tickets is how you lose the room in week
one. The existing Briefing tab is already the approval UI: generate → a lead
edits → they send. Start there and automate backwards.

### 2.5 Serve

The Next.js app changes one function. `src/lib/fault-lines/data.ts` currently
imports JSON at build time; it becomes a fetch of the latest stored snapshot
with `revalidate`, or an API route. Everything else in the UI is already
driven off that one call.

---

## 3. Scheduling

**Nightly cron, not webhook-per-change.** Jira webhooks fire on every field
edit; recomputing CPM over a whole program on each one is wasteful and would
generate constant churn in the UI.

- Nightly full recompute + delta narration.
- On-demand recompute from a button in the UI.
- *Optionally* a debounced webhook for one specific transition — an issue
  entering a blocked state — since that is the event with real time value.

Host it wherever is cheapest to get approved: GitHub Actions on a schedule,
Lambda + EventBridge, or a container on whatever the team already runs.

---

## 4. Cost

For one 200-task program, nightly:

- Jira API: free (rate limits, not billing).
- Claude: the analysis payload is small — a few thousand tokens of shortlist
  and deltas, not the whole backlog. At Sonnet rates with caching on the stable
  prefix, a nightly run plus six per-team briefings lands in **cents per day**.
  Even at 50 programs it is a rounding error next to the engineer-hours.
- Compute/storage: negligible.

The cost of this system is entirely the engineering time and the data cleanup,
not the API bill. Say that plainly — managers expect "AI feature" to mean a
scary invoice, and here it genuinely does not.

---

## 5. Security and compliance, in a regulated environment

This is where a financial-services deployment lives or dies, and it should be
in the pitch rather than discovered in review.

- **Data classification.** Jira summaries in a wealth-management firm can
  contain client names, deal details, or material non-public information.
  Someone has to classify what leaves the network before anything is sent.
  Sending only issue *keys*, statuses and the computed graph — not free-text
  summaries — is a viable hardening step that preserves most of the value.
- **Deployment boundary.** If sending text to a third-party API is a blocker,
  Claude is available through **Amazon Bedrock**, **Google Vertex AI**, and
  **Microsoft Foundry**, which keeps traffic inside an existing cloud contract
  and vendor review. For many financial-services firms this is the unlock.
- **Retention.** Zero-data-retention arrangements exist; confirm current terms
  with Anthropic for the specific model, since availability varies by model.
- **Credentials.** Jira OAuth tokens and the API key belong in the existing
  secrets manager, never in the repo or CI variables.
- **Auditability.** Every briefing should record the analysis snapshot it was
  generated from. When someone disputes a recommendation, you need to be able
  to reproduce it. This is also what makes the tool defensible in a governance
  review: the numbers are deterministic and re-derivable; only the prose is
  model-generated, and it is labelled as such (the report already does this).

---

## 6. What would actually be hard

Ordered by how likely it is to kill the project.

### 6.1 Data quality is the whole problem

This prototype works beautifully because `generate_data.py` emits a clean DAG
with a duration on every task and honest statuses. Real Jira is not that:

- **Cross-team dependencies are the least reliably captured thing in Jira**,
  and they are precisely what this tool needs. Teams record them in a comment,
  a Slack thread, or someone's head. If the links are not there, the graph is
  wrong, and a wrong critical path is *worse* than no critical path because it
  is confident.
- **Estimates are missing or fictional.** CPM needs durations. Story points
  divided by velocity is a defensible proxy; no estimate at all is not.
- **"Blocked" means six things across six teams.**

**Mitigation:** before any of this, run a read-only audit: what fraction of
issues have a dependency link, an estimate, an assignee? That number decides
whether the project is viable, and it is a one-day script. **Do this first.**
It is also a genuinely useful deliverable on its own, even if the tool never
ships.

### 6.2 CPM is an approximation of software work

Critical path method assumes fixed durations and finish-to-start dependencies.
Real engineering has partial overlap, rework loops, and resource contention
(two "parallel" tasks assigned to the same person are not parallel). Anyone who
has actually run a program will raise this in the first five minutes.

Do not oversell. The honest claim is: *this surfaces structural risk that is
invisible in a board view* — not *this predicts your launch date*. The delay
simulator is a sensitivity analysis, not a forecast.

### 6.3 Organizational, not technical

This tool tells Team A that their work is holding up Teams B through E. That is
politically loaded. Adoption failure is more likely than technical failure.

Framing that survives: the tool is a **shared map**, not a scorecard. Ship the
per-team briefing to the team lead first, not to their VP. Never rank teams by
"blame".

### 6.4 Procurement and review

Adding an LLM vendor to a regulated firm is a months-long process, not a
sprint. If Bedrock or Vertex is already approved, use it — riding an existing
approval can be the difference between a Q1 pilot and a Q4 one.

---

## 7. A phased plan

| Phase | Scope                                                              | Outcome                              |
| ----- | ------------------------------------------------------------------ | ------------------------------------ |
| 0     | Read-only Jira data audit: link/estimate/assignee coverage          | Go / no-go, with a number            |
| 1     | `jira_ingest.py` for one program, run manually. Existing UI.        | Is the computed critical path *right*? Ask the program lead. |
| 2     | Nightly job + snapshot history + delta narration                    | Monitoring, read-only                |
| 3     | Briefings sent to team leads, human-approved from the Briefing tab  | Does anyone act on them?             |
| 4     | Write-back to Jira / Slack; more programs                           | Scale, if 1–3 earned it              |

Each phase is independently useful and independently killable. Phase 0 costs a
day and tells you whether phases 1–4 are worth funding.

---

## 8. How to pitch it

- **Lead with the gap, not the tech.** Jira can tell you a ticket is blocked.
  It cannot tell you that ticket costs the program three days and stalls four
  other teams. That gap is real, every program manager feels it, and no tool in
  the standard stack closes it.
- **Demo the delay slider.** Drag it to 3 and watch the launch date move. That
  fifteen seconds does more than any slide.
- **Say "the AI writes the summary, the math finds the bottleneck."** It
  pre-empts the obvious objection and signals you know where LLMs are and are
  not reliable.
- **Lead the risks yourself**, starting with data quality. Bringing the
  strongest objection before your manager does is what separates a proposal
  from a pitch.
- **Ask for Phase 0, not for the project.** One day of read-only analysis, with
  a number at the end. That is an easy yes, and the number decides the rest.
