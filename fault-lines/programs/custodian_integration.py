"""
Custodian Integration: connecting a new custodian's account, position and
transaction feeds into the platform.

Story: the task that *looks* worst is not the one that matters most. SFTP
credentials are blocked, which is alarming on a status board, but they have
weeks of float. The quieter problem is transaction ingest: behind pace with
only a few days of float, so it absorbs a short slip and then starts moving
the go-live date.
"""

from datetime import date

SLUG = "custodian-integration"
NAME = "Custodian Integration"
START = date(2026, 11, 2)  # a Monday

TASKS = [
    # --- Foundation ---
    dict(id="C01", name="Custodian API contract & SLA review", team="Ops",
         owner="K. Brennan", duration=5, deps=[], status="done", pct=100),
    dict(id="C02", name="Integration architecture design", team="Engineering",
         owner="T. Oduya", duration=4, deps=["C01"], status="done", pct=100),
    dict(id="C03", name="Custodian-to-internal data mapping", team="Data",
         owner="E. Marsh", duration=8, deps=["C01"], status="in_progress", pct=60),
    dict(id="C04", name="Security & access review", team="Compliance",
         owner="H. Varga", duration=5, deps=["C01"], status="in_progress", pct=70),
    dict(id="C05", name="SFTP & API credential provisioning", team="Ops",
         owner="K. Brennan", duration=3, deps=["C01"], status="blocked", pct=10),

    # --- Build ---
    dict(id="C06", name="Position & balance sync service", team="Engineering",
         owner="T. Oduya", duration=10, deps=["C02", "C03"], status="not_started", pct=0),
    dict(id="C07", name="Transaction ingest pipeline", team="Data",
         owner="E. Marsh", duration=6, deps=["C03"], status="in_progress", pct=35),
    dict(id="C08", name="Reconciliation rules engine", team="Data",
         owner="R. Iyer", duration=6, deps=["C06", "C07"], status="not_started", pct=0),
    dict(id="C09", name="Corporate actions handling", team="Data",
         owner="R. Iyer", duration=4, deps=["C07"], status="not_started", pct=0),
    dict(id="C10", name="Advisor account-status UI design", team="Design",
         owner="M. Castillo", duration=5, deps=["C02"], status="in_progress", pct=30),
    dict(id="C11", name="Exception & break queue", team="Engineering",
         owner="J. Whitfield", duration=4, deps=["C06"], status="not_started", pct=0),
    dict(id="C12", name="Sandbox connectivity test", team="Ops",
         owner="K. Brennan", duration=2, deps=["C05"], status="not_started", pct=0),
    dict(id="C13", name="Entitlements & data access controls", team="Compliance",
         owner="H. Varga", duration=4, deps=["C04", "C06"], status="not_started", pct=0),

    # --- Integration ---
    dict(id="C14", name="End-to-end sync in sandbox", team="Engineering",
         owner="J. Whitfield", duration=4, deps=["C08", "C11", "C12"], status="not_started", pct=0),
    dict(id="C15", name="Historical data backfill", team="Data",
         owner="R. Iyer", duration=5, deps=["C08", "C09"], status="not_started", pct=0),
    dict(id="C16", name="Account onboarding flow build", team="Engineering",
         owner="J. Whitfield", duration=6, deps=["C10"], status="not_started", pct=0),
    dict(id="C17", name="Parallel-run reconciliation", team="Ops",
         owner="S. Adeyemi", duration=10, deps=["C14", "C15"], status="not_started", pct=0),
    dict(id="C18", name="Data lineage compliance review", team="Compliance",
         owner="H. Varga", duration=3, deps=["C13", "C15"], status="not_started", pct=0),
    dict(id="C19", name="Advisor pilot group enablement", team="Marketing",
         owner="N. Laurent", duration=3, deps=["C16"], status="not_started", pct=0),

    # --- Go-live ---
    dict(id="C20", name="Parallel-run sign-off", team="Data",
         owner="E. Marsh", duration=2, deps=["C17"], status="not_started", pct=0),
    dict(id="C21", name="Production credentials & cutover plan", team="Ops",
         owner="S. Adeyemi", duration=2, deps=["C17", "C12"], status="not_started", pct=0),
    dict(id="C22", name="Go-live readiness review", team="Engineering",
         owner="T. Oduya", duration=1, deps=["C20", "C21", "C18"], status="not_started", pct=0),
    dict(id="C23", name="Production cutover", team="Engineering",
         owner="T. Oduya", duration=1, deps=["C22"], status="not_started", pct=0),
    dict(id="C24", name="Hypercare window", team="Ops",
         owner="S. Adeyemi", duration=5, deps=["C23"], status="not_started", pct=0),
    dict(id="C25", name="Advisor comms & release notes", team="Marketing",
         owner="N. Laurent", duration=2, deps=["C19", "C22"], status="not_started", pct=0),

    # --- Supporting workstreams ---
    dict(id="C26", name="Custodian-break support runbook", team="Ops",
         owner="S. Adeyemi", duration=3, deps=["C14"], status="not_started", pct=0),
    dict(id="C27", name="Feed monitoring & alerting", team="Engineering",
         owner="J. Whitfield", duration=3, deps=["C11"], status="not_started", pct=0),
    dict(id="C28", name="Client notification letters", team="Marketing",
         owner="N. Laurent", duration=2, deps=["C18"], status="not_started", pct=0),
]

MOCK_RISKS = [
    dict(
        task_id="C07",
        why_it_matters=(
            "It's only 35% done, and reconciliation, corporate actions and the "
            "historical backfill all need it. It can slip a few days without "
            "moving go-live, so it's easy to overlook until that time is used up."
        ),
        mitigation=(
            "Have E. Marsh ship equity and cash transactions first and leave the "
            "fixed-income edge cases for later. Reconciliation can start on the "
            "partial feed."
        ),
    ),
    dict(
        task_id="C05",
        why_it_matters=(
            "It's blocked, so it will get attention in status meetings. It has "
            "weeks of spare time, though. The sandbox test it unblocks isn't "
            "needed until much later, so it needs a fix but not an emergency."
        ),
        mitigation=(
            "Get a named contact and a date from the custodian's onboarding "
            "desk. Keep the engineers on transaction ingest rather than moving "
            "them onto this."
        ),
    ),
    dict(
        task_id="C03",
        why_it_matters=(
            "The data mapping is on the critical path and the whole build phase "
            "depends on it. It's more than halfway done, but there's no spare "
            "time, so a mapping gap found late moves go-live."
        ),
        mitigation=(
            "Lock down the fields reconciliation needs first. Log everything "
            "else as an improvement for after go-live."
        ),
    ),
]

MOCK_TASK_BRIEFINGS = {
    "C10": dict(
        why_it_matters=(
            "The advisor UI design is only 30% done, but it's on a side branch "
            "with plenty of spare time. It affects the pilot group, not go-live."
        ),
        mitigation=(
            "Let M. Castillo ship a simple account-status view for the pilot and "
            "improve it after cutover."
        ),
    ),
    "C17": dict(
        why_it_matters=(
            "The parallel run is the longest task on the critical path. How "
            "long it takes depends on how many clean cycles the custodian wants "
            "to see, so more people won't shorten it."
        ),
        mitigation=(
            "Agree with the custodian now what counts as a successful parallel "
            "run, so it ends when the evidence is in rather than on a set date."
        ),
    ),
}
