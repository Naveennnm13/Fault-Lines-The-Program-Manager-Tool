"""
Regulatory Reporting Remediation: closing out audit findings against the
firm's regulatory reporting before a fixed regulator deadline.

Story: the bottleneck is a team, not a task. Every workstream converges on a
Compliance evidence pack and attestation, Compliance also owns two of the
at-risk items, and the data lineage work at the front of the critical path is
already behind pace. The deadline is external, so float is the only buffer.
"""

from datetime import date

SLUG = "regulatory-reporting"
NAME = "Regulatory Reporting Remediation"
START = date(2026, 9, 14)  # a Monday

TASKS = [
    # --- Triage & planning ---
    dict(id="R01", name="Audit findings triage", team="Compliance",
         owner="G. Hale", duration=4, deps=[], status="done", pct=100),
    dict(id="R02", name="Remediation plan & regulator commitment", team="Compliance",
         owner="G. Hale", duration=3, deps=["R01"], status="done", pct=100),
    dict(id="R03", name="Reporting data lineage mapping", team="Data",
         owner="Y. Tanaka", duration=8, deps=["R02"], status="in_progress", pct=45),
    dict(id="R04", name="Control inventory & gap assessment", team="Compliance",
         owner="F. Moreau", duration=6, deps=["R02"], status="in_progress", pct=40),
    dict(id="R05", name="Reporting environments & access", team="Ops",
         owner="B. Kowalski", duration=3, deps=["R02"], status="done", pct=100),
    dict(id="R06", name="Data retention policy rewrite", team="Compliance",
         owner="F. Moreau", duration=5, deps=["R04"], status="not_started", pct=0),

    # --- Build ---
    dict(id="R07", name="Source-system extract fixes", team="Engineering",
         owner="D. Osei", duration=7, deps=["R03", "R05"], status="not_started", pct=0),
    dict(id="R08", name="Data quality controls on reportable fields", team="Data",
         owner="Y. Tanaka", duration=6, deps=["R03"], status="not_started", pct=0),
    dict(id="R09", name="Report template redesign", team="Design",
         owner="A. Lindqvist", duration=4, deps=["R02"], status="in_progress", pct=60),
    dict(id="R10", name="Automated control testing harness", team="Engineering",
         owner="C. Park", duration=5, deps=["R04", "R05"], status="not_started", pct=0),
    dict(id="R11", name="Maker-checker for manual adjustments", team="Engineering",
         owner="C. Park", duration=5, deps=["R04"], status="not_started", pct=0),
    dict(id="R12", name="Evidence repository & retention setup", team="Ops",
         owner="B. Kowalski", duration=4, deps=["R06"], status="blocked", pct=0),
    dict(id="R13", name="Reporting calculation rewrite", team="Data",
         owner="V. Mensah", duration=8, deps=["R07", "R08"], status="not_started", pct=0),

    # --- Validation ---
    dict(id="R14", name="Parallel report generation, old vs new", team="Data",
         owner="V. Mensah", duration=5, deps=["R13"], status="not_started", pct=0),
    dict(id="R15", name="Variance investigation & sign-off", team="Data",
         owner="Y. Tanaka", duration=4, deps=["R14"], status="not_started", pct=0),
    dict(id="R16", name="Control testing, cycle 1", team="Compliance",
         owner="F. Moreau", duration=5, deps=["R10", "R11"], status="not_started", pct=0),
    dict(id="R17", name="Control test remediation", team="Engineering",
         owner="D. Osei", duration=4, deps=["R16"], status="not_started", pct=0),
    dict(id="R18", name="Control testing, cycle 2", team="Compliance",
         owner="F. Moreau", duration=3, deps=["R17"], status="not_started", pct=0),
    dict(id="R19", name="Report template UAT", team="Design",
         owner="A. Lindqvist", duration=3, deps=["R09", "R13"], status="not_started", pct=0),
    dict(id="R20", name="Evidence pack assembly", team="Compliance",
         owner="G. Hale", duration=4, deps=["R12", "R15", "R18"], status="not_started", pct=0),
    dict(id="R21", name="Internal audit walkthrough", team="Compliance",
         owner="G. Hale", duration=3, deps=["R20"], status="not_started", pct=0),

    # --- Submission ---
    dict(id="R22", name="Executive attestation", team="Compliance",
         owner="G. Hale", duration=1, deps=["R21", "R19"], status="not_started", pct=0),
    dict(id="R23", name="Regulator submission", team="Compliance",
         owner="G. Hale", duration=1, deps=["R22"], status="not_started", pct=0),
    dict(id="R24", name="Post-submission monitoring", team="Ops",
         owner="B. Kowalski", duration=5, deps=["R23"], status="not_started", pct=0),
    dict(id="R25", name="Board risk committee update", team="Marketing",
         owner="P. Achebe", duration=2, deps=["R22"], status="not_started", pct=0),

    # --- Supporting workstreams ---
    dict(id="R26", name="Staff training on new controls", team="Ops",
         owner="B. Kowalski", duration=3, deps=["R18"], status="not_started", pct=0),
    dict(id="R27", name="Client disclosure updates", team="Marketing",
         owner="P. Achebe", duration=3, deps=["R15"], status="not_started", pct=0),
    dict(id="R28", name="Control operating runbooks", team="Ops",
         owner="B. Kowalski", duration=3, deps=["R17"], status="not_started", pct=0),
    dict(id="R29", name="Lessons-learned review", team="Design",
         owner="A. Lindqvist", duration=2, deps=["R23"], status="not_started", pct=0),
    dict(id="R30", name="Regulator follow-up comms plan", team="Marketing",
         owner="P. Achebe", duration=2, deps=["R21"], status="not_started", pct=0),
]

MOCK_RISKS = [
    dict(
        task_id="R03",
        why_it_matters=(
            "Data lineage mapping is only 45% done and it's near the start of "
            "the critical path. The extract fixes, the calculation rewrite and "
            "the parallel run all wait on it, and the regulator's deadline is fixed."
        ),
        mitigation=(
            "Map the fields named in the audit findings first. Y. Tanaka can hand "
            "those to Engineering this week and finish the rest alongside."
        ),
    ),
    dict(
        task_id="R04",
        why_it_matters=(
            "The control gap assessment is only 40% done. Compliance owns it, and "
            "also owns control testing, the evidence pack and the sign-off. It "
            "has some spare time, but the same few people are needed for all of it."
        ),
        mitigation=(
            "Borrow a reviewer from internal audit for the gap assessment, so "
            "F. Moreau is free for control testing when the test harness is ready."
        ),
    ),
    dict(
        task_id="R12",
        why_it_matters=(
            "The evidence repository is blocked until the new retention policy "
            "is written. There's time on the calendar, but the evidence pack "
            "needs somewhere to live before it can be assembled."
        ),
        mitigation=(
            "Set up the repository under the current retention policy now, and "
            "move it over once the new policy is agreed. There's no need to wait "
            "for R06."
        ),
    ),
]

MOCK_TASK_BRIEFINGS = {
    "R13": dict(
        why_it_matters=(
            "The calculation rewrite is the longest build task on the critical "
            "path. It can't start until both the extract fixes and the data "
            "quality controls are done."
        ),
        mitigation=(
            "Have V. Mensah start on the calculations that use the cleanest "
            "source extracts while the other fixes are finished."
        ),
    ),
    "R20": dict(
        why_it_matters=(
            "Variance sign-off, control testing and the evidence repository all "
            "feed into this. A slip in any of them shows up here, and then in "
            "the submission date."
        ),
        mitigation=(
            "Build the evidence pack as each piece of work finishes, rather than "
            "all at once at the end."
        ),
    ),
}
