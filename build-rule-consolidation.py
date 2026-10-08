#!/usr/bin/env python3
"""
Consolidate the 131 proposed rules into a canonical set (partition, like the blocks).

Each canonical rule carries synthesized trigger/decision and a fixed scope/category. Members
are the raw rule ids it subsumes; coverage = number of members (proxy for how many independent
agents/pages surfaced the pattern — a strong signal it's real). Any unassigned id falls
through to a singleton canonical rule so nothing is dropped.

Scope note: a scan may only propose project|pipeline (never generic). Some canonical noise
rules (leaked source code) are cross-site generic CANDIDATES but stay project here; promotion
to generic is a separate cross-site decision handled by promote-rules.py.
"""

import json
from pathlib import Path

INPUT_FILE = Path("consolidation-input.json")
MAP_FILE = Path("consolidation-map.json")

# canonical_id -> spec
FAMILIES: dict[str, dict] = {
    "footer-cta-chrome": {
        "scope": "project", "category": "noise", "decision_type": "convention",
        "trigger": "A recurring pre-footer band with tagline/CTA (and the global footer) present on nearly every page.",
        "decision": "Exclude from page block inventory; model once as global footer chrome/fragment.",
        "members": ["global-footer-cta-is-chrome", "knack-footer-cta-band", "knack-footer-cta-bar",
                    "knack-footer-cta-chrome", "knack-footer-cta-fragment", "knack-footer-tagline-boilerplate",
                    "knack-global-footer-band", "knack-global-footer-cta", "recurring-footer-chrome",
                    "sitewide-footer-chrome", "footer-logo-tagline-cta-strip", "knack-footer-tagline-band",
                    "global-footer-cta-fragment", "site-footer-cta-is-global-fragment",
                    "knack-global-nav-footer-chrome", "recurring-bottom-marketing-banner",
                    "global-nav-header-bar"],
    },
    "nav-chrome": {
        "scope": "project", "category": "noise", "decision_type": "convention",
        "trigger": "Global top navigation bar / flyout menu present site-wide.",
        "decision": "Exclude from page content; global nav chrome.",
        "members": ["knack-nav-bar-chrome", "promoted-nav-flyout-menu"],
    },
    "announcement-bar-chrome": {
        "scope": "project", "category": "noise", "decision_type": "convention",
        "trigger": "Thin promo ribbon above the nav (announcement) or a seasonal promo strip inside the hero.",
        "decision": "Exclude as site-wide marketing chrome / fragment, not page content.",
        "members": ["knack-announcement-bar", "in-hero-seasonal-promo-strip"],
    },
    "leaked-source-code-text": {
        "scope": "project", "category": "noise", "decision_type": "convention",
        "trigger": "A visible text node whose content is raw CSS/JS/PHP source or serialized data (comment syntax, selectors, script boilerplate).",
        "decision": "Exclude entirely — source-leak artifact, never content. (Generic candidate; promote cross-site.)",
        "members": ["leaked-css-text-node", "js-boilerplate-leak-node", "leaked-js-script-inline-text-node",
                    "leaked-php-serialized-array-text", "leaked-js-boilerplate-in-nav-zone",
                    "grid-preview-text-leaked-css", "leaked-embed-widget-script"],
    },
    "empty-spacer-band": {
        "scope": "pipeline", "category": "noise", "decision_type": "convention",
        "trigger": "A trailing/pre-footer background or gradient band with no captured content (decorative spacer or oversized bg bleed).",
        "decision": "Treat as decorative spacer; fold into section style or ignore. Not a block.",
        "members": ["solution-page-trailing-spacer", "solution-page-trailing-empty-zone",
                    "pre-footer-empty-gradient-band", "empty-gradient-cta-band", "empty-cta-zone-before-footer",
                    "oversized-bg-bleed-artifact", "detached-viewport-sized-node"],
    },
    "faq-answer-promoted-by-capture": {
        "scope": "pipeline", "category": "structure", "decision_type": "convention",
        "trigger": "FAQ accordion answers appear as detached/duplicated/root-promoted [region] nodes, colliding by coordinates, because they were expanded/animated at capture.",
        "decision": "Reattach answers to their question rows; treat as one faq-accordion block. Dedupe promoted copies.",
        "members": ["accordion-answer-coordinate-collision", "duplicate-promoted-faq-answer-node",
                    "faq-answer-promoted-out-of-tree", "promoted-duplicate-faq-answer-node",
                    "promoted-faq-answer-regions-artifact", "detached-faq-answer-nodes",
                    "faq-answer-promoted-to-root", "faq-answer-region-position-collision",
                    "promoted-faq-answer-duplicate", "promoted-faq-answer-node",
                    "promoted-faq-answer-orphan-node", "promoted-faq-answer-region"],
    },
    "content-underrendered-flag-phase2": {
        "scope": "pipeline", "category": "structure", "decision_type": "convention",
        "trigger": "A zone is near-empty in the tree (bg-only / missing text / understated) because content fell below the minWidth capture or loads lazily.",
        "decision": "Do NOT treat as empty. Flag for Phase 2 targeted DOM extraction of that zone.",
        "members": ["bottom-cta-banner-underrendered", "empty-bg-banner-zone-underrendered",
                    "empty-bg-media-zone-needs-extraction", "empty-bg-only-zone-no-captured-content",
                    "empty-cta-row-underrendered", "pre-footer-cta-banner-underrendered",
                    "untagged-media-placeholder-zone", "split-image-panel-underrendered",
                    "underrendered-list-zone", "integration-page-rows-missing-text",
                    "understated-step-card-text", "iframe-carousel-underrendered"],
    },
    "iframe-embed-blind-spot": {
        "scope": "pipeline", "category": "structure", "decision_type": "convention",
        "trigger": "A cross-origin iframe / embedded app-demo / media widget captured as a blank or placeholder zone.",
        "decision": "Mark as an embed block; resolve the embed src via Phase 2, don't treat as empty.",
        "members": ["bg-only-zone-is-embed-widget", "cross-origin-iframe-embed-blind-spot",
                    "embedded-app-demo-placeholder", "embedded-app-iframe-inconsistent-capture",
                    "media-embed-blank-capture", "underrendered-embedded-demo-widget"],
    },
    "capture-failure-wrong-page": {
        "scope": "pipeline", "category": "structure", "decision_type": "convention",
        "trigger": "The capture landed on a challenge page, redirect, or off-domain URL (Cloudflare, error redirect, scope mismatch).",
        "decision": "Discard the capture; re-capture the intended URL. Not a page structure.",
        "members": ["cloudflare-challenge-page-capture-failure", "off-domain-page-capture-scope-mismatch",
                    "wrong-domain-capture-artifact", "error-redirect-page-structure"],
    },
    "offscreen-duplicate-node": {
        "scope": "pipeline", "category": "noise", "decision_type": "convention",
        "trigger": "Offcanvas/hidden/offscreen duplicates or duplicated carousel/marquee slides promoted into the tree.",
        "decision": "Dedupe against the visible instance; drop the hidden/offscreen copy.",
        "members": ["offcanvas-hidden-duplicate-node", "offscreen-overflow-list-noise",
                    "hidden-tab-panel-promoted-offscreen", "region-promoted-node-reattach",
                    "duplicated-carousel-slides-in-capture", "marquee-ticker-duplicate-collapse",
                    "promoted-filter-control-overlapping-grid"],
    },
    "comparison-table-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "A feature/plan/competitor comparison rendered as a table, stacked columns, or comparison cards.",
        "decision": "Model as one comparison block; table vs cards is a variant (resolve cell structure in 3.5). Alternatives: separate blocks per layout.",
        "members": ["comparison-list-block", "comparison-table-as-single-block", "comparison-table-block",
                    "feature-comparison-table-block", "plan-comparison-table-block",
                    "pricing-comparison-table-block", "dual-competitor-comparison-zones",
                    "stacked-vs-comparison-table-columns"],
    },
    "template-gallery-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "Template previews shown as a carousel, grid, tab strip, or screenshot showcase, often followed by an install/download CTA.",
        "decision": "Model as a template-gallery block (+ separate CTA). Carousel/grid/tabs are variants. Alternatives: distinct blocks per presentation.",
        "members": ["template-app-preview-block", "template-carousel-block", "template-gallery-carousel-block",
                    "template-preview-tab-strip", "template-screenshot-carousel-then-cta",
                    "templates-carousel-block", "tabbed-usecase-grid-block", "knack-template-download-cta",
                    "template-preview-install-cta-block"],
    },
    "presentation-list-is-accordion": {
        "scope": "project", "category": "block", "decision_type": "convention",
        "trigger": "A [presentation]/list-role container of uniform rows that is an interactive accordion (beyond FAQ).",
        "decision": "Model as an accordion block; the [presentation] role is the accordion, not a plain list.",
        "members": ["list-role-faq-accordion-variant", "presentation-list-is-accordion-beyond-faq"],
    },
    "cta-banner-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "A standalone CTA band (heading + button) that is page content (not the global footer CTA).",
        "decision": "Model as a cta-banner block. A lone button in flow may instead be a default-content link. Alternatives: default-content vs block.",
        "members": ["get-started-cta-banner", "single-cta-button-is-default-content-link"],
    },
    "filter-listing-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "A filterable directory/listing with a chip/search filter bar over a grid or list.",
        "decision": "Model as a listing block; the filter bar may be part of it or its own block (confirm via Phase 2). Alternatives: split filter + list.",
        "members": ["category-filter-chip-bar", "directory-filter-search-block", "listing-filter-widget-modeling"],
    },
    "media-embed-block": {
        "scope": "project", "category": "block", "decision_type": "convention",
        "trigger": "An embedded video, interactive demo, or product-picker widget.",
        "decision": "Model as a media/embed block keyed on the embed source.",
        "members": ["embedded-video-block", "video-embed-placeholder", "interactive-demo-iframe-embed",
                    "product-picker-widget"],
    },
    "alternating-feature-rows-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "A sequence of full-width media+text rows with alternating sides.",
        "decision": "One feature block; alternation is a variant label. Alternatives: columns block per row.",
        "members": ["alternating-feature-rows-as-columns-block", "alternating-feature-rows-are-one-block",
                    "marketing-feature-row-section", "screenshot-visual-color-backdrop"],
    },
    "testimonial-block": {
        "scope": "project", "category": "block", "decision_type": "convention",
        "trigger": "A customer quote + attribution (single or callout).",
        "decision": "Model as a testimonial block; carousel is a variant.",
        "members": ["testimonial-quote-block", "solution-testimonial-callout"],
    },
    "trust-badge-strip-block": {
        "scope": "project", "category": "block", "decision_type": "team-decision",
        "trigger": "A strip of third-party rating/trust logos with scores near the top of landing pages.",
        "decision": "Model as a trust-badges block (row per badge). May be a variant of a generic logo strip. Alternatives: logos block.",
        "members": ["client-trust-logo-strip", "knack-trust-badge-strip"],
    },
    "related-content-block": {
        "scope": "project", "category": "block", "decision_type": "convention",
        "trigger": "A bottom-of-page grid of related article/resource teaser cards.",
        "decision": "Model as a related-content block (cards linking elsewhere).",
        "members": ["bottom-of-page-related-content-card", "related-article-teaser",
                    "related-articles-heading-fold"],
    },
    "section-bg-behind-heading": {
        "scope": "project", "category": "section", "decision_type": "convention",
        "trigger": "A heading/component sitting on an untagged media/color backdrop spanning a region.",
        "decision": "Represent the backdrop as a section style; map heading + component as separate items (background-container rule).",
        "members": ["media-behind-heading-untagged", "flattened-mixed-content-zone"],
    },
    "two-column-body": {
        "scope": "project", "category": "structure", "decision_type": "team-decision",
        "trigger": "An article/case-study body as a wide primary column + narrow sidebar, or a single-column body needing decomposition.",
        "decision": "Article = default-content, sidebar = its own block, same section. Alternatives: columns block. Decompose via Phase 2.",
        "members": ["two-column-article-with-sidebar", "case-study-single-column-body",
                    "collapsed-case-study-body", "case-study-body-needs-phase2-decomposition"],
    },
    "page-template-signature": {
        "scope": "project", "category": "structure", "decision_type": "convention",
        "trigger": "A recurring whole-page skeleton for a section of the site (integration pages, migration landing, category subnav).",
        "decision": "Record as a page-template signature to batch import; not a single block.",
        "members": ["knack-integration-page-template", "migration-landing-page-template",
                    "solutions-category-subnav-tab-bar"],
    },
    "page-body-as-prose": {
        "scope": "project", "category": "default-content", "decision_type": "team-decision",
        "trigger": "A page whose body is mostly long-form prose (glossary, pricing package copy) with no repeating component.",
        "decision": "Map the body as default-content (headings/paragraphs/lists), not blocks. Alternatives: extract embedded blocks if present.",
        "members": ["alphabetical-glossary-is-default-content", "package-pricing-page-body-as-prose"],
    },
    "how-it-works-steps-block": {
        "scope": "project", "category": "block", "decision_type": "convention",
        "trigger": "A numbered how-it-works / steps sequence.",
        "decision": "Model as a steps block, one row per step.",
        "members": ["how-it-works-steps-as-block"],
    },
    "component-caption-order": {
        "scope": "project", "category": "structure", "decision_type": "convention",
        "trigger": "A component followed by its caption/label in DOM order.",
        "decision": "Preserve component-then-caption order when authoring the block/default-content.",
        "members": ["component-then-caption-order"],
    },
}


def main():
    try:
        data = json.loads(INPUT_FILE.read_text())
        cmap = json.loads(MAP_FILE.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read inputs: {e}")

    all_ids = {r["id"] for r in data["proposed_rules"]}
    assigned: dict[str, str] = {}
    errors = []
    for canon, spec in FAMILIES.items():
        for m in spec["members"]:
            if m not in all_ids:
                errors.append(f"rule family {canon!r}: member {m!r} not in input")
            elif m in assigned:
                errors.append(f"rule {m!r} in two families: {assigned[m]!r} and {canon!r}")
            else:
                assigned[m] = canon
    if errors:
        for e in errors:
            print(" ", e)
        raise SystemExit(f"{len(errors)} rule-partition errors — fix FAMILIES")

    canonical_rules = []
    for canon, spec in FAMILIES.items():
        members = [m for m in spec["members"] if m in all_ids]
        canonical_rules.append({
            "id": canon, "scope": spec["scope"], "category": spec["category"],
            "decision_type": spec["decision_type"], "status": "proposed",
            "coverage": len(members), "members": members,
            "trigger": spec["trigger"], "decision": spec["decision"],
            "provenance": {"origin": "step2.2-consolidation", "merged_from": len(members),
                           "added": "2026-09-04", "version": 1},
        })
    singletons = sorted(all_ids - set(assigned))
    src = {r["id"]: r for r in data["proposed_rules"]}
    for rid in singletons:
        r = src[rid]
        canonical_rules.append({
            "id": rid, "scope": r.get("scope"), "category": r.get("category"),
            "decision_type": r.get("decision_type", "convention"), "status": "proposed",
            "coverage": 1, "members": [rid], "trigger": r.get("trigger", ""),
            "decision": r.get("decision", ""),
            "provenance": {"origin": "step2.2-consolidation-singleton", "added": "2026-09-04", "version": 1},
        })

    cmap["canonical_rules"] = canonical_rules
    MAP_FILE.write_text(json.dumps(cmap, indent=2))
    print(f"Partitioned {len(all_ids)} rules → {len(FAMILIES)} families + "
          f"{len(singletons)} singletons = {len(canonical_rules)} canonical rules")
    top = sorted(canonical_rules, key=lambda r: -r["coverage"])[:10]
    print("Top canonical rules by coverage:")
    for r in top:
        print(f"  {r['coverage']:3d}  [{r['scope']}/{r['category']}] {r['id']}")
    print(f"Updated {MAP_FILE}")
    if singletons:
        print(f"\nSingletons ({len(singletons)}): {', '.join(singletons)}")


if __name__ == "__main__":
    main()
