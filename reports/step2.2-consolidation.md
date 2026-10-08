# Step 2.2 — Consolidation Report

- Block names: **170** raw → **166** after format merge → **26** canonical

- Proposed rules: **131** → **29** canonical

- Possible variant groups deferred to Step 3.5: **17**

## Canonical blocks by page coverage

| Block | Pages | Members merged | Variant? |
| ------- | ------- | ---------------- | ---------- |
| `faq-accordion` | 146 | 3 | |
| `cards` | 116 | 37 | ⚠️ 3.5 |
| `feature-grid` | 66 | 6 | ⚠️ 3.5 |
| `feature-split` | 21 | 7 | ⚠️ 3.5 |
| `testimonial` | 40 | 8 | ⚠️ 3.5 |
| `cta-banner` | 39 | 10 | ⚠️ 3.5 |
| `hero` | 25 | 2 | |
| `comparison-table` | 27 | 7 | ⚠️ 3.5 |
| `steps` | 42 | 9 | ⚠️ 3.5 |
| `logos` | 34 | 8 | ⚠️ 3.5 |
| `trust-badges` | 41 | 3 | ⚠️ 3.5 |
| `pricing-table` | 12 | 5 | ⚠️ 3.5 |
| `video-embed` | 18 | 5 | |
| `carousel` | 13 | 7 | ⚠️ 3.5 |
| `steps-triggers-actions` | 21 | 5 | ⚠️ 3.5 |
| `templates-gallery` | 13 | 5 | ⚠️ 3.5 |
| `related-content` | 46 | 10 | ⚠️ 3.5 |
| `listing` | 15 | 12 | ⚠️ 3.5 |
| `stats` | 2 | 2 | |
| `form` | 7 | 5 | ⚠️ 3.5 |
| `tabs` | 2 | 1 | |
| `nav` | 13 | 3 | |
| `footer` | 8 | 1 | |
| `image` | 3 | 1 | |
| `case-study-callout` | 3 | 3 | ⚠️ 3.5 |
| `card-stack` | 1 | 1 | |

## Possible variant groups (deferred to Step 3.5)

These names may be one block with variants OR distinct blocks — undecidable without Phase 2 DOM. Not resolved here.

- `cards` (116 pages): Generic repeating card grid (repeating-cards rule). Domain flavors (recipe/event/portal/etc.) likely CSS/content variants; some (pricing, testimonial) split out separately. Confirm cell structure in 3.5.
- `feature-grid` (66 pages): Feature showcase. grid vs list vs single-highlight may be one block with variants or distinct; needs cell-count from 3.5.
- `feature-split` (21 pages): Two-column media+text row (often alternating). Alternation is a variant (variant-is-css-not-new-block); confirm in 3.5.
- `testimonial` (40 pages): Testimonials. Static vs carousel may be a variant or a distinct block.
- `cta-banner` (39 pages): Call-to-action banner variants (differ by copy/target). Mostly CSS/content variants.
- `comparison-table` (27 pages): Comparison. table vs cards vs list — structural variants, confirm in 3.5.
- `steps` (42 pages): Numbered/sequential steps. grid vs list ordering may be variant.
- `logos` (34 pages): Logo/badge strip (repeating-cards). May merge with compliance/trust badges.
- `trust-badges` (41 pages): Third-party rating/compliance badges. Possibly same as logos strip; kept separate pending 3.5 (this is the knack-trust-badge-strip candidate).
- `pricing-table` (12 pages): Pricing. table vs tier cards — structural variants.
- `carousel` (13 pages): Horizontally scrolling showcase. May split by content (screenshots vs templates).
- `steps-triggers-actions` (21 pages): Knack automation triggers/actions listing. list/table/grid variants; likely a project-specific block.
- `templates-gallery` (13 pages): Template gallery/preview. tabs vs grid variant.
- `related-content` (46 pages): Related/resource teasers. May split (articles vs use-cases) in 3.5.
- `listing` (15 pages): Directory/listing (often filterable, often under-rendered at capture). Filter bar may be its own block; confirm via Phase 2 DOM.
- `form` (7 pages): Forms/embeds. Native form vs third-party embed differ; confirm in 3.5.
- `case-study-callout` (3 pages): Case-study callout/sidebar. May fold into cards or sidebar block.
