#!/usr/bin/env python3
"""
Turn clusters.json into a human-readable Step 2 report + a feedback scaffold.

Report tiers clusters by actionability:
  A — high confidence: large + pure → proceed to Step 3 as-is
  B — needs review: mid-size or mixed templates → human confirms grouping
  C — long tail: singletons / tiny → project-rule candidates, not templates

Also emits feedback.json: a pre-filled scaffold the operator edits to steer the
next run (accept / split / merge / relabel), consumed by later steps.
"""

import json
from pathlib import Path

CLUSTERS_FILE = Path("clusters.json")
REPORT_FILE = Path("reports/step2-clusters.md")
FEEDBACK_FILE = Path("feedback.json")

# Tier thresholds
BIG_MIN = 30          # >= this many pages → Tier A candidate
MID_MIN = 5           # >= this → Tier B, below → Tier C
PURITY_MIN = 0.80     # dominant-template fraction below this → "mixed", forces review


def purity(cluster: dict) -> float:
    if cluster["size"] == 0:
        return 0.0
    return max(cluster["templates"].values()) / cluster["size"]


def tier_of(cluster: dict) -> str:
    p = purity(cluster)
    if cluster["size"] >= BIG_MIN and p >= PURITY_MIN:
        return "A"
    if cluster["size"] >= MID_MIN:
        return "B"
    if p < PURITY_MIN and cluster["size"] >= MID_MIN:
        return "B"
    return "C"


def templates_str(cluster: dict, limit: int = 4) -> str:
    items = list(cluster["templates"].items())[:limit]
    tail = "" if len(cluster["templates"]) <= limit else ", …"
    return ", ".join(f"{t}×{n}" for t, n in items) + tail


def load_clusters() -> dict:
    try:
        return json.loads(CLUSTERS_FILE.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {CLUSTERS_FILE}: {e}")


def build_report(data: dict) -> tuple[str, list[dict]]:
    clusters = data["clusters"]
    for c in clusters:
        c["_tier"] = tier_of(c)
        c["_purity"] = round(purity(c), 3)

    tiers = {"A": [], "B": [], "C": []}
    for c in clusters:
        tiers[c["_tier"]].append(c)

    total = data["total_files"]
    covered = {t: sum(c["size"] for c in tiers[t]) for t in tiers}

    lines = []
    lines.append("# Step 2 — Cluster Report\n")
    lines.append(f"- **{total}** pages, **{len(clusters)}** structural clusters\n")
    lines.append("## Coverage by tier\n")
    lines.append("| Tier | Meaning | Clusters | Pages | % |")
    lines.append("|------|---------|----------|-------|---|")
    tier_desc = {
        "A": "High confidence — proceed to Step 3 as-is",
        "B": "Needs review — confirm grouping / split mixed",
        "C": "Long tail — project-rule candidates, not templates",
    }
    for t in ("A", "B", "C"):
        pct = round(100 * covered[t] / total, 1) if total else 0
        lines.append(f"| {t} | {tier_desc[t]} | {len(tiers[t])} | {covered[t]} | {pct}% |")
    lines.append("")

    # Tier A
    lines.append("## Tier A — proceed to Step 3\n")
    lines.append("These are large, structurally-pure clusters. Build these block sets first.\n")
    lines.append("| ID | Pages | Templates | Representative |")
    lines.append("|----|-------|-----------|----------------|")
    for c in sorted(tiers["A"], key=lambda x: -x["size"]):
        lines.append(f"| {c['id']} | {c['size']} | {templates_str(c)} | `{c['representative']}` |")
    lines.append("")

    # Tier B
    lines.append("## Tier B — needs review\n")
    lines.append(
        "Mid-size or template-mixed clusters. A mixed cluster is not necessarily wrong — "
        "different template labels can share the same EDS block set. Confirm or split.\n"
    )
    lines.append("| ID | Pages | Purity | Templates | Representative |")
    lines.append("|----|-------|--------|-----------|----------------|")
    for c in sorted(tiers["B"], key=lambda x: -x["size"]):
        flag = " ⚠️" if c["_purity"] < PURITY_MIN else ""
        lines.append(
            f"| {c['id']}{flag} | {c['size']} | {c['_purity']} | "
            f"{templates_str(c)} | `{c['representative']}` |"
        )
    lines.append("")

    # Tier C
    lines.append("## Tier C — long tail (project-rule candidates)\n")
    lines.append(
        f"{len(tiers['C'])} clusters, {covered['C']} pages. These pages are structurally "
        "unique — often the homepage, pricing, or bespoke landing pages where **site-specific "
        "conventions live**. Feed these to the Step 2.1 long-tail scan to flag novel blocks "
        "and propose project rules. Do NOT treat each as its own template.\n"
    )
    # group tier C by dominant template for digestibility
    by_template: dict[str, list[dict]] = {}
    for c in tiers["C"]:
        by_template.setdefault(c["dominant_template"], []).append(c)
    lines.append("| Dominant template | Clusters | Pages |")
    lines.append("|-------------------|----------|-------|")
    for tmpl, cs in sorted(by_template.items(), key=lambda x: -len(x[1])):
        lines.append(f"| {tmpl} | {len(cs)} | {sum(c['size'] for c in cs)} |")
    lines.append("")

    return "\n".join(lines), clusters


def build_feedback_scaffold(clusters: list[dict]) -> dict:
    """Pre-fill an editable feedback scaffold. Operator changes 'action' values."""
    entries = {}
    for c in clusters:
        default = "accept"
        if c["_purity"] < PURITY_MIN and c["size"] >= MID_MIN:
            default = "review"   # mixed mid/large clusters get flagged
        entries[c["id"]] = {
            "action": default,             # accept | review | split | merge_into | relabel
            "target": None,                # cluster id for merge_into
            "label": None,                 # override name for relabel
            "note": "",
            "_tier": c["_tier"],
            "_size": c["size"],
            "_templates": c["templates"],
        }
    return {
        "schema": "step2-feedback/v1",
        "instructions": (
            "Edit 'action' per cluster: accept (keep), review (needs a look), "
            "split (break apart in next run), merge_into (+target id), relabel (+label). "
            "Unchanged 'accept'/'review' entries are informational."
        ),
        "clusters": entries,
    }


def main():
    data = load_clusters()
    report, clusters = build_report(data)

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        REPORT_FILE.write_text(report)
    except OSError as e:
        raise SystemExit(f"Cannot write {REPORT_FILE}: {e}")
    print(f"Wrote {REPORT_FILE}")

    # Only scaffold feedback if it doesn't already exist — never clobber operator edits.
    if FEEDBACK_FILE.exists():
        print(f"{FEEDBACK_FILE} exists — leaving operator edits untouched.")
    else:
        scaffold = build_feedback_scaffold(clusters)
        try:
            FEEDBACK_FILE.write_text(json.dumps(scaffold, indent=2))
        except OSError as e:
            raise SystemExit(f"Cannot write {FEEDBACK_FILE}: {e}")
        print(f"Wrote {FEEDBACK_FILE} (scaffold)")


if __name__ == "__main__":
    main()
