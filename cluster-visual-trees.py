#!/usr/bin/env python3
"""
Cluster visual tree JSON files by structural similarity.

Fingerprint = depth-limited walk of the DOM tree extracting
(tag, layout-grid, bg-type, height-bucket, key-class-tokens) per node,
ignoring overlays and text content.
"""

import json
import os
import re
from collections import defaultdict
from pathlib import Path

VISUAL_TREES_DIR = Path("visual-trees")
OUTPUT_FILE = Path("clusters.json")

# Height buckets (px)
def height_bucket(h):
    if h < 80:   return "xs"
    if h < 400:  return "sm"
    if h < 1500: return "md"
    if h < 5000: return "lg"
    return "xl"

# Extract meaningful class tokens from a CSS selector
NOISE_TOKENS = {"d-none", "d-md-block", "d-flex", "flex-column", "fix-custom-post",
                "text-center", "w-100", "m-auto", "d-block", "row"}

def class_tokens(selector: str) -> frozenset:
    # Extract class names from selector like "#post-123 > div > div.foo.bar"
    tokens = set()
    for part in re.findall(r'\.([\w-]+)', selector):
        if part not in NOISE_TOKENS and not re.match(r'^(wp-|col-|mb-|mt-|py-|px-|p-|m-)', part):
            tokens.add(part)
    return frozenset(tokens)

def node_token(node: dict, nm_entry: dict | None) -> str:
    """Single node → compact token string."""
    tag = node.get("tag", "?")
    layout = node.get("layout", "")
    grid = layout if layout else ""

    bg = ""
    bg_data = node.get("background") or (nm_entry or {}).get("background")
    if bg_data:
        bg = bg_data.get("type", "")

    bounds = node.get("bounds", {})
    h = bounds.get("height", bounds.get("h", 0))
    hb = height_bucket(h)

    sel = node.get("selector", "")
    tokens = class_tokens(sel)
    cls = "+".join(sorted(tokens)) if tokens else ""

    parts = [tag]
    if grid:   parts.append(f"[{grid}]")
    if bg:     parts.append(f"[bg:{bg}]")
    if cls:    parts.append(f"[{cls}]")
    parts.append(f"[{hb}]")
    return "".join(parts)

def is_overlay(node_id: str, node_map: dict) -> bool:
    entry = node_map.get(node_id, {})
    return "overlay" in entry

def walk(node: dict, node_map: dict, node_id: str, depth: int, max_depth: int) -> list[str]:
    """DFS walk, return list of fingerprint tokens at each level."""
    if depth > max_depth:
        return []

    nm_entry = node_map.get(node_id)
    token = node_token(node, nm_entry)
    result = ["  " * depth + token]

    children = node.get("children", [])
    # Derive child IDs: rc1 → rc1c1, rc1c2, ...
    for i, child in enumerate(children, 1):
        child_id = f"{node_id}c{i}" if node_id != "r" else f"rc{i}"
        if is_overlay(child_id, node_map):
            continue
        result.extend(walk(child, node_map, child_id, depth + 1, max_depth))

    return result

def fingerprint(data: dict, max_depth: int = 4) -> str:
    """Extract structural fingerprint from a visual tree JSON."""
    tree = data.get("data", {})
    node_map = data.get("nodeMap", {})
    lines = walk(tree, node_map, "r", 0, max_depth)
    return "\n".join(lines)

def load_all(directory: Path) -> dict[str, dict]:
    trees = {}
    for f in sorted(directory.glob("*.json")):
        try:
            trees[f.name] = json.loads(f.read_text())
        except Exception as e:
            print(f"SKIP {f.name}: {e}")
    return trees

def jaccard(a: str, b: str) -> float:
    sa, sb = set(a.split()), set(b.split())
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / len(sa | sb)

def cluster_exact(fingerprints: dict[str, str]) -> dict[str, list[str]]:
    """Group files by identical fingerprint."""
    groups: dict[str, list[str]] = defaultdict(list)
    for fname, fp in fingerprints.items():
        groups[fp].append(fname)
    return dict(groups)

def merge_similar(groups: dict[str, list[str]], threshold: float = 0.85) -> list[dict]:
    """
    Merge exact-match groups whose fingerprints are above Jaccard threshold.
    Returns list of cluster dicts.
    """
    fps = list(groups.keys())
    members_map = {fp: list(groups[fp]) for fp in fps}
    merged = []
    used = set()

    for i, fp_a in enumerate(fps):
        if fp_a in used:
            continue
        cluster_fps = [fp_a]
        cluster_members = list(members_map[fp_a])
        for j, fp_b in enumerate(fps):
            if i == j or fp_b in used:
                continue
            if jaccard(fp_a, fp_b) >= threshold:
                cluster_fps.append(fp_b)
                cluster_members.extend(members_map[fp_b])
                used.add(fp_b)
        used.add(fp_a)
        merged.append({
            "fingerprint": fp_a,   # use first as canonical
            "members": sorted(cluster_members),
            "size": len(cluster_members),
        })

    return sorted(merged, key=lambda c: -c["size"])

def extract_template(fname: str) -> str:
    """blog-post__blog-foo.json → blog-post"""
    return fname.split("__")[0]

def main():
    print(f"Loading trees from {VISUAL_TREES_DIR}/...")
    trees = load_all(VISUAL_TREES_DIR)
    print(f"Loaded {len(trees)} files")

    print("Computing fingerprints...")
    fingerprints = {}
    for fname, data in trees.items():
        fingerprints[fname] = fingerprint(data)

    print("Clustering (exact match)...")
    exact_groups = cluster_exact(fingerprints)
    print(f"  {len(exact_groups)} exact-match groups")

    print("Merging similar groups (Jaccard ≥ 0.85)...")
    clusters = merge_similar(exact_groups, threshold=0.85)
    print(f"  {len(clusters)} final clusters")

    # Annotate with known template labels for validation
    for c in clusters:
        template_counts: dict[str, int] = defaultdict(int)
        for fname in c["members"]:
            template_counts[extract_template(fname)] += 1
        c["templates"] = dict(sorted(template_counts.items(), key=lambda x: -x[1]))
        c["dominant_template"] = max(template_counts, key=lambda t: template_counts[t])

    # Summary
    print("\n=== CLUSTERS ===")
    for i, c in enumerate(clusters, 1):
        top = ", ".join(f"{t}×{n}" for t, n in list(c["templates"].items())[:3])
        print(f"  C{i:02d} ({c['size']:4d} pages) → {top}")

    print(f"\nWriting {OUTPUT_FILE}...")
    try:
        with open(OUTPUT_FILE, "w") as f:
            json.dump({
                "total_files": len(trees),
                "cluster_count": len(clusters),
                "clusters": [
                    {
                        "id": f"C{i:02d}",
                        "size": c["size"],
                        "dominant_template": c["dominant_template"],
                        "templates": c["templates"],
                        "representative": c["members"][0],
                        "members": c["members"],
                        "fingerprint": c["fingerprint"],
                    }
                    for i, c in enumerate(clusters, 1)
                ]
            }, f, indent=2)
    except OSError as e:
        print(f"ERROR writing {OUTPUT_FILE}: {e}")
        raise
    print("Done.")

if __name__ == "__main__":
    main()
