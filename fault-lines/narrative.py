"""
narrative.py

This is the AI layer. A program with 35 tasks and 6 teams produces more
graph output than any stakeholder wants to read raw (slack values, blast
radius scores, cascade tables). A program analyst's actual job is turning
that into: what's at risk, why it matters, and what to do about it.

This script hands the raw analysis to Claude and asks for exactly that,
back as structured JSON so the dashboard can render it directly instead
of pasting in a paragraph.

Two modes:
  python3 narrative.py            -> calls the real Anthropic API
                                      (needs ANTHROPIC_API_KEY set)
  python3 narrative.py --mock     -> writes a stand-in briefing, so the
                                      dashboard works out of the box
                                      without an API key or network access

Either way the output records which mode produced it (`"mode"`), so the UI
can say "written by Claude" only when that is true.

Options:
  --data-dir DIR     where tasks.json / analysis.json live (default: data)
  --program SLUG     which program's hand-written mock prose to use
                     (default: read from tasks.json)

Environment:
  ANTHROPIC_API_KEY  enables live mode
  FAULT_LINES_MODEL  override the model (default: claude-opus-5)

Output: <data-dir>/narrative.json
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import programs

DEFAULT_MODEL = "claude-opus-5"

SYSTEM_PROMPT = """You are a senior program analyst preparing a risk briefing \
for a cross-functional leadership team. You will be given structured output \
from a critical-path and bottleneck analysis of a multi-team program. \
Do not restate raw numbers like slack values or blast-radius scores. Instead, \
translate the analysis into what a VP would actually want to know in a 5-minute \
readout.

The analysis is authoritative: it was computed from the dependency graph. \
Do not contradict it. If a task has float, do not describe it as moving the \
end date on a short slip; if it is on the critical path, do not describe it as \
having room.

Write:
- headline: one sentence, the single most important thing to know.
- risks: the top 3 risks at most, most important first.
- cascade_summary: 1-2 sentences on what happens to the program end date if \
the top risk isn't addressed, using the delay scenario provided.
- task_briefings: exactly one entry for every task listed in \
tasks_needing_briefings, keyed by its task_id.

For every why_it_matters: 1-2 plain sentences, no jargon, written for a VP.
For every mitigation: one concrete, specific action someone could take this \
week, naming the owner where it helps. "Communicate more clearly" is not \
acceptable; "move the vendor contract kickoff up by one week and assign a \
backup owner" is.

Write the way a program manager writes a status note to colleagues: short, \
plain sentences. Do not use em dashes. Avoid dramatic contrasts ("not X, but \
Y"), rhetorical build-ups, and phrases like "the one thing" or "exactly why". \
Say what is happening and what to do.

The analysis does not know whether a task is behind schedule. It only knows \
percent complete and status. Describe an in-progress task as "only 35% done", \
never as "behind pace" or "behind schedule"."""

RISK_SCHEMA = {
    "type": "object",
    "properties": {
        "task_id": {"type": "string"},
        "task_name": {"type": "string"},
        "team": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "mitigation": {"type": "string"},
    },
    "required": ["task_id", "task_name", "team", "why_it_matters", "mitigation"],
    "additionalProperties": False,
}

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "risks": {"type": "array", "items": RISK_SCHEMA},
        "cascade_summary": {"type": "string"},
        "task_briefings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "why_it_matters": {"type": "string"},
                    "mitigation": {"type": "string"},
                },
                "required": ["task_id", "why_it_matters", "mitigation"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "risks", "cascade_summary", "task_briefings"],
    "additionalProperties": False,
}


# --- Shared helpers ---------------------------------------------------------

def downstream_teams(tasks, task_id):
    """Teams owning any task transitively downstream of task_id."""
    dependents = {}
    for t in tasks:
        for dep in t["deps"]:
            dependents.setdefault(dep, []).append(t["id"])
    team_of = {t["id"]: t["team"] for t in tasks}

    seen, stack = set(), list(dependents.get(task_id, []))
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        stack.extend(dependents.get(node, []))
    return sorted({team_of[n] for n in seen})


def join_names(names):
    names = list(names)
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + f" and {names[-1]}"


def plural(n, one, many=None):
    return f"{n} {one if n == 1 else (many or one + 's')}"


def top_open_task(analysis):
    """Highest-scoring task that isn't finished. Done work can't be delayed."""
    return next((s for s in analysis["bottleneck_scores"] if s["status"] != "done"), None)


def scenario_for(analysis, task_id):
    return next(
        (s for s in analysis["sample_delay_scenarios"] if s["task_id"] == task_id),
        None,
    )


def tasks_needing_briefings(tasks_data, analysis):
    """Open tasks with anything downstream, or on the critical path.

    The UI computes a factual briefing for every task on its own; this is the
    set worth spending model tokens to explain in prose.
    """
    slack = analysis["cpm"]["slack"]
    out = []
    for s in analysis["bottleneck_scores"]:
        if s["status"] == "done":
            continue
        if s["blast_radius"] == 0 and not s["on_critical_path"]:
            continue
        out.append({
            **s,
            "slack_days": slack[s["id"]],
            "downstream_teams": downstream_teams(tasks_data["tasks"], s["id"]),
        })
    return out


# --- Live mode ----------------------------------------------------------------

def build_user_prompt(tasks_data, analysis_data):
    top_scores = analysis_data["bottleneck_scores"][:5]
    top = top_open_task(analysis_data)
    top_scenario = scenario_for(analysis_data, top["id"]) if top else None

    payload = {
        "program_name": tasks_data["program"]["name"],
        "program_length_days": analysis_data["cpm"]["program_length_days"],
        "critical_path": analysis_data["cpm"]["critical_path"],
        "top_bottleneck_candidates": top_scores,
        "top_open_task_delay_scenario": top_scenario,
        "team_bottleneck_load": analysis_data["team_bottleneck_load"],
        "tasks_needing_briefings": tasks_needing_briefings(tasks_data, analysis_data),
    }
    return (
        f"Here is the analysis output for the {tasks_data['program']['name']} program:\n\n"
        + json.dumps(payload, indent=2)
    )


def call_claude(tasks_data, analysis_data, model):
    import anthropic  # pip install anthropic

    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    request = dict(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt(tasks_data, analysis_data)}],
        # Structured outputs: the response is guaranteed to parse against the
        # schema, so an unattended nightly run can't die on a stray code fence.
        output_config={"format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
    )
    if model == DEFAULT_MODEL:
        # If the primary model declines, the API retries on the fallback inside
        # the same call rather than returning an empty briefing.
        message = client.beta.messages.create(
            **request,
            betas=["server-side-fallback-2026-06-01"],
            fallbacks=[{"model": "claude-opus-4-8"}],
        )
    else:
        message = client.messages.create(**request)

    if message.stop_reason == "refusal":
        raise SystemExit("Claude declined to write this briefing; keeping the previous narrative.json.")
    if message.stop_reason == "max_tokens":
        raise SystemExit("Briefing was cut off at max_tokens; raise it or shorten the prompt.")

    text = next(block.text for block in message.content if block.type == "text")
    result = json.loads(text)
    result["risks"] = result["risks"][:3]
    result["task_briefings"] = {
        b["task_id"]: {"why_it_matters": b["why_it_matters"], "mitigation": b["mitigation"]}
        for b in result["task_briefings"]
    }
    return result, message.model


# --- Mock mode ------------------------------------------------------------------

def mock_headline(top, analysis, tasks):
    teams = downstream_teams(tasks, top["id"])
    slack = analysis["cpm"]["slack"][top["id"]]
    reach = f"{plural(top['blast_radius'], 'task')} across {plural(len(teams), 'team')}"
    # The analysis knows percent complete, not schedule, so an in-progress task
    # is described by how far along it is, never as "behind".
    state = "blocked" if top["status"] == "blocked" else f"only {top['pct']}% done"
    one = top["blast_radius"] == 1

    if top["status"] == "blocked" and top["on_critical_path"]:
        return (
            f"The biggest risk in this program is {top['name']} ({top['team']}). "
            f"It's blocked, it's on the critical path, and {reach} can't start "
            f"until it's done."
        )
    if top["at_risk"] and top["on_critical_path"]:
        return (
            f"The biggest risk in this program is {top['name']} ({top['team']}). "
            f"It's {state}, it's on the critical path, and {reach} {'is' if one else 'are'} waiting on it."
        )
    if top["at_risk"]:
        return (
            f"The task to watch is {top['name']} ({top['team']}). It's {state}, "
            f"and {reach} {'depends' if one else 'depend'} on it. It can slip {plural(slack, 'day')} "
            f"before the end date moves."
        )
    return (
        f"Nothing is slipping yet. The task with the most depending on it is "
        f"{top['name']} ({top['team']}), with {reach} downstream."
    )


def mock_cascade_summary(top, analysis):
    scenario = scenario_for(analysis, top["id"])
    slack = analysis["cpm"]["slack"][top["id"]]
    if not scenario:
        return ""
    if scenario["program_slip_days"] > 0:
        teams = join_names(sorted(scenario["affected_teams"]))
        return (
            f"If {top['name']} slips another {scenario['delay_days']} days, the "
            f"program finishes on day {scenario['new_program_length_days']} instead "
            f"of day {scenario['old_program_length_days']}. The delay reaches {teams}."
        )
    return (
        f"{top['name']} can slip {scenario['delay_days']} days and the program "
        f"still finishes on day {scenario['old_program_length_days']}. It has "
        f"{plural(slack, 'day')} to spare, so a slip of {slack + 1} days or more "
        f"would push the end date back."
    )


def mock_response(tasks_data, analysis_data, program):
    """
    A stand-in for the API response. The judgement (why it matters, what to do)
    is hand-written per program in programs/<slug>.py at the specificity Claude
    would produce. Every number is taken from the analysis at render time, so
    the mock can never disagree with the graph it is describing.
    """
    tasks = tasks_data["tasks"]
    task_by_id = {t["id"]: t for t in tasks}
    top = top_open_task(analysis_data)

    risks = []
    for r in getattr(program, "MOCK_RISKS", []):
        task = task_by_id[r["task_id"]]
        risks.append({
            "task_id": task["id"],
            "task_name": task["name"],
            "team": task["team"],
            "why_it_matters": r["why_it_matters"],
            "mitigation": r["mitigation"],
        })

    briefings = {
        r["task_id"]: {"why_it_matters": r["why_it_matters"], "mitigation": r["mitigation"]}
        for r in risks
    }
    briefings.update(getattr(program, "MOCK_TASK_BRIEFINGS", {}))

    return {
        "headline": mock_headline(top, analysis_data, tasks) if top else "No open tasks.",
        "risks": risks,
        "cascade_summary": mock_cascade_summary(top, analysis_data) if top else "",
        "task_briefings": briefings,
    }


# --- Entry point ------------------------------------------------------------------

def fingerprint(tasks_data, analysis_data):
    """Identifies the analysis a narrative was written against."""
    blob = json.dumps({"tasks": tasks_data, "analysis": analysis_data}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def load_existing(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--program", default=None)
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--force-mock", action="store_true",
                        help="replace an up-to-date live narrative with the mock")
    args = parser.parse_args()

    with open(os.path.join(args.data_dir, "tasks.json")) as f:
        tasks_data = json.load(f)
    with open(os.path.join(args.data_dir, "analysis.json")) as f:
        analysis_data = json.load(f)

    slug = args.program or tasks_data["program"].get("slug", programs.DEFAULT)
    program = programs.get(slug)
    use_mock = args.mock or args.force_mock or not os.environ.get("ANTHROPIC_API_KEY")
    source = fingerprint(tasks_data, analysis_data)
    path = os.path.join(args.data_dir, "narrative.json")

    # A live narrative costs money and can't be regenerated identically, so the
    # mock never silently overwrites one. It only does if the analysis has
    # changed underneath it, because then the live prose describes a graph that
    # no longer exists and its numbers would be wrong.
    existing = load_existing(path)
    if use_mock and existing and existing.get("mode") == "live" and not args.force_mock:
        if existing.get("source_fingerprint") == source:
            print(f"Keeping live narrative for {slug} (analysis unchanged). "
                  "Pass --force-mock to replace it.")
            return 0
        print(f"WARNING: the live narrative for {slug} was written against an older "
              "analysis. Replacing it with the mock; re-run with ANTHROPIC_API_KEY "
              "set to regenerate it.")

    if use_mock:
        print("No ANTHROPIC_API_KEY found (or --mock passed) - writing mock narrative.")
        # No timestamp in mock mode: the output is deterministic, so rebuilding
        # it on every `npm run dev` doesn't churn the committed JSON.
        narrative = {
            "mode": "mock",
            "model": None,
            "source_fingerprint": source,
            **mock_response(tasks_data, analysis_data, program),
        }
    else:
        model = os.environ.get("FAULT_LINES_MODEL", DEFAULT_MODEL)
        print(f"Calling Claude API ({model})...")
        body, served_by = call_claude(tasks_data, analysis_data, model)
        narrative = {
            "mode": "live",
            "model": served_by,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source_fingerprint": source,
            **body,
        }

    with open(path, "w") as f:
        json.dump(narrative, f, indent=2)

    print("\nHeadline:", narrative["headline"])
    print(f"\nWrote {path} ({narrative['mode']} mode)")


if __name__ == "__main__":
    sys.exit(run())
