# Step 2.1 — Rule Promotion Plan

29 proposed rules from the long-tail scan.

| Rule | Proposed scope | decision_type | Default action | Why |
| ------ | ---------------- | --------------- | ---------------- | ----- |
| `footer-cta-chrome` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `nav-chrome` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `announcement-bar-chrome` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `leaked-source-code-text` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `empty-spacer-band` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `faq-answer-promoted-by-capture` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `content-underrendered-flag-phase2` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `iframe-embed-blind-spot` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `capture-failure-wrong-page` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `offscreen-duplicate-node` | pipeline | convention | **accept** | convention at a local scope — accept to confirm |
| `comparison-table-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `template-gallery-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `presentation-list-is-accordion` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `cta-banner-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `filter-listing-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `media-embed-block` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `alternating-feature-rows-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `testimonial-block` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `trust-badge-strip-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `related-content-block` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `section-bg-behind-heading` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `two-column-body` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `page-template-signature` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `page-body-as-prose` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `how-it-works-steps-block` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `component-caption-order` | project | convention | **accept** | convention at a local scope — accept to confirm |
| `faq-accordion-block` | generic | convention | **rescope** | scan self-declared generic — not allowed; choose project or pipeline |
| `knack-pricing-category-rows-as-separate-blocks` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |
| `web-form-is-form-block` | project | team-decision | **hold** | team-decision — needs operator sign-off (confirm the chosen modeling) |

Edit `rule-feedback.json` then run `promote-rules.py apply`.

- **accept**: confirm at its proposed local scope.
- **rescope**: fix `scope` to project|pipeline, then it's accepted.
- **hold**: team-decision; set `signoff` to confirm the chosen modeling.
- **promote_generic**: only with `sites` (>=2 distinct) + `signoff`.
- **reject**: drop it.
