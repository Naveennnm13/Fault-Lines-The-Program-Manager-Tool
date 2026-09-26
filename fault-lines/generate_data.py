"""
generate_data.py

Writes one synthetic cross-team program to tasks.json. Program definitions
live in the `programs/` package; each is hand-authored (not random) so it
tells a coherent story: a few tasks sit on the critical path, a couple of
teams are structural bottlenecks, and a couple of tasks are already blocked or
slipping, which is what the analysis and AI layer will surface.

Run:
  python3 generate_data.py                                   # Q4 Platform Launch -> data/
  python3 generate_data.py --program custodian-integration --data-dir data/programs/custodian-integration

Output: <data-dir>/tasks.json
"""

import argparse
import json
import os

import programs


def build_dataset(program):
    return {
        "program": {
            "slug": program.SLUG,
            "name": program.NAME,
            "start_date": program.START.isoformat(),
            "teams": programs.TEAMS,
        },
        "tasks": program.TASKS,
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--program", default=programs.DEFAULT,
                        help=f"one of: {', '.join(programs.PROGRAMS)}")
    parser.add_argument("--data-dir", default="data")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    program = programs.get(args.program)
    dataset = build_dataset(program)

    os.makedirs(args.data_dir, exist_ok=True)
    path = os.path.join(args.data_dir, "tasks.json")
    with open(path, "w") as f:
        json.dump(dataset, f, indent=2)
    print(f"Wrote {len(program.TASKS)} tasks across {len(programs.TEAMS)} teams to {path}")
