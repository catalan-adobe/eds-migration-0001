#!/usr/bin/env python3
"""
Step 2.1 — Long-tail scan harness.

Selects the representatives an LLM must inspect (Tier C long-tail + Tier B mixed),
assembles a self-contained analysis packet for each (rulebook + visual tree), and
collects LLM verdicts into novel-blocks.json + a report.

This script does NOT call the LLM. It prepares packets and merges results, keeping the
mechanical work in Python and the judgment in the LLM step. Run modes:

  prepare  → write packets/*.json (one per representative to analyze)
  sample   → print N packets to stdout for inline/manual analysis
  collect  → read verdicts/*.json, merge into novel-blocks.json + report
"""

import argparse
import json
from pathlib import Path

CLUSTERS_FILE = Path("clusters.json")
RULES_DIR = Path("rules")
TREES_DIR = Path("visual-trees")
PACKETS_DIR = Path("packets")
VERDICTS_DIR = Path("verdicts")
NOVEL_FILE = Path("novel-blocks.json")
REPORT_FILE = Path("reports/step2.1-longtail.md")

PURITY_MIN = 0.80
MID_MIN = 5
BIG_MIN = 30


def purity(c: dict) -> float:
    return max(c["templates"].values()) / c["size"] if c["size"] else 0.0


def tier_of(c: dict) -> str:
    p = purity(c)
    if c["size"] >= BIG_MIN and p >= PURITY_MIN:
        return "A"
    if c["size"] >= MID_MIN:
        return "B"
    return "C"


def load_clusters() -> list[dict]:
    try:
        return json.loads(CLUSTERS_FILE.read_text())["clusters"]
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {CLUSTERS_FILE}: {e}")


def load_rulebook() -> str:
    """Concatenate confirmed rules from all rule files as prompt context."""
    parts = []
    for f in sorted(RULES_DIR.glob("*.yaml")):
        parts.append(f"# ===== {f.name} =====\n{f.read_text()}")
    return "\n\n".join(parts) if parts else "(no rulebook found)"


def tree_textformat(fname: str) -> str:
    path = TREES_DIR / fname
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        return f"(cannot load {fname}: {e})"
    return data.get("textFormat", "(no textFormat in tree)")


def select_representatives(clusters: list[dict]) -> list[dict]:
    """Tier C (all) + Tier B mixed (purity < threshold) → the pages needing LLM eyes."""
    selected = []
    for c in clusters:
        t = tier_of(c)
        if t == "C" or (t == "B" and purity(c) < PURITY_MIN):
            selected.append(c)
    return selected


def build_packet(cluster: dict, rulebook: str) -> dict:
    return {
        "cluster_id": cluster["id"],
        "representative": cluster["representative"],
        "size": cluster["size"],
        "dominant_template": cluster["dominant_template"],
        "templates": cluster["templates"],
        "rulebook": rulebook,
        "visual_tree": tree_textformat(cluster["representative"]),
        "task": (
            "Using the rulebook, map this page's visual tree to EDS structure. "
            "Identify each block/default-content/section. Then flag any pattern NOT already "
            "covered by a confirmed rule as a candidate rule (status: proposed) with evidence. "
            "CONSTRAINTS on proposed rules: (1) scope MUST be 'project' (a site-specific "
            "convention) or 'pipeline' (an artifact of how WE captured/analyzed, e.g. content "
            "under-rendered by the minWidth capture) — NEVER 'generic'; a single site cannot "
            "justify a universal rule. (2) Set decision_type: 'convention' only for a near-"
            "objective mapping; use 'team-decision' when you are choosing among several valid "
            "EDS modelings, and name the alternatives you did NOT pick in the rationale. "
            "Output must match the verdict schema."
        ),
    }


def cmd_prepare(clusters: list[dict], rulebook: str):
    reps = select_representatives(clusters)
    PACKETS_DIR.mkdir(parents=True, exist_ok=True)
    for c in reps:
        packet = build_packet(c, rulebook)
        (PACKETS_DIR / f"{c['id']}.json").write_text(json.dumps(packet, indent=2))
    print(f"Wrote {len(reps)} packets to {PACKETS_DIR}/")


def cmd_sample(clusters: list[dict], rulebook: str, n: int, diverse: bool):
    reps = select_representatives(clusters)
    if diverse:
        # one per dominant template, to maximize structural variety in the sample
        seen = set()
        picked = []
        for c in reps:
            if c["dominant_template"] not in seen:
                seen.add(c["dominant_template"])
                picked.append(c)
            if len(picked) >= n:
                break
        reps = picked
    else:
        reps = reps[:n]
    for c in reps:
        packet = build_packet(c, rulebook)
        print(json.dumps(packet, indent=2))
        print("\n" + "=" * 80 + "\n")


def cmd_collect(clusters: list[dict]):
    if not VERDICTS_DIR.exists():
        raise SystemExit(f"No {VERDICTS_DIR}/ — run the LLM step first.")
    verdicts = []
    for f in sorted(VERDICTS_DIR.glob("*.json")):
        try:
            verdicts.append(json.loads(f.read_text()))
        except json.JSONDecodeError as e:
            print(f"SKIP {f.name}: {e}")

    # aggregate proposed rules and novel blocks
    proposed_rules: dict[str, dict] = {}
    novel_blocks: dict[str, list[str]] = {}
    for v in verdicts:
        for r in v.get("proposed_rules", []):
            proposed_rules.setdefault(r["id"], r)
        for b in v.get("blocks", []):
            novel_blocks.setdefault(b, []).append(v["cluster_id"])

    out = {
        "verdicts_processed": len(verdicts),
        "block_inventory": {b: sorted(set(cids)) for b, cids in sorted(novel_blocks.items())},
        "proposed_rules": list(proposed_rules.values()),
    }
    NOVEL_FILE.write_text(json.dumps(out, indent=2))
    print(f"Wrote {NOVEL_FILE}: {len(novel_blocks)} block types, "
          f"{len(proposed_rules)} proposed rules")


def main():
    ap = argparse.ArgumentParser(description="Step 2.1 long-tail scan harness")
    ap.add_argument("mode", choices=["prepare", "sample", "collect"])
    ap.add_argument("-n", type=int, default=5, help="sample size")
    ap.add_argument("--diverse", action="store_true",
                    help="sample one representative per dominant template")
    args = ap.parse_args()

    clusters = load_clusters()
    if args.mode == "collect":
        cmd_collect(clusters)
        return
    rulebook = load_rulebook()
    if args.mode == "prepare":
        cmd_prepare(clusters, rulebook)
    else:
        cmd_sample(clusters, rulebook, args.n, args.diverse)


if __name__ == "__main__":
    main()
