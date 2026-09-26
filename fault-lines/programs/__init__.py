"""
Program registry.

Each program is a module exporting SLUG, NAME, START, TASKS, and optionally
MOCK_RISKS / MOCK_TASK_BRIEFINGS for narrative.py's no-API-key mode. All
programs share the same six teams, as they would inside one organisation.

To add a program, drop a module in this package and list it below.
"""

from . import custodian_integration, q4_platform_launch, regulatory_reporting

TEAMS = ["Engineering", "Data", "Design", "Compliance", "Ops", "Marketing"]

# Order is the order the UI's program picker shows them in.
PROGRAMS = {
    m.SLUG: m
    for m in (q4_platform_launch, custodian_integration, regulatory_reporting)
}

DEFAULT = q4_platform_launch.SLUG


def get(slug):
    try:
        return PROGRAMS[slug]
    except KeyError:
        known = ", ".join(PROGRAMS)
        raise SystemExit(f"Unknown program '{slug}'. Known programs: {known}")
