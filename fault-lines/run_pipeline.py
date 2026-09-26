"""
run_pipeline.py — runs generate_data.py, analyze.py, narrative.py in order,
once per program in the `programs/` package.

Usage:
  python3 run_pipeline.py              # narrative uses live API if ANTHROPIC_API_KEY is set, else falls back to mock
  python3 run_pipeline.py --mock       # force the mock narrative (no API key needed)

Output:
  data/programs/<slug>/{tasks,analysis,narrative}.json   one set per program
  data/programs/index.json                               the program list, for the UI's picker
  data/{tasks,analysis,narrative}.json                   the default program, for dashboard.html
"""
import json
import os
import shutil
import subprocess
import sys

import programs

FILES = ["tasks.json", "analysis.json", "narrative.json"]
narrative_flags = ["--mock"] if "--mock" in sys.argv else []


def run_step(args):
    cmd = [sys.executable] + args
    print(f"\n$ {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)


index = []
for slug, program in programs.PROGRAMS.items():
    data_dir = os.path.join("data", "programs", slug)
    run_step(["generate_data.py", "--program", slug, "--data-dir", data_dir])
    run_step(["analyze.py", "--data-dir", data_dir])
    run_step(["narrative.py", "--data-dir", data_dir, *narrative_flags])
    index.append({"slug": slug, "name": program.NAME, "task_count": len(program.TASKS)})

with open(os.path.join("data", "programs", "index.json"), "w") as f:
    json.dump({"default": programs.DEFAULT, "programs": index}, f, indent=2)

# The original single-program dashboard reads data/*.json directly.
for name in FILES:
    shutil.copyfile(os.path.join("data", "programs", programs.DEFAULT, name),
                    os.path.join("data", name))

print(f"\nDone. {len(index)} programs written to data/programs/.")
print("Serve the folder and open dashboard.html, e.g.:")
print("  python3 -m http.server 8000")
print("  then visit http://localhost:8000/dashboard.html")
