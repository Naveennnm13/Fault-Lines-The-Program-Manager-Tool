"""
analyze.py

Loads data/tasks.json, builds the dependency DAG, and runs three analyses:

1. Critical Path Method (CPM): forward pass for earliest start/finish,
   backward pass for latest start/finish, slack = latest_start - earliest_start.
   Tasks with zero slack are on the critical path.
2. Bottleneck scoring: a task is a structural bottleneck if a lot of
   downstream work depends on it (high "blast radius") AND it currently
   carries schedule risk (blocked, or behind on percent complete for its
   elapsed duration).
3. Cascade simulation: for a given task and a delay in days, propagate
   the delay through every downstream task and report the new program
   end date and which teams absorb the hit.

Run: python3 analyze.py [--data-dir data]
Output: <data-dir>/analysis.json
"""

import argparse
import json
import os

import networkx as nx


def load_tasks(data_dir):
    with open(os.path.join(data_dir, "tasks.json")) as f:
        return json.load(f)


def build_graph(tasks):
    g = nx.DiGraph()
    for t in tasks:
        g.add_node(t["id"], **t)
    for t in tasks:
        for dep in t["deps"]:
            g.add_edge(dep, t["id"])
    if not nx.is_directed_acyclic_graph(g):
        cycle = nx.find_cycle(g)
        raise ValueError(f"Dependency graph has a cycle: {cycle}")
    return g


def critical_path_method(g):
    order = list(nx.topological_sort(g))
    earliest_start, earliest_finish = {}, {}

    for node in order:
        preds = list(g.predecessors(node))
        earliest_start[node] = max((earliest_finish[p] for p in preds), default=0)
        earliest_finish[node] = earliest_start[node] + g.nodes[node]["duration"]

    program_length = max(earliest_finish.values())

    latest_finish, latest_start = {}, {}
    for node in reversed(order):
        succs = list(g.successors(node))
        latest_finish[node] = min((latest_start[s] for s in succs), default=program_length)
        latest_start[node] = latest_finish[node] - g.nodes[node]["duration"]

    slack = {n: latest_start[n] - earliest_start[n] for n in g.nodes}
    critical_path = [n for n in order if slack[n] == 0]

    return {
        "program_length_days": program_length,
        "earliest_start": earliest_start,
        "earliest_finish": earliest_finish,
        "latest_start": latest_start,
        "latest_finish": latest_finish,
        "slack": slack,
        "critical_path": critical_path,
    }


def blast_radius(g, node):
    """How many downstream tasks (direct + indirect) depend on this node."""
    return len(nx.descendants(g, node))


def is_at_risk(task):
    if task["status"] == "blocked":
        return True
    if task["status"] == "in_progress" and task["pct"] < 50:
        return True
    return False


def bottleneck_scores(g, cpm):
    scores = []
    for node in g.nodes:
        task = g.nodes[node]
        radius = blast_radius(g, node)
        at_risk = is_at_risk(task)
        on_critical_path = node in cpm["critical_path"]
        # Weighted score: reach matters, but reach + current risk matters more.
        score = radius * (2.5 if at_risk else 1.0) * (1.5 if on_critical_path else 1.0)
        scores.append({
            "id": node,
            "name": task["name"],
            "team": task["team"],
            "owner": task["owner"],
            "status": task["status"],
            "pct": task["pct"],
            "blast_radius": radius,
            "on_critical_path": on_critical_path,
            "at_risk": at_risk,
            "score": round(score, 1),
        })
    scores.sort(key=lambda s: s["score"], reverse=True)
    return scores


def team_bottleneck_load(g, cpm):
    """Aggregate critical-path task count and total blast radius per team."""
    load = {}
    for node in g.nodes:
        task = g.nodes[node]
        team = task["team"]
        load.setdefault(team, {"critical_path_tasks": 0, "total_blast_radius": 0, "at_risk_tasks": 0})
        if node in cpm["critical_path"]:
            load[team]["critical_path_tasks"] += 1
        load[team]["total_blast_radius"] += blast_radius(g, node)
        if is_at_risk(task):
            load[team]["at_risk_tasks"] += 1
    return load


def simulate_delay(g, cpm, task_id, delay_days):
    """
    Push a task's duration out by delay_days and recompute earliest_finish
    for every descendant. Returns the new program end date and the shift
    experienced by each affected team.
    """
    descendants = nx.descendants(g, task_id) | {task_id}
    order = [n for n in nx.topological_sort(g) if n in descendants or True]

    new_finish = dict(cpm["earliest_finish"])
    new_start = dict(cpm["earliest_start"])
    new_finish[task_id] = cpm["earliest_finish"][task_id] + delay_days

    for node in order:
        if node == task_id:
            continue
        preds = list(g.predecessors(node))
        if not preds:
            continue
        candidate_start = max(new_finish.get(p, cpm["earliest_finish"][p]) for p in preds)
        if candidate_start > new_start[node]:
            new_start[node] = candidate_start
            new_finish[node] = candidate_start + g.nodes[node]["duration"]

    old_program_length = cpm["program_length_days"]
    new_program_length = max(new_finish.values())
    slip = new_program_length - old_program_length

    affected_teams = {}
    for node in g.nodes:
        shift = new_finish[node] - cpm["earliest_finish"][node]
        if shift > 0:
            team = g.nodes[node]["team"]
            affected_teams[team] = max(affected_teams.get(team, 0), shift)

    affected_tasks = [
        {"id": n, "name": g.nodes[n]["name"], "team": g.nodes[n]["team"],
         "shift_days": new_finish[n] - cpm["earliest_finish"][n]}
        for n in g.nodes if new_finish[n] > cpm["earliest_finish"][n]
    ]
    affected_tasks.sort(key=lambda a: -a["shift_days"])

    return {
        "task_id": task_id,
        "delay_days": delay_days,
        "old_program_length_days": old_program_length,
        "new_program_length_days": new_program_length,
        "program_slip_days": slip,
        "affected_teams": affected_teams,
        "affected_tasks": affected_tasks,
    }


def run(data_dir):
    dataset = load_tasks(data_dir)
    g = build_graph(dataset["tasks"])
    cpm = critical_path_method(g)
    scores = bottleneck_scores(g, cpm)
    team_load = team_bottleneck_load(g, cpm)

    # Pre-run cascade simulations for the top 3 bottleneck tasks at a
    # representative 3-day delay, so the dashboard and the AI narrative
    # both have concrete "what if" scenarios to point to.
    top_bottlenecks = scores[:3]
    # A completed task can still top the score (it has the most downstream
    # reach), but nobody can delay finished work. Make sure the highest-scoring
    # *open* task always has a scenario too, since that is the one the
    # narrative leads with.
    top_open = next((s for s in scores if s["status"] != "done"), None)
    if top_open and top_open["id"] not in {b["id"] for b in top_bottlenecks}:
        top_bottlenecks = top_bottlenecks + [top_open]
    scenarios = [simulate_delay(g, cpm, b["id"], 3) for b in top_bottlenecks]

    analysis = {
        "cpm": {
            "program_length_days": cpm["program_length_days"],
            "critical_path": cpm["critical_path"],
            "slack": cpm["slack"],
            "earliest_finish": cpm["earliest_finish"],
        },
        "bottleneck_scores": scores,
        "team_bottleneck_load": team_load,
        "sample_delay_scenarios": scenarios,
    }

    path = os.path.join(data_dir, "analysis.json")
    with open(path, "w") as f:
        json.dump(analysis, f, indent=2)

    print(f"Program: {dataset['program']['name']}")
    print(f"Program length: {cpm['program_length_days']} working days")
    print(f"Critical path ({len(cpm['critical_path'])} tasks): {' -> '.join(cpm['critical_path'])}")
    print("\nTop 5 bottleneck tasks:")
    for s in scores[:5]:
        flag = "AT RISK" if s["at_risk"] else "on track"
        print(f"  {s['id']} [{s['team']:>11}] {s['name']:<35} score={s['score']:<6} ({flag})")
    print(f"\nWrote {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data")
    run(parser.parse_args().data_dir)
