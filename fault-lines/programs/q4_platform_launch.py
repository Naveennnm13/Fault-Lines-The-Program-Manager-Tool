"""
Q4 Platform Launch: the original Fault Lines dataset.

Story: a vendor data-feed contract is blocked, and it sits on the critical
path. Every day it waits is a day off the launch date, one-for-one.
"""

from datetime import date

SLUG = "q4-platform-launch"
NAME = "Q4 Platform Launch"
START = date(2026, 10, 5)  # a Monday

# Each task: id, name, team, owner, duration_days, deps (list of task ids),
# status (done / in_progress / blocked / not_started), pct_complete
# Durations are working days. Dependencies must already be defined above
# a task in this list (keeps the DAG easy to read top to bottom).
TASKS = [
    # --- Foundation phase ---
    dict(id="T01", name="Define platform requirements", team="Engineering",
         owner="R. Kapoor", duration=5, deps=[], status="done", pct=100),
    dict(id="T02", name="Data model & schema design", team="Data",
         owner="S. Ibarra", duration=4, deps=["T01"], status="done", pct=100),
    dict(id="T03", name="Compliance scope review", team="Compliance",
         owner="J. Okafor", duration=6, deps=["T01"], status="in_progress", pct=60),
    dict(id="T04", name="Design system audit", team="Design",
         owner="L. Chen", duration=3, deps=["T01"], status="done", pct=100),
    dict(id="T05", name="Vendor data feed contracts", team="Ops",
         owner="M. Reyes", duration=8, deps=["T01"], status="blocked", pct=20),

    # --- Build phase ---
    dict(id="T06", name="Core ingestion pipeline", team="Data",
         owner="S. Ibarra", duration=7, deps=["T02", "T05"], status="not_started", pct=0),
    dict(id="T07", name="Reporting API layer", team="Engineering",
         owner="R. Kapoor", duration=6, deps=["T02"], status="in_progress", pct=40),
    dict(id="T08", name="KYC / regulatory checks", team="Compliance",
         owner="J. Okafor", duration=5, deps=["T03"], status="not_started", pct=0),
    dict(id="T09", name="Component library build", team="Design",
         owner="L. Chen", duration=5, deps=["T04"], status="in_progress", pct=70),
    dict(id="T10", name="Vendor onboarding & sandbox test", team="Ops",
         owner="M. Reyes", duration=4, deps=["T05"], status="not_started", pct=0),
    dict(id="T11", name="Audit trail logging", team="Engineering",
         owner="A. Novak", duration=4, deps=["T07"], status="not_started", pct=0),
    dict(id="T12", name="Data quality validation rules", team="Data",
         owner="P. Singh", duration=5, deps=["T06"], status="not_started", pct=0),

    # --- Integration phase ---
    dict(id="T13", name="Dashboard front-end build", team="Engineering",
         owner="A. Novak", duration=8, deps=["T07", "T09"], status="not_started", pct=0),
    dict(id="T14", name="Compliance sign-off checkpoint", team="Compliance",
         owner="J. Okafor", duration=2, deps=["T08"], status="not_started", pct=0),
    dict(id="T15", name="Cross-team data reconciliation", team="Data",
         owner="P. Singh", duration=6, deps=["T06", "T10", "T12"], status="not_started", pct=0),
    dict(id="T16", name="Brand & messaging finalization", team="Marketing",
         owner="D. Alvarez", duration=4, deps=["T09"], status="not_started", pct=0),
    dict(id="T17", name="Internal beta access rollout", team="Ops",
         owner="M. Reyes", duration=3, deps=["T10", "T11"], status="not_started", pct=0),
    dict(id="T18", name="Load & performance testing", team="Engineering",
         owner="A. Novak", duration=5, deps=["T13"], status="not_started", pct=0),

    # --- Launch readiness phase ---
    dict(id="T19", name="Regulatory filing submission", team="Compliance",
         owner="J. Okafor", duration=3, deps=["T14", "T15"], status="not_started", pct=0),
    dict(id="T20", name="Customer-facing help docs", team="Marketing",
         owner="D. Alvarez", duration=3, deps=["T16"], status="not_started", pct=0),
    dict(id="T21", name="Launch comms & press plan", team="Marketing",
         owner="D. Alvarez", duration=4, deps=["T16"], status="not_started", pct=0),
    dict(id="T22", name="Production cutover rehearsal", team="Engineering",
         owner="R. Kapoor", duration=3, deps=["T17", "T18"], status="not_started", pct=0),
    dict(id="T23", name="Final data accuracy sign-off", team="Data",
         owner="S. Ibarra", duration=2, deps=["T15"], status="not_started", pct=0),
    dict(id="T24", name="Support team training", team="Ops",
         owner="M. Reyes", duration=3, deps=["T17"], status="not_started", pct=0),

    # --- Launch phase ---
    dict(id="T25", name="Go / no-go readiness review", team="Engineering",
         owner="R. Kapoor", duration=1, deps=["T19", "T22", "T23"], status="not_started", pct=0),
    dict(id="T26", name="Production launch", team="Engineering",
         owner="R. Kapoor", duration=1, deps=["T25", "T20", "T24"], status="not_started", pct=0),
    dict(id="T27", name="Post-launch monitoring window", team="Ops",
         owner="M. Reyes", duration=5, deps=["T26"], status="not_started", pct=0),
    dict(id="T28", name="Press release & launch marketing push", team="Marketing",
         owner="D. Alvarez", duration=2, deps=["T26", "T21"], status="not_started", pct=0),

    # --- Secondary workstreams (lower stakes, feed into main line late) ---
    dict(id="T29", name="Accessibility review", team="Design",
         owner="L. Chen", duration=3, deps=["T09"], status="not_started", pct=0),
    dict(id="T30", name="Analytics event tagging", team="Data",
         owner="P. Singh", duration=3, deps=["T07"], status="not_started", pct=0),
    dict(id="T31", name="Third-party security pen test", team="Compliance",
         owner="J. Okafor", duration=6, deps=["T07"], status="not_started", pct=0),
    dict(id="T32", name="Internal training deck", team="Marketing",
         owner="D. Alvarez", duration=2, deps=["T13"], status="not_started", pct=0),
    dict(id="T33", name="Disaster recovery runbook", team="Engineering",
         owner="A. Novak", duration=4, deps=["T13"], status="not_started", pct=0),
    dict(id="T34", name="Customer support macros", team="Ops",
         owner="M. Reyes", duration=2, deps=["T24"], status="not_started", pct=0),
    dict(id="T35", name="Executive launch briefing", team="Marketing",
         owner="D. Alvarez", duration=1, deps=["T25"], status="not_started", pct=0),
]

# Hand-written stand-ins for what Claude produces, used by narrative.py --mock.
# Only the judgement is written here. Every number (blast radius, teams, days)
# is filled in from analysis.json at render time, so it cannot drift from the
# analysis the way a hard-coded figure would.
MOCK_RISKS = [
    dict(
        task_id="T05",
        why_it_matters=(
            "The ingestion pipeline and data validation can't start until this "
            "contract is signed, and a lot of the program sits behind those. "
            "There's no spare time here, so every day it stays blocked pushes "
            "the launch back a day."
        ),
        mitigation=(
            "Ask legal to fast-track the contract review this week. In "
            "parallel, have Ops line up a backup data source so Engineering "
            "isn't waiting on one vendor."
        ),
    ),
    dict(
        task_id="T07",
        why_it_matters=(
            "It's 40% done and four other pieces of work are waiting on it: "
            "audit logging, the dashboard front-end, analytics tagging and the "
            "security pen test."
        ),
        mitigation=(
            "Move one engineer from the accessibility review (T29), which isn't "
            "urgent yet, onto the reporting API for the next week."
        ),
    ),
    dict(
        task_id="T01",
        why_it_matters=(
            "This is already done. It's on the list because everything else "
            "builds on it, so a gap found here late would mean the most rework."
        ),
        mitigation=(
            "Nothing to do now. If a new requirement comes up, handle it as a "
            "change request rather than reopening T01."
        ),
    ),
]

# Extra per-task prose for the Briefing card, beyond the top three.
MOCK_TASK_BRIEFINGS = {
    "T06": dict(
        why_it_matters=(
            "The ingestion pipeline can't start until the vendor contract is "
            "signed, and it's on the critical path too. Any delay on T05 lands "
            "here in full."
        ),
        mitigation=(
            "Have S. Ibarra start building against a mocked feed now, so the "
            "pipeline can switch to live data as soon as the contract is signed."
        ),
    ),
    "T19": dict(
        why_it_matters=(
            "The regulatory filing has a fixed external window and is on the "
            "critical path. Adding people won't make it go faster."
        ),
        mitigation=(
            "Confirm the filing window with J. Okafor now, and start drafting "
            "the submission while reconciliation is still running."
        ),
    ),
}
