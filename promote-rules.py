#!/usr/bin/env python3
"""
Rule promotion gate (pipeline principle: scope is earned, never self-declared).

Reads scan-proposed rules from novel-blocks.json, applies the promotion policy + operator
feedback, and appends accepted rules to the correct rulebook file.

Enforced mechanically:
  1. A scan may only propose scope project|pipeline. A proposed scope:generic is REJECTED
     and held for rescoping — a single site cannot justify a universal rule.
  2. decision_type:team-decision requires explicit operator sign-off before confirming.
  3. Promotion to scope:generic requires cross-site provenance (>=2 distinct sites) and is
     only reachable via feedback action 'promote_generic', never from a scan.

Modes:
  plan    → write reports/step2.1-promotion.md + scaffold rule-feedback.json (no writes to rules)
  apply   → consume rule-feedback.json, append confirmed rules to rules/*.yaml
"""

import argparse
import json
import textwrap
from pathlib import Path

CANONICAL_FILE = Path("rules-canonical.json")
RULES_DIR = Path("rules")
FEEDBACK_FILE = Path("rule-feedback.json")
REPORT_FILE = Path("reports/step2.1-promotion.md")
PROJECT_FILE = "knack.yaml"          # target for scope:project
PIPELINE_FILE = "pipeline-rules.yaml"  # target for scope:pipeline (avoid Erda schema name clash)
GENERIC_FILE = "generic.yaml"        # target for scope:generic (promotion only)

SCOPE_FILE = {"project": PROJECT_FILE, "pipeline": PIPELINE_FILE, "generic": GENERIC_FILE}


def load_proposed() -> list[dict]:
    """Load the canonical rule set (Step 2.2 output) — the promotion input."""
    try:
        return json.loads(CANONICAL_FILE.read_text()).get("rules", [])
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {CANONICAL_FILE}: {e}")


def gate(rule: dict) -> tuple[str, str]:
    """Return (default_action, reason) enforcing the promotion policy on a scan proposal."""
    scope = rule.get("scope")
    if scope == "generic":
        return "rescope", "scan self-declared generic — not allowed; choose project or pipeline"
    if scope not in ("project", "pipeline"):
        return "rescope", f"invalid/missing scope {scope!r} — choose project or pipeline"
    if rule.get("decision_type") == "team-decision":
        return "hold", "team-decision — needs operator sign-off (confirm the chosen modeling)"
    return "accept", "convention at a local scope — accept to confirm"


def cmd_plan(rules: list[dict]):
    rows = []
    scaffold = {}
    for r in rules:
        action, reason = gate(r)
        rows.append((r["id"], r.get("scope", "?"), r.get("decision_type", "convention"),
                     action, reason))
        scaffold[r["id"]] = {
            "action": action,                 # accept | rescope | hold | reject | promote_generic
            "scope": r.get("scope"),          # edit when action == rescope
            "signoff": None,                   # required when action in (hold->accept, promote_generic)
            "sites": [],                       # required for promote_generic (>=2 distinct)
            "note": "",
        }

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = ["# Step 2.1 — Rule Promotion Plan\n"]
    lines.append(f"{len(rules)} proposed rules from the long-tail scan.\n")
    lines.append("| Rule | Proposed scope | decision_type | Default action | Why |")
    lines.append("|------|----------------|---------------|----------------|-----|")
    for rid, scope, dt, action, reason in rows:
        lines.append(f"| `{rid}` | {scope} | {dt} | **{action}** | {reason} |")
    lines.append("\nEdit `rule-feedback.json` then run `promote-rules.py apply`.\n")
    lines.append("- **accept**: confirm at its proposed local scope.\n"
                 "- **rescope**: fix `scope` to project|pipeline, then it's accepted.\n"
                 "- **hold**: team-decision; set `signoff` to confirm the chosen modeling.\n"
                 "- **promote_generic**: only with `sites` (>=2 distinct) + `signoff`.\n"
                 "- **reject**: drop it.")
    REPORT_FILE.write_text("\n".join(lines))
    print(f"Wrote {REPORT_FILE}")

    if FEEDBACK_FILE.exists():
        print(f"{FEEDBACK_FILE} exists — leaving operator edits untouched.")
    else:
        FEEDBACK_FILE.write_text(json.dumps(
            {"schema": "rule-promotion/v1", "decisions": scaffold}, indent=2))
        print(f"Wrote {FEEDBACK_FILE} (scaffold)")


def fold(key: str, text: str, indent: int = 4) -> str:
    """Emit a YAML folded block scalar for prose fields."""
    pad = " " * indent
    cpad = " " * (indent + 2)
    wrapped = textwrap.wrap(" ".join(text.split()), width=88) or [""]
    body = "\n".join(cpad + line for line in wrapped)
    return f"{pad}{key}: >\n{body}"


def serialize_rule(r: dict) -> str:
    """Serialize one confirmed rule as a YAML list item matching the rulebook style."""
    out = [f"  - id: {r['id']}"]
    out.append(f"    scope: {r['scope']}")
    out.append(f"    decision_type: {r.get('decision_type', 'convention')}")
    out.append(f"    category: {r.get('category', 'structure')}")
    out.append("    status: confirmed")
    out.append(f"    priority: {r.get('priority', 50)}")
    out.append(fold("trigger", r.get("trigger", "")))
    out.append(fold("decision", r.get("decision", "")))
    out.append(fold("rationale", r.get("rationale", "")))
    prov = r.get("provenance", {})
    out.append("    provenance:")
    for k in ("origin", "evidence", "added", "version"):
        if k in prov:
            out.append(f"      {k}: {json.dumps(prov[k]) if k == 'evidence' else prov[k]}")
    if r.get("scope") == "generic" and prov.get("sites"):
        out.append(f"      sites: {json.dumps(prov['sites'])}")
    return "\n".join(out)


def append_rule(target: str, rule_id: str, rule_yaml: str) -> bool:
    """Append a rule to its target file. Idempotent: skip if the id already exists."""
    path = RULES_DIR / target
    if not path.exists():
        path.write_text(
            f"# EDS Migration Rulebook — {target.replace('.yaml', '')} scope\n"
            "# Auto-appended by promote-rules.py. See rules/README.md.\n\n"
            "version: 1\n\nrules:\n")
    elif f"- id: {rule_id}\n" in path.read_text():
        return False
    with path.open("a") as f:
        f.write(rule_yaml + "\n")
    return True


def cmd_apply(rules: list[dict]):
    if not FEEDBACK_FILE.exists():
        raise SystemExit(f"No {FEEDBACK_FILE} — run 'plan' first, then edit it.")
    try:
        decisions = json.loads(FEEDBACK_FILE.read_text()).get("decisions", {})
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {FEEDBACK_FILE}: {e}")
    by_id = {r["id"]: r for r in rules}

    confirmed, held, rejected, skipped, errors = [], [], [], [], []
    for rid, d in decisions.items():
        rule = by_id.get(rid)
        if not rule:
            errors.append(f"{rid}: not in {CANONICAL_FILE}")
            continue
        action = d.get("action")
        if action == "reject":
            rejected.append(rid)
            continue
        if action == "hold":
            held.append(rid)
            continue
        if action == "rescope":
            new_scope = d.get("scope")
            if new_scope not in ("project", "pipeline"):
                errors.append(f"{rid}: rescope needs scope project|pipeline, got {new_scope!r}")
                continue
            rule = {**rule, "scope": new_scope}
        elif action == "promote_generic":
            sites = d.get("sites") or []
            if len(set(sites)) < 2:
                errors.append(f"{rid}: promote_generic needs >=2 distinct sites, got {sites}")
                continue
            if not d.get("signoff"):
                errors.append(f"{rid}: promote_generic needs signoff")
                continue
            rule = {**rule, "scope": "generic",
                    "provenance": {**rule.get("provenance", {}), "sites": sites,
                                   "signoff": d["signoff"]}}
        elif action == "accept":
            if rule.get("scope") == "generic":
                errors.append(f"{rid}: cannot accept a scan-proposed generic — rescope first")
                continue
        else:
            errors.append(f"{rid}: unknown action {action!r}")
            continue

        if rule.get("decision_type") == "team-decision" and not d.get("signoff"):
            errors.append(f"{rid}: team-decision requires signoff to confirm")
            continue

        target = SCOPE_FILE.get(rule["scope"])
        if not target:
            errors.append(f"{rid}: no target file for scope {rule['scope']!r}")
            continue
        if append_rule(target, rid, serialize_rule(rule)):
            confirmed.append((rid, rule["scope"], target))
        else:
            skipped.append(rid)

    print(f"Confirmed {len(confirmed)}:")
    for rid, scope, target in confirmed:
        print(f"  {rid} → {scope} ({target})")
    if skipped:
        print(f"Skipped (already present): {', '.join(skipped)}")
    if held:
        print(f"Held (need sign-off): {', '.join(held)}")
    if rejected:
        print(f"Rejected: {', '.join(rejected)}")
    if errors:
        print("Errors:")
        for e in errors:
            print(f"  {e}")
        raise SystemExit(1)


def main():
    ap = argparse.ArgumentParser(description="Rule promotion gate")
    ap.add_argument("mode", choices=["plan", "apply"])
    args = ap.parse_args()
    rules = load_proposed()
    if args.mode == "plan":
        cmd_plan(rules)
    else:
        cmd_apply(rules)


if __name__ == "__main__":
    main()
