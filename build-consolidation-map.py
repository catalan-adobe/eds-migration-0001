#!/usr/bin/env python3
"""
Build consolidation-map.json (the LLM consolidation judgment) from a curated grouping.

Expressing the merge as a partition (every normalized name → exactly one canonical family)
keeps coverage math exact and guarantees nothing is silently dropped. Any name not assigned
below falls through to its own singleton canonical block.

possible_variant_group=True means: these members MIGHT be one block with variants OR distinct
blocks — undecidable from the visual tree alone. Deferred to Step 3.5 (Phase 2 DOM). This
step does NOT force that call.
"""

import json
from pathlib import Path

INPUT_FILE = Path("consolidation-input.json")
MAP_FILE = Path("consolidation-map.json")

# canonical -> (members, possible_variant_group, variant_note, anchor_hint)
FAMILIES: dict[str, dict] = {
    "faq-accordion": {
        "members": ["faq-accordion", "accordion", "faq-grid"],
        "possible_variant_group": False,
        "variant_note": "Same Bootstrap FAQ accordion; 'accordion' seen expanded, 'faq-grid' collapsed.",
        "anchor_hint": ".component-faq-sec .accordion (role=presentation)",
    },
    "cards": {
        "members": ["cards", "card-grid", "feature-cards", "feature-card-grid", "benefit-cards",
                    "benefit-grid", "benefits-grid", "callout-cards", "reason-cards", "reasons-cards",
                    "value-cards", "trust-cards", "related-cards", "promo-card", "portal-cards",
                    "recipe-cards", "timeline-cards", "video-cards", "icon-list", "capabilities-list",
                    "key-features", "feature-callouts", "compliance-features", "audience-segments",
                    "case-study-cards", "case-study-card-grid", "case-study-spotlights",
                    "expert-directory-cards", "newsletter-cards", "event-card-grid", "ebook-card-grid",
                    "task-management-card-grid", "template-card-grid", "resource-card-grid",
                    "integration-cards", "automation-cards", "trigger-action-cards"],
        "possible_variant_group": True,
        "variant_note": "Generic repeating card grid (repeating-cards rule). Domain flavors "
                        "(recipe/event/portal/etc.) likely CSS/content variants; some (pricing, "
                        "testimonial) split out separately. Confirm cell structure in 3.5.",
        "anchor_hint": "a grid container with N uniform card children",
    },
    "feature-grid": {
        "members": ["feature-grid", "feature-highlight", "feature-list", "feature", "feature-banner",
                    "why-knack-features"],
        "possible_variant_group": True,
        "variant_note": "Feature showcase. grid vs list vs single-highlight may be one block "
                        "with variants or distinct; needs cell-count from 3.5.",
        "anchor_hint": "feature section (icon + heading + text per item)",
    },
    "feature-split": {
        "members": ["feature-split", "feature-row", "columns", "integration-feature-row",
                    "screenshot-visual", "how-it-works-media", "screenshot-showcase"],
        "possible_variant_group": True,
        "variant_note": "Two-column media+text row (often alternating). Alternation is a variant "
                        "(variant-is-css-not-new-block); confirm in 3.5.",
        "anchor_hint": "[2x1] media + text split",
    },
    "testimonial": {
        "members": ["testimonial", "testimonials", "testimonial-quote", "testimonial-stat",
                    "footer-quote", "testimonial-carousel", "customer-testimonial-carousel",
                    "team-testimonial-carousel"],
        "possible_variant_group": True,
        "variant_note": "Testimonials. Static vs carousel may be a variant or a distinct block.",
        "anchor_hint": "quote + attribution",
    },
    "cta-banner": {
        "members": ["cta-banner", "get-started-cta-banner", "cta", "login-cta", "import-banner",
                    "promo-banner", "marquee-banner", "footer-cta", "template-download-cta",
                    "template-preview-install-cta"],
        "possible_variant_group": True,
        "variant_note": "Call-to-action banner variants (differ by copy/target). Mostly CSS/content variants.",
        "anchor_hint": "full-width band with heading + button(s)",
    },
    "hero": {
        "members": ["hero", "hero-image"],
        "possible_variant_group": False,
        "variant_note": "Hero; image variant is a background/section-style difference.",
        "anchor_hint": "top-of-page H1 + intro (+ media)",
    },
    "comparison-table": {
        "members": ["comparison-table", "feature-comparison", "comparison-matrix", "comparison-list",
                    "comparison-highlights", "plan-feature-comparison", "competitor-comparison-cards"],
        "possible_variant_group": True,
        "variant_note": "Comparison. table vs cards vs list — structural variants, confirm in 3.5.",
        "anchor_hint": "row/column comparison of options",
    },
    "steps": {
        "members": ["steps", "numbered-steps", "step-list", "process-steps", "how-it-works",
                    "numbered-benefits-grid", "numbered-feature-grid", "numbered-features",
                    "numbered-reasons-grid"],
        "possible_variant_group": True,
        "variant_note": "Numbered/sequential steps. grid vs list ordering may be variant.",
        "anchor_hint": "ordered numbered items",
    },
    "logos": {
        "members": ["logos", "logo-strip", "logo-grid", "customer-logos", "trust-logos", "icon-row",
                    "icon-strip", "badge-row"],
        "possible_variant_group": True,
        "variant_note": "Logo/badge strip (repeating-cards). May merge with compliance/trust badges.",
        "anchor_hint": "horizontal row of logos/icons",
    },
    "trust-badges": {
        "members": ["trust-badges", "trust-badge-strip", "compliance-badges"],
        "possible_variant_group": True,
        "variant_note": "Third-party rating/compliance badges. Possibly same as logos strip; "
                        "kept separate pending 3.5 (this is the knack-trust-badge-strip candidate).",
        "anchor_hint": "row of rating/compliance badges with scores",
    },
    "pricing-table": {
        "members": ["pricing-table", "pricing-cards", "pricing-tiers", "pricing-plan-cards",
                    "commission-tiers"],
        "possible_variant_group": True,
        "variant_note": "Pricing. table vs tier cards — structural variants.",
        "anchor_hint": "plan columns with price + feature list + CTA",
    },
    "video-embed": {
        "members": ["video-embed", "video", "embedded-video", "app-demo-embed", "interactive-demo"],
        "possible_variant_group": False,
        "variant_note": "Embedded video/demo player.",
        "anchor_hint": "iframe/video player",
    },
    "carousel": {
        "members": ["screenshot-carousel", "templates-carousel", "template-carousel",
                    "template-showcase", "showcase", "use-case-showcase", "product-picker"],
        "possible_variant_group": True,
        "variant_note": "Horizontally scrolling showcase. May split by content (screenshots vs templates).",
        "anchor_hint": "scrollable slide track",
    },
    "steps-triggers-actions": {
        "members": ["triggers-actions-list", "triggers-actions-table", "triggers-actions-grid",
                    "automation-use-cases", "automation-templates"],
        "possible_variant_group": True,
        "variant_note": "Knack automation triggers/actions listing. list/table/grid variants; "
                        "likely a project-specific block.",
        "anchor_hint": "trigger → action pairs",
    },
    "templates-gallery": {
        "members": ["related-templates", "template-gallery", "templates-grid", "template-preview",
                    "template-preview-tabs"],
        "possible_variant_group": True,
        "variant_note": "Template gallery/preview. tabs vs grid variant.",
        "anchor_hint": "grid/tabs of template previews",
    },
    "related-content": {
        "members": ["related-content", "related-articles", "related-article-card", "related-links",
                    "blog-teaser", "blog-post-grid", "resource-cards", "use-case-cards", "use-cases",
                    "use-case-grid"],
        "possible_variant_group": True,
        "variant_note": "Related/resource teasers. May split (articles vs use-cases) in 3.5.",
        "anchor_hint": "grid of teaser cards linking elsewhere",
    },
    "listing": {
        "members": ["listing-block", "filtered-list", "integration-directory-list", "integrations-list",
                    "integration-table", "integration-logo-grid", "integrations-grid", "data-table",
                    "link-list", "directory-filter", "category-filter", "filter-bar"],
        "possible_variant_group": True,
        "variant_note": "Directory/listing (often filterable, often under-rendered at capture). "
                        "Filter bar may be its own block; confirm via Phase 2 DOM.",
        "anchor_hint": "filterable list/grid of many items",
    },
    "stats": {
        "members": ["stats", "stat-counters"],
        "possible_variant_group": False,
        "variant_note": "Numeric stat counters.",
        "anchor_hint": "big-number + label repeated",
    },
    "form": {
        "members": ["form", "contact-form", "hubspot-form-embed", "scheduler-embed", "ai-prompt-box"],
        "possible_variant_group": True,
        "variant_note": "Forms/embeds. Native form vs third-party embed differ; confirm in 3.5.",
        "anchor_hint": "input fields + submit",
    },
    "tabs": {
        "members": ["tabs"],
        "possible_variant_group": False,
        "variant_note": "Tabbed content switcher.",
        "anchor_hint": "[tablist] + panels",
    },
    "nav": {
        "members": ["nav", "footer-nav", "legal-nav"],
        "possible_variant_group": False,
        "variant_note": "Navigation chrome (global). Not page content.",
        "anchor_hint": "site nav",
    },
    "footer": {
        "members": ["footer"],
        "possible_variant_group": False,
        "variant_note": "Global footer chrome.",
        "anchor_hint": "site footer",
    },
    "image": {
        "members": ["image"],
        "possible_variant_group": False,
        "variant_note": "Inline content image.",
        "anchor_hint": "content <img> in flow",
    },
    "case-study-callout": {
        "members": ["case-study-callout", "case-study-highlight", "case-study-sidebar"],
        "possible_variant_group": True,
        "variant_note": "Case-study callout/sidebar. May fold into cards or sidebar block.",
        "anchor_hint": "highlighted case-study snippet",
    },
}


def main():
    try:
        data = json.loads(INPUT_FILE.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"Cannot read {INPUT_FILE}: {e} (run consolidate.py normalize first)")

    all_names = {b["normalized"] for b in data["blocks"]}
    coverage = {b["normalized"]: b["coverage"] for b in data["blocks"]}

    assigned: dict[str, str] = {}
    errors = []
    for canon, spec in FAMILIES.items():
        for m in spec["members"]:
            if m not in all_names:
                errors.append(f"family {canon!r}: member {m!r} not in input")
            elif m in assigned:
                errors.append(f"member {m!r} in two families: {assigned[m]!r} and {canon!r}")
            else:
                assigned[m] = canon
    if errors:
        for e in errors:
            print(" ", e)
        raise SystemExit(f"{len(errors)} partition errors — fix FAMILIES")

    # unassigned names become singleton canonical blocks (nothing dropped)
    canonical_blocks = []
    for canon, spec in FAMILIES.items():
        members = [m for m in spec["members"] if m in all_names]
        canonical_blocks.append({
            "name": canon,
            "members": members,
            "possible_variant_group": spec["possible_variant_group"],
            "variant_note": spec["variant_note"],
            "anchor_hint": spec["anchor_hint"],
        })
    singletons = sorted(all_names - set(assigned))
    for name in singletons:
        canonical_blocks.append({
            "name": name,
            "members": [name],
            "possible_variant_group": False,
            "variant_note": "singleton — 1 page, no confident merge; revisit if it recurs.",
            "anchor_hint": "",
        })

    MAP_FILE.write_text(json.dumps({
        "note": "LLM consolidation judgment. canonical_rules pass-through pending separate rule merge.",
        "canonical_blocks": canonical_blocks,
        "canonical_rules": [],
    }, indent=2))
    families = len(FAMILIES)
    print(f"Partitioned {len(all_names)} names → {families} families + "
          f"{len(singletons)} singletons = {len(canonical_blocks)} canonical blocks")
    top = sorted(canonical_blocks, key=lambda b: -sum(coverage[m] for m in b["members"]))[:8]
    print("Top families by summed coverage:")
    for b in top:
        cov = sum(coverage[m] for m in b["members"])
        print(f"  ~{cov:4d}  {b['name']}  ({len(b['members'])} names merged)")
    print(f"Wrote {MAP_FILE}")


if __name__ == "__main__":
    main()
