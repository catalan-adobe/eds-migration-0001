#!/usr/bin/env python3
"""
Step 2.2 — Consolidation (the reduce half of the map/reduce).

The per-page scan (map) produced an inconsistent union: block NAMES written many ways
(faq-accordion / faq accordion / accordion) and 1-off proposed rules. This step reduces
that union to a canonical vocabulary.

Split into mechanical vs judgment, kept separate:
  normalize → mechanical only: lowercase + kebab so pure FORMAT variants collapse. Emits
              consolidation-input.json (deduped-by-format blocks + all rules) for the LLM.
  apply     → consume consolidation-map.json (the LLM's semantic merge) and expand it into
              blocks-canonical.json + rules-canonical.json, validating coverage is preserved.

Naming vs variant policy (from the pipeline design): this step collapses naming noise and
settles clearly-distinct blocks. Where it is UNSURE whether two names are the same block in
different variants vs different blocks, it must NOT force the call — it marks them as a
possible_variant_group, deferred to Step 3.5 (which has real DOM from Phase 2).
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

NOVEL_FILE = Path("novel-blocks.json")
INPUT_FILE = Path("consolidation-input.json")
MAP_FILE = Path("consolidation-map.json")
BLOCKS_OUT = Path("blocks-canonical.json")
RULES_OUT = Path("rules-canonical.json")
REPORT_FILE = Path("reports/step2.2-consolidation.md")


def normalize_name(name: str) -> str:
    """Mechanical only: lowercase, non-alnum → hyphen, collapse, strip. Format noise only."""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_novel() -> dict:
    try:
        return json.loads(NOVEL_FILE.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {NOVEL_FILE}: {e}")


def cmd_normalize():
    novel = load_novel()
    inv = novel["block_inventory"]

    merged: dict[str, dict] = {}
    for raw, cids in inv.items():
        norm = normalize_name(raw)
        entry = merged.setdefault(norm, {"aliases": set(), "clusters": set()})
        entry["aliases"].add(raw)
        entry["clusters"].update(cids)

    blocks = []
    for norm, e in sorted(merged.items(), key=lambda x: -len(x[1]["clusters"])):
        blocks.append({
            "normalized": norm,
            "aliases": sorted(e["aliases"]),
            "coverage": len(e["clusters"]),
            "clusters": sorted(e["clusters"]),
        })

    out = {
        "raw_block_names": len(inv),
        "after_format_merge": len(blocks),
        "blocks": blocks,
        "proposed_rules": novel.get("proposed_rules", []),
    }
    INPUT_FILE.write_text(json.dumps(out, indent=2))

    fmt_collapsed = len(inv) - len(blocks)
    print(f"Block names: {len(inv)} raw → {len(blocks)} after format merge "
          f"({fmt_collapsed} pure-format duplicates collapsed)")
    print(f"Proposed rules: {len(out['proposed_rules'])} (semantic merge deferred to LLM)")
    print(f"Wrote {INPUT_FILE} for the LLM consolidation pass.")
    # show the biggest format-merge wins for a quick sanity check
    multi = [b for b in blocks if len(b["aliases"]) > 1][:12]
    if multi:
        print("\nFormat merges (aliases → normalized):")
        for b in multi:
            print(f"  {b['coverage']:3d}  {b['normalized']}  ← {b['aliases']}")


def validate_map(cmap: dict, input_data: dict) -> list[str]:
    """Coverage of canonical blocks must not exceed the union of their sources' clusters."""
    errs = []
    src_clusters = {b["normalized"]: set(b["clusters"]) for b in input_data["blocks"]}
    for cb in cmap.get("canonical_blocks", []):
        members = cb.get("members", [])
        union: set[str] = set()
        for m in members:
            if m not in src_clusters:
                errs.append(f"block {cb.get('name')!r}: unknown member {m!r}")
            union |= src_clusters.get(m, set())
        if cb.get("coverage") not in (None, len(union)):
            errs.append(f"block {cb.get('name')!r}: coverage {cb.get('coverage')} != union {len(union)}")
    return errs


def cmd_apply():
    try:
        cmap = json.loads(MAP_FILE.read_text())
        input_data = json.loads(INPUT_FILE.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read inputs: {e} (run 'normalize' then produce {MAP_FILE})")

    errs = validate_map(cmap, input_data)
    if errs:
        print("Validation errors:")
        for e in errs:
            print(f"  {e}")
        raise SystemExit(1)

    src_clusters = {b["normalized"]: set(b["clusters"]) for b in input_data["blocks"]}
    blocks = []
    for cb in sorted(cmap.get("canonical_blocks", []), key=lambda x: -(x.get("coverage") or 0)):
        union: set[str] = set()
        for m in cb.get("members", []):
            union |= src_clusters.get(m, set())
        blocks.append({
            "name": cb["name"],
            "coverage": len(union),
            "members": cb.get("members", []),
            "possible_variant_group": cb.get("possible_variant_group", False),
            "variant_note": cb.get("variant_note", ""),
            "anchor_hint": cb.get("anchor_hint", ""),
            "clusters": sorted(union),
        })

    BLOCKS_OUT.write_text(json.dumps({
        "raw_block_names": input_data["raw_block_names"],
        "after_format_merge": input_data["after_format_merge"],
        "canonical_blocks": len(blocks),
        "blocks": blocks,
    }, indent=2))

    rules = cmap.get("canonical_rules", [])
    RULES_OUT.write_text(json.dumps({
        "raw_proposed_rules": len(input_data["proposed_rules"]),
        "canonical_rules": len(rules),
        "rules": rules,
    }, indent=2))

    write_report(input_data, blocks, rules)
    print(f"Wrote {BLOCKS_OUT}: {input_data['raw_block_names']} raw names → {len(blocks)} canonical blocks")
    print(f"Wrote {RULES_OUT}: {len(input_data['proposed_rules'])} raw rules → {len(rules)} canonical rules")
    print(f"Wrote {REPORT_FILE}")


def write_report(input_data: dict, blocks: list[dict], rules: list[dict]):
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    variant_groups = [b for b in blocks if b["possible_variant_group"]]
    lines = ["# Step 2.2 — Consolidation Report\n"]
    lines.append(f"- Block names: **{input_data['raw_block_names']}** raw → "
                 f"**{input_data['after_format_merge']}** after format merge → "
                 f"**{len(blocks)}** canonical\n")
    lines.append(f"- Proposed rules: **{len(input_data['proposed_rules'])}** → "
                 f"**{len(rules)}** canonical\n")
    lines.append(f"- Possible variant groups deferred to Step 3.5: **{len(variant_groups)}**\n")

    lines.append("## Canonical blocks by page coverage\n")
    lines.append("| Block | Pages | Members merged | Variant? |")
    lines.append("|-------|-------|----------------|----------|")
    for b in blocks:
        vg = "⚠️ 3.5" if b["possible_variant_group"] else ""
        merged = len(b["members"])
        lines.append(f"| `{b['name']}` | {b['coverage']} | {merged} | {vg} |")
    lines.append("")

    if variant_groups:
        lines.append("## Possible variant groups (deferred to Step 3.5)\n")
        lines.append("These names may be one block with variants OR distinct blocks — "
                     "undecidable without Phase 2 DOM. Not resolved here.\n")
        for b in variant_groups:
            lines.append(f"- `{b['name']}` ({b['coverage']} pages): {b['variant_note']}")
        lines.append("")

    REPORT_FILE.write_text("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description="Step 2.2 consolidation")
    ap.add_argument("mode", choices=["normalize", "apply"])
    args = ap.parse_args()
    if args.mode == "normalize":
        cmd_normalize()
    else:
        cmd_apply()


if __name__ == "__main__":
    main()
