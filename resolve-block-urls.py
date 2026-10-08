#!/usr/bin/env python3
"""
Step 3 (mechanical prep) — map each canonical block to representative page URLs.

canonical block → member clusters (blocks-canonical.json) → representative file
(clusters.json) → source URL (urls.json, matched by path slug). Produces block-urls.json:
for each block, up to N representative URLs to inspect for DOM grounding.

Pure mechanical; no LLM, no browser. The URLs feed the DOM-extraction step.
"""

import json
from pathlib import Path

BLOCKS_FILE = Path("blocks-canonical.json")
CLUSTERS_FILE = Path("clusters.json")
URLS_FILE = Path("/Users/catalan/repos/ai/migration-tests/eds-migration-test-20260902/"
                 ".worktrees/test-f51/tools/migration/data/urls.json")
OUT_FILE = Path("block-urls.json")
PER_BLOCK = 3


def slugify(path: str) -> str:
    return path.strip("/").replace("/", "-") or "home"


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {path}: {e}")


def rep_slug(representative: str) -> str:
    """`<template>__<slug>.json` → slug."""
    stem = representative.rsplit(".json", 1)[0]
    return stem.split("__", 1)[1] if "__" in stem else stem


def main():
    blocks = load_json(BLOCKS_FILE)["blocks"]
    clusters = {c["id"]: c for c in load_json(CLUSTERS_FILE)["clusters"]}
    urls = load_json(URLS_FILE)
    slug2url = {slugify(e["path"]): e["url"] for e in urls}

    def url_for_cluster(cid: str) -> str | None:
        c = clusters.get(cid)
        if not c:
            return None
        s = rep_slug(c["representative"])
        if s in slug2url:
            return slug2url[s]
        for k, u in slug2url.items():           # fallback: suffix match
            if k == s or k.endswith("-" + s):
                return u
        return None

    out = []
    unresolved = 0
    for b in blocks:
        seen, urls_for_block = set(), []
        for cid in b["clusters"]:
            u = url_for_cluster(cid)
            if u and u not in seen:
                seen.add(u)
                urls_for_block.append({"cluster": cid, "url": u})
            if len(urls_for_block) >= PER_BLOCK:
                break
        if not urls_for_block:
            unresolved += 1
        out.append({
            "block": b["name"],
            "coverage": b["coverage"],
            "possible_variant_group": b["possible_variant_group"],
            "anchor_hint": b.get("anchor_hint", ""),
            "representative_urls": urls_for_block,
        })

    OUT_FILE.write_text(json.dumps({"blocks": out}, indent=2))
    print(f"Wrote {OUT_FILE}: {len(out)} blocks, up to {PER_BLOCK} URLs each "
          f"({unresolved} blocks with no resolvable URL)")
    for b in sorted(out, key=lambda x: -x["coverage"])[:6]:
        u = b["representative_urls"][0]["url"] if b["representative_urls"] else "(none)"
        print(f"  {b['coverage']:4d}  {b['block']:22s} → {u}")


if __name__ == "__main__":
    main()
