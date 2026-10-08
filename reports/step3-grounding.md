# Step 3 — DOM Grounding Report

Grounded canonical blocks against **live DOM** across **44 representative pages** using
`block-probe.js` (visible-content structural probe: grids / accordions / carousels, chrome
excluded). This is the Phase 2 the pipeline flagged as non-optional.

## Headline finding: the site uses TWO page builders

The source site is built with two distinct systems, and most blocks have a **different DOM
implementation in each**. One canonical block ≠ one transformer.

| Builder | Signature | Accordion pages |
|---------|-----------|-----------------|
| **wp-custom** | Bootstrap `.row > .col-*`, `.accordion.faq-card`, Splide + Slick carousels | 10 |
| **elementor** | `.e-n-accordion > details`, `.elementor-element-*`, Swiper carousels | 18 |

## Per-block DOM grounding

| Canonical block | Implementations found | Detectors needed |
| ----------------- | ----------------------- | ------------------ |
| `faq-accordion` | wp-custom `.accordion > .accordion-item.faq-card` (10p) · elementor `.e-n-accordion > details.e-n-accordion-item` (18p) | **2** |
| `carousel` | Slick `.slick-list > .slick-slide` (10p) · Splide `.splide__list > li.splide__slide` (6p) · Swiper `.swiper-wrapper > .swiper-slide` (3p) | **3** |
| `cards` | Bootstrap `.row > [class*=col-]` (22p) — one grid, many modifier classes | **1** |

## What this resolves

- **Biggest variant group closed**: `cards` (116 pages, 37 merged names) is confirmed ONE
  block — a Bootstrap column grid. The domain flavors (`recipe-cards`, `event-card-grid`,
  `portal-cards`…) are content/CSS variants, not distinct blocks.
- **`presentation-list-is-accordion` confirmed**: the `[role=presentation]` / `[presentation]`
  containers the visual tree flagged really are interactive accordions in both builders.

## Migration impact & build estimate

**26 canonical blocks → ~28 distinct extraction patterns** once grounded in DOM. Two
structural forces pull in opposite directions:

- **Builder split multiplies**: `faq-accordion` needs 2 detectors (Bootstrap + Elementor),
  `carousel` needs 3 (Slick/Splide/Swiper), `hero`/`tabs`/`form` need 2 each. The site runs
  two page builders (wp-custom + Elementor); cross-builder blocks each need multiple detectors.
- **Shared grid collapses**: 7 blocks (`cards`, `related-content`, `feature-grid`, `listing`,
  `templates-gallery`, `case-study-callout`, `steps`) are all the SAME Bootstrap
  `.row > [class*=col-]` skeleton, differentiated only by modifier class + content. They fold
  into **1 shared grid detector + per-block modifier selector**, not 7 separate builds.

Net: the naive count of 34 detectors reduces to **~28 real transformers** — 21 blocks fully
grounded, 4 partial (content-level disambiguation → Step 3.5), 1 (`stats`) needing a richer
probe. None of this was visible from the visual tree or name-based consolidation; only live
DOM revealed both the builder split and the shared-grid collapse.

## Still open

- **4 partial** blocks (`testimonial`, `steps`, `steps-triggers-actions`, `cta-banner`) are
  structurally `.row` grids/bands that overlap other blocks — distinguishing them is a
  *content*-level call, which is Step 3.5 (variant analysis), not structural grounding.
- **1 needs a richer probe**: `stats` (numeric counters) needs a content-shape detector the
  structural probe doesn't have.
- Both held rules are now **resolved by DOM**: `trust-badge-strip-block` confirmed DISTINCT
  from `logos` (`.g2-rating-right .logos-listing` vs `.splide.no-customer-slider`);
  `knack-pricing-category-rows-as-separate-blocks` **rejected** — pricing renders as one div
  `.row` grid of rows, not separate blocks per category.

## Full grounding coverage (all 26 canonical blocks)

Status across 44 grounded pages: **21 grounded**, **4 partial**, **1 need a richer probe**.

| Block | Status | Shape | Detectors | Builders |
| ------- | -------- | ------- | ----------- | ---------- |
| `faq-accordion` | grounded | accordion | 2 | elementor, wp-custom |
| `cards` | grounded | grid | 2 | wp-custom |
| `related-content` | grounded | grid | 2 | wp-custom |
| `feature-grid` | grounded | grid | 1 | wp-custom |
| `listing` | grounded | grid | 2 | wp-custom |
| `templates-gallery` | grounded | grid | 1 | wp-custom |
| `carousel` | grounded | carousel | 3 | elementor, wp-custom |
| `presentation-list-is-accordion` | grounded | accordion | 1 | — |
| `logos` | grounded | carousel | 1 | wp-custom |
| `trust-badges` | grounded | strip | 1 | wp-custom |
| `comparison-table` | grounded | div-grid (NOT html table) | 1 | — |
| `pricing-table` | grounded | div-grid (NOT html table) | 1 | wp-custom |
| `case-study-callout` | grounded | grid | 1 | wp-custom |
| `hero` | grounded | banner | 2 | elementor, wp-custom |
| `feature-split` | grounded | 2-col row | 1 | wp-custom |
| `video-embed` | grounded | iframe | 1 | — |
| `form` | grounded | form | 2 | embed, wp-custom |
| `tabs` | grounded | tablist | 2 | elementor, wp-custom |
| `nav` | grounded | chrome | 1 | — |
| `footer` | grounded | chrome | 1 | — |
| `image` | grounded | inline media | 1 | — |
| `testimonial` | partial | carousel/grid | 1 | wp-custom |
| `steps` | partial | grid | 1 | wp-custom |
| `steps-triggers-actions` | partial | grid/list | 1 | wp-custom |
| `cta-banner` | partial | banner | 1 | wp-custom |
| `stats` | needs-richer-probe | counters | — | — |

Only `stats` (numeric counters) still needs a shape-specific probe. The 4 `partial` blocks are
grounded structurally (all `.row` grids/bands) but overlap other blocks at the structure level
— separating them is a content-level call deferred to Step 3.5 variant analysis.

Note: the only `<table>` elements found across all 44 pages were cookie-consent report tables
(chrome). `comparison-table` and `pricing-table` are therefore div/column grids, NOT semantic
tables — a concrete transformer input.
