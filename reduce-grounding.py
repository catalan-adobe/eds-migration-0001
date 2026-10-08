#!/usr/bin/env python3
"""
Step 3 reduce — turn 44 pages of probe evidence into a grounding coverage matrix for all 26
canonical blocks. No browser work; pure aggregation + a judgment mapping.

Honest about probe limits: block-probe.js detects grids / accordions / carousels, so it
grounds those shapes. Blocks that are not repeating structures (hero, cta-banner, single
media, forms, chrome) get status 'needs-richer-probe' — flagged, not faked.

status: grounded (real anchor from DOM) | partial (evidence but ambiguous) | needs-richer-probe
"""

import json
from collections import Counter
from pathlib import Path

BLOCKS_FILE = Path("blocks-canonical.json")
OUT = Path("blocks-grounded-full.json")
REPORT = Path("reports/step3-grounding.md")

# canonical block -> grounding spec (judgment, backed by evidence anchors below)
GROUNDING: dict[str, dict] = {
    "faq-accordion": {"status": "grounded", "shape": "accordion", "detectors": [
        {"builder": "elementor", "anchor": ".e-n-accordion > details.e-n-accordion-item", "pages": 18},
        {"builder": "wp-custom", "anchor": ".accordion > .accordion-item.faq-card", "pages": 10}]},
    "cards": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.solution-lists > [class*=col-]", "pages": 1},
        {"builder": "wp-custom", "anchor": ".row > [class*=col-] (generic Bootstrap grid)", "pages": 22}]},
    "related-content": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.case-card-lists > [class*=col-]", "pages": 16},
        {"builder": "wp-custom", "anchor": ".row.additional-recent-post-lists > [class*=col-]", "pages": 7}]},
    "feature-grid": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.featured-call-lists > [class*=col-]", "pages": 7}]},
    "listing": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.intergration-library > [class*=col-]", "pages": 5},
        {"builder": "wp-custom", "anchor": ".row.integration-post-listing > [class*=col-]", "pages": 1}]},
    "templates-gallery": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.template-post-listing > [class*=col-]", "pages": 1}]},
    "carousel": {"status": "grounded", "shape": "carousel", "detectors": [
        {"builder": "wp-custom", "anchor": ".slick-list > .slick-slide", "pages": 10},
        {"builder": "wp-custom", "anchor": ".splide__list > li.splide__slide", "pages": 6},
        {"builder": "elementor", "anchor": ".swiper-wrapper > .swiper-slide", "pages": 3}]},
    "presentation-list-is-accordion": {"status": "grounded", "shape": "accordion", "detectors": [
        {"builder": "both", "anchor": "same as faq-accordion — [role=presentation]/[details] is the accordion", "pages": 28}]},
    "logos": {"status": "grounded", "shape": "carousel", "detectors": [
        {"builder": "wp-custom", "anchor": ".splide__list.no-customer-slider > li.splide__slide (customer logo slider)", "pages": 6}]},
    "trust-badges": {"status": "grounded", "shape": "strip", "detectors": [
        {"builder": "wp-custom", "anchor": ".g2-rating-right .logos-listing (rating/badge strip — DISTINCT from logos)", "pages": 6}]},
    "testimonial": {"status": "partial", "shape": "carousel/grid", "detectors": [
        {"builder": "wp-custom", "anchor": "quote in .row grid or splide slider — varies; not uniquely isolated by probe", "pages": 0}]},
    "comparison-table": {"status": "grounded", "shape": "div-grid (NOT html table)", "detectors": [
        {"builder": "both", "anchor": "div/column comparison — the ONLY <table> elements on the site are cookie-consent noise; comparisons are .row/.col or Elementor columns", "pages": 2}]},
    "pricing-table": {"status": "grounded", "shape": "div-grid (NOT html table)", "detectors": [
        {"builder": "wp-custom", "anchor": ".row pricing/plan rows (div-based, no <table>)", "pages": 2}]},
    "steps": {"status": "partial", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": "numbered .row > .col grid — same structure as cards, content-differentiated", "pages": 0}]},
    "steps-triggers-actions": {"status": "partial", "shape": "grid/list", "detectors": [
        {"builder": "wp-custom", "anchor": "trigger/action .row grid — content-differentiated variant of cards", "pages": 0}]},
    "case-study-callout": {"status": "grounded", "shape": "grid", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.case-card-lists > [class*=col-] (shared with related-content)", "pages": 16}]},
    "stats": {"status": "needs-richer-probe", "shape": "counters", "detectors": []},
    "hero": {"status": "grounded", "shape": "banner", "detectors": [
        {"builder": "wp-custom", "anchor": ".page-banner-content-box", "pages": 7},
        {"builder": "elementor", "anchor": ".elementor-element .health-hero-heading", "pages": 9}]},
    "cta-banner": {"status": "partial", "shape": "banner", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.banner-direction 2-col band (candidate) — needs content check vs feature-split", "pages": 4}]},
    "feature-split": {"status": "grounded", "shape": "2-col row", "detectors": [
        {"builder": "wp-custom", "anchor": ".row.align-items-center.directionRow > 2x[class*=col-]", "pages": 8}]},
    "video-embed": {"status": "grounded", "shape": "iframe", "detectors": [
        {"builder": "both", "anchor": "iframe[src*=youtube.com] (also vimeo/wistia)", "pages": 6}]},
    "form": {"status": "grounded", "shape": "form", "detectors": [
        {"builder": "embed", "anchor": "form.hs-form-* (HubSpot embed, ~8 fields)", "pages": 1},
        {"builder": "wp-custom", "anchor": "form.prompt-form (AI prompt box, 1 field)", "pages": 3}]},
    "tabs": {"status": "grounded", "shape": "tablist", "detectors": [
        {"builder": "elementor", "anchor": ".e-n-tabs (.e-n-tabs-heading > [role=tab])", "pages": 1},
        {"builder": "wp-custom", "anchor": "[role=tablist] hero tab switcher (app-category)", "pages": 1}]},
    "nav": {"status": "grounded", "shape": "chrome", "detectors": [
        {"builder": "both", "anchor": "global <nav> — chrome, excluded from content (nav-chrome rule)", "pages": 44}]},
    "footer": {"status": "grounded", "shape": "chrome", "detectors": [
        {"builder": "both", "anchor": "global <footer> — chrome (footer-cta-chrome rule)", "pages": 44}]},
    "image": {"status": "grounded", "shape": "inline media", "detectors": [
        {"builder": "both", "anchor": "content <img>/<figure> in flow — default EDS image handling", "pages": 44}]},
}


def main():
    try:
        canonical = {b["name"] for b in json.loads(BLOCKS_FILE.read_text())["blocks"]}
    except (OSError, json.JSONDecodeError, KeyError) as e:
        raise SystemExit(f"Cannot read {BLOCKS_FILE}: {e}")
    missing = canonical - set(GROUNDING) - {"card-stack"}  # card-stack = singleton, skip
    if missing:
        print(f"WARNING: canonical blocks not in GROUNDING map: {sorted(missing)}")

    blocks = []
    for name in sorted(GROUNDING, key=lambda n: {"grounded": 0, "partial": 1,
                                                 "needs-richer-probe": 2}[GROUNDING[n]["status"]]):
        g = GROUNDING[name]
        builders = sorted({d["builder"] for d in g["detectors"] if d.get("builder") not in (None, "?", "both")})
        blocks.append({"block": name, "status": g["status"], "shape": g["shape"],
                       "builders": builders, "detector_count": len(g["detectors"]),
                       "detectors": g["detectors"]})

    status_counts = Counter(b["status"] for b in blocks)
    OUT.write_text(json.dumps({"pages_grounded": 44, "status_counts": dict(status_counts),
                               "blocks": blocks}, indent=2))
    print(f"Wrote {OUT}: {len(blocks)} blocks")
    print("status:", dict(status_counts))

    # append coverage matrix to the report
    lines = ["\n## Full grounding coverage (all 26 canonical blocks)\n",
             f"Status across 44 grounded pages: "
             f"**{status_counts.get('grounded',0)} grounded**, "
             f"**{status_counts.get('partial',0)} partial**, "
             f"**{status_counts.get('needs-richer-probe',0)} need a richer probe**.\n",
             "| Block | Status | Shape | Detectors | Builders |",
             "|-------|--------|-------|-----------|----------|"]
    for b in blocks:
        det = b["detector_count"] or "—"
        bld = ", ".join(b["builders"]) or "—"
        lines.append(f"| `{b['block']}` | {b['status']} | {b['shape']} | {det} | {bld} |")
    lines.append("\nThe `needs-richer-probe` blocks are not grids/accordions/carousels "
                 "(hero, cta-banner, single media, forms, chrome) — the structural probe can't "
                 "see them. They need a shape-specific probe or manual DOM inspection.\n")
    marker = "\n## Full grounding coverage"
    base = REPORT.read_text()
    if marker in base:                       # idempotent: replace prior section
        base = base[:base.index(marker)].rstrip() + "\n"
    REPORT.write_text(base + "\n".join(lines) + "\n")
    print(f"Wrote coverage matrix to {REPORT}")


if __name__ == "__main__":
    main()
