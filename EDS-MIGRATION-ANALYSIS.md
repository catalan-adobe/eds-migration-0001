# EDS Migration Analysis — Design & Findings

Durable record of the page-analysis pipeline for migrating a WordPress-era marketing site
(knack.com, 1,741 URLs) to Adobe Edge Delivery Services (EDS). Written to be self-contained
so the working conversation can be compacted. The approach is intended to generalize to any
website migration, not just this one.

---

## 1. TL;DR

- **Goal**: decompose every source page into the EDS authoring model so we can (a) sequence
  the migration work and (b) build the minimum set of import transformers.
- **The deliverable is NOT "a list of blocks."** It is the EDS trichotomy per page —
  **section / default-content / block** — plus a **layout** container level. Blocks are a
  *subset* of the work; default-content is the cheap majority.
- **Two-stage, learning-machine pipeline**: cheap site-wide classification (divide) → per-
  template decomposition against a shared, revisable rulebook/registry (conquer). Each
  template handled sharpens the rulebook for the next.
- **Biggest empirical finding**: the site is **three template systems** — wp-blog (57%),
  wp-marketing (35%), Elementor (7%) — and the majority (blog) is essentially default-content.
- **Biggest methodological finding**: the visual "page tree" is an excellent *structure map*
  but not a *content source*; it silently omits the internals of content wrappers (the blog
  body) and carries no hrefs/srcs/full text.

---

## 2. What "done" means: the EDS decomposition model

An EDS document is a sequence of **sections**, each containing an ordered mix of
**default-content** (prose: headings, paragraphs, images, lists, links) and **blocks**
(tables). Sections can carry a **section-metadata** style (CSS classes → backgrounds etc.).

We added one level the naive model misses — **layout**:

```text
page
 └ section              styled region (background / boundary)
    └ layout             vertical | 2-col | 3-col | grid   (99% vertical → implicit)
       └ slot/column
          └ sequence of [ default-content | block ]        (recursive; a slot may nest a layout)
```

Decomposition output MUST be a **tree**, not a flat sequence — otherwise multi-column
content (e.g. article + sidebar) flattens and the sidebar dissolves into the article.

**Layout maps onto existing EDS constructs** (it is not a 4th primitive):

- single vertical → default section flow (nothing to emit)
- N uniform content columns → the standard EDS `columns` block, or a section columns-style
- article + sidebar → article = default-content; **sidebar usually dropped** (related-posts/
  nav chrome) or promoted to its own section. Layout decomposition also feeds a *what-to-drop*
  decision.

**The hard discriminator** (same DOM, different meaning): a `.row > .col` is

- **a cards *block*** when columns are many + uniform + homogeneous content (→ 1 block, N rows)
- **a layout *container*** when columns are few + heterogeneous (→ descend into each column)

This discriminator is a rulebook rule, `team-decision` at the edges.

---

## 3. Architecture: two-stage learning machine

```text
STAGE 1 — DIVIDE (cheap, site-wide, no LLM)
  page-tree className  →  builder/template classification  →  builder × page-role groups

STAGE 2 — CONQUER (per template, LLM on representatives only)
  decompose representative pages → section/layout/default-content/block tree
  → classify each zone (consult rulebook first)
  → document findings into shared registry (rulebook + block registry)
  → each template reuses prior findings → accelerates (front-loaded cost, cheap tail)
```

Principles that held up all session:

- **Scripts for scale, LLM for judgment on representatives only.** Never LLM the full corpus.
- **Map/reduce**: fan-out LLM analysis produces raw material; a deterministic reduce
  consolidates it. (One 224-page fan-out cost ~$15.62 / 28 agents; its output was reduced,
  not trusted raw.)
- **Reports-as-interface + feedback files**: each step emits a human-readable report and a
  pre-filled `feedback.json`/`rule-feedback.json` the operator edits; steps are idempotent
  and resumable.
- **The knowledge unit is a shared, revisable registry** (rulebook + canonical blocks), keyed
  where needed by builder. The *template* is the work unit; the *registry* is the knowledge.
- **Reuse is partial across builders**: a canonical block shares its concept + EDS output
  across builders but often needs a per-builder detector (see §5).

---

## 4. The rulebook (the learning substrate)

Location: `rules/` — `generic.yaml` (7), `knack.yaml` (22, project), `pipeline-rules.yaml`
(6). 34 confirmed rules total. Full schema + policy in `rules/README.md`.

Rule fields: `id, scope, decision_type, category, status, priority, trigger, decision,
rationale, provenance`.

- **scope** = `generic | project | pipeline`. *Scope is earned, never self-declared.* A scan
  (LLM) may only propose `project` or `pipeline`; **never `generic`**. Generic requires
  cross-site evidence (≥2 sites) + human sign-off. Enforced mechanically by `promote-rules.py`
  (it caught every LLM self-declared generic — 5 of them).
- **pipeline** scope = artifacts of *our capture method*, not the site or EDS (e.g. content
  under-rendered by the minWidth capture). Filing these separately kept 37% of discovered
  "rules" (capture noise) out of the real convention set.
- **decision_type** = `convention` (near-objective) vs `team-decision` (a modeling choice
  among valid EDS options → requires human sign-off, alternatives named).
- **category** = `section | block | default-content | noise | structure` — already the EDS
  trichotomy vocabulary; we just need to drive classification with it, not only "find blocks."
- **status** = `proposed | confirmed`; only confirmed loads into production runs.

---

## 5. Empirical findings

### 5.1 Three template systems (builder classification, all 1,746 files, FREE from data)

| System | Pages | Share | Signatures |
| --- | --- | --- | --- |
| wp-blog | 990 | 57% | `post-single-wrap`, `author-info` |
| wp-marketing | 608 | 35% | `component-*`, Bootstrap `.row > .col-*`, `.accordion.faq-card` |
| elementor | 119 | 7% | `elementor-*`, `e-n-accordion`, `swiper` |
| wp-gutenberg / bubble.io / unknown | 29 | 2% | `wp-block-*`, `bubble-element` |

Source: `className` fields in each visual tree's `data` tree (`builders.json`). No fetch
needed. This corrected an earlier wrong claim that builder couldn't be derived from captured
data (I had searched the nodeMap `selector` field, which is positional; the `className` field
carries it).

### 5.2 One canonical block ≠ one transformer (the builder tax)

Grounded against live DOM (`blocks-grounded-full.json`, `reports/step3-grounding.md`):

- `faq-accordion` → **2 detectors**: wp-custom `.accordion > .accordion-item.faq-card` (10p)
  - Elementor `.e-n-accordion > details.e-n-accordion-item` (18p)
- `carousel` → **3 detectors**: Slick (10p) + Splide (6p) + Swiper/Elementor (3p)
- `hero`, `tabs`, `form` → 2 each (wp-custom + Elementor / embed)

### 5.3 Shared Bootstrap grid collapses (the inverse force)

7 grid-shaped blocks (`cards`, `related-content`, `feature-grid`, `listing`,
`templates-gallery`, `case-study-callout`, `steps`) are all the SAME `.row > [class*=col-]`
skeleton, discriminated only by modifier class (`solution-lists`, `case-card-lists`,
`featured-call-lists`, `intergration-library`…). → **1 shared detector + per-block modifier
selector**, not 7 builds.

### 5.4 Build estimate

26 canonical blocks → **~28 real transformers** (naive count 34; grid family collapses 7→1;
builder splits multiply accordion/carousel/hero/tabs/form). PLUS **1 generic default-content
transformer** covering the 57% blog majority and most prose everywhere.

### 5.5 Blog majority is default-content

A sampled blog article decomposed to 49 prose elements (31×P, 7×H2, 5×H3, lists, 1 figure),
**zero embedded blocks** — but only after recognizing its `.row.content` as a 2-col
article+sidebar *layout* and descending (the `two-column-body` rule). "Blog = default-content"
holds, *conditional on applying the layout rule first*.

### 5.6 Other DOM-grounded facts

- The only `<table>` elements site-wide are cookie-consent report tables (chrome).
  `comparison-table` and `pricing-table` are div/column grids, NOT semantic tables.
- Block *names* are our abstraction, not source selectors. `faq-accordion` does not exist as
  an element; the real markup is `.component-faq-sec .accordion`. Name ≠ selector.

---

## 6. The page-tree capture: capabilities & gaps

Each `visual-trees/<name>.json` has: `data` (DOM tree), `nodeMap` (positional id → selector

- background), `textFormat` (indented spatial text), `rootBackground`.

Per-node fields (coverage across 33,409 nodes): `tag`/`selector`/`bounds`/`children` 100%,
`className` 93.5%, `text` 58.5% (capped at 30 chars), `id` 32%, `layout` 29%, `background`
23%, `role` 2.5%.

**Good for** (proven): template/builder classification, section/zone counting, spatial
sequence, layout/grid detection, background/section-style detection.

**Gaps** — but see **§11**: this list predates the settled divide/conquer role of the visual
tree, and two of its four items are now **superseded**.

1. ~~Decompose content wrappers one level~~ — **SUPERSEDED (§11).** This was the wrong fix.
   Deepening the capture trades away the boundedness that is the visual tree's entire value,
   and "one level deeper" (structural) does not reliably reach "block level" (semantic) anyway.
   The opaque box is *fine* for the divide; embedded blocks are found in the **conquer** pass
   (per-box DOM reduction + registry-driven recognition), not by a fatter capture.
2. ~~Capture leaf content attributes (`href`/`src`/`alt`)~~ — **SUPERSEDED (§11).** Content
   attributes are a conquer-pass concern (the per-box DOM re-fetch), not a divide-artifact one;
   putting them in the visual tree also violates "keep the divide lean."
3. **Prefer className-based selectors over positional** — **still valid.** A stable selector is
   the *handle* the conquer pass uses to re-fetch a box; it costs almost nothing and serves the
   divide→conquer handoff.
4. **Tag why a node is a leaf** (stopped-for-layout vs genuine content leaf) — **still valid**
   as a *bounded* per-node flag (see §11's "bounded per-box annotations").

Design principle (revised): the visual tree's value IS its boundedness. Keep it lean — it is
the substrate for iteration-1 of the divide and nothing more. Content, attributes, and block
recognition belong to the conquer pass, reached via the stable selector. See **§11**.

Capture depth today: median depth 3; 75% of pages ≤ depth 3 (`minWidth=900` threshold).
wp-blog median depth 3 (article = 1 opaque box); wp-marketing max depth 8; Elementor median 5.

---

## 7. Pipeline steps built (with artifacts)

| Step | Script | Output |
| --- | --- | --- |
| 1 capture | `capture-visual-trees.sh` (in test-f51 worktree) | `visual-trees/*.json` (1,746) |
| 2 cluster | `cluster-visual-trees.py` | `clusters.json` (259 clusters) |
| 2 report | `report-clusters.py` | `reports/step2-clusters.md`, `feedback.json` |
| 2.1 long-tail scan | `scan-longtail.py` (prepare/sample/collect) + workflow fan-out | `packets/`, `verdicts/`, `novel-blocks.json` |
| 2.2 consolidate | `consolidate.py` + `build-consolidation-map.py` + `build-rule-consolidation.py` | `blocks-canonical.json` (26), `rules-canonical.json` (29), `reports/step2.2-consolidation.md` |
| promote | `promote-rules.py` (plan/apply) | `rules/*.yaml`, `reports/step2.1-promotion.md`, `rule-feedback.json` |
| 3 ground (block→URL) | `resolve-block-urls.py` | `block-urls.json` |
| 3 ground (probe) | `block-probe.js` (structural) + rich inline probe | `grounding-evidence.jsonl` (44p), `rich-evidence.jsonl` (23p) |
| 3 reduce | `reduce-grounding.py` | `blocks-grounded-full.json`, `reports/step3-grounding.md` |
| builder sweep | inline (data-tree className) | `builders.json` |
| decomposition prototype | inline probe (throwaway) | `decomp.jsonl` (3 pages) |

Cluster tiers (step 2): Tier A 5 clusters/60% pages, Tier B 30/24%, Tier C long tail 16%.

---

## 8. Learnings & gotchas

- **`playwright-cli eval` expects a bare arrow function `() => {...}`, NOT an IIFE.** Passing
  a multi-line file via `$(cat)` breaks (SyntaxError); the reliable form is a **compact
  single-line arrow function passed inline** (heredoc). Cost 36 wasted probes + misdiagnosis
  before we checked the tool contract. Read tool signatures first.
- **`minWidth=900` capture is too coarse.** It produced 37% pipeline-artifact "rules" (FAQ
  answers promoted out of tree, blank iframes, under-rendered zones) and left content wrappers
  opaque. We quarantined the noise (pipeline scope) rather than fixing the capture.
- **Sampling bias is real.** Step-3 grounding sampled marketing + long-tail pages and never
  grounded a single blog page — missing the 57% majority template entirely — until the builder
  sweep forced the issue. Sample across the *classification*, not what's visually interesting.
- **Block names float free of selectors** unless you anchor them at emission. Caused the
  `faq-accordion`/`accordion`/`faq accordion` naming drift. Require a candidate selector when
  naming a block.
- **Fan-out produces inconsistent vocabularies** (170 block names, 131 one-off rules from 224
  independent agents). A deterministic reduce (consolidation) is mandatory, not optional.
- **The classifier's crux is granularity**: "is this node a block" (self-match) vs "does it
  contain blocks" (descend). Descendant-match greedily collapses a page to its first block.
- **File named `pipeline.yaml` triggered a false-positive "Erda Pipeline" JSON schema** in the
  editor; renamed to `pipeline-rules.yaml`.

---

## 9. Open items / roadmap

Not done, honestly flagged:

1. **Nothing is verified against a real EDS output.** No transformer built, no EDS document
   produced. The ~28-transformer estimate and all block specs are structurally reasoned,
   externally unvalidated. **Highest-value next step: build ONE transformer end-to-end against
   one grounded block spec** to test the whole chain against the target.
2. **Formalize the Stage-2 decomposition classifier** (currently a throwaway inline probe)
   with: the layout tree model (§2), self-match granularity, cards-vs-layout discriminator,
   embedded-block detection inside default-content, sidebar separation.
3. **Improve the capture** per §6 (decompose content wrappers; attributes; stable selectors)
   — this unblocks the 57% blog majority for block inventory.
4. **4 partial blocks** (`testimonial`, `steps`, `steps-triggers-actions`, `cta-banner`) and
   **`stats`** need content-level disambiguation → Step 3.5 variant analysis.
5. **Step 3.5 variant analysis** entirely deferred (CSS-variant vs structural-variant vs
   distinct-block, per block type, from real DOM).
6. **Close the learning loop**: accumulate *verified* findings (decompose → build → produce
   EDS doc → check → feed correction back), so the registry can un-learn errors.
7. Consider whether clustering (`clusters.json`) is still needed at all — the builder×role
   grouping superseded it as the useful "divide" axis.

---

## 10. Key file map

```text
EDS-MIGRATION-ANALYSIS.md     ← this file
rules/README.md               ← rulebook contract (scopes, promotion policy)
rules/{generic,knack,pipeline-rules}.yaml
reports/                      ← step2-clusters, step2.1-promotion, step2.2-consolidation, step3-grounding
clusters.json  builders.json  blocks-canonical.json  blocks-grounded-full.json
rules-canonical.json  novel-blocks.json
visual-trees/*.json           ← 1,746 captured page trees (gitignored)
*.py                          ← pipeline scripts (see §7)
block-probe.js                ← reusable structural DOM probe (arrow-function form)
```

---

## 11. Decision record — the visual tree's role (divide-only), and why we do NOT deepen the capture

Outcome of a design discussion that pressure-tested what the visual tree is *for*. It settles
the role of the artifact and **rejects deepening the capture** (was floated as "Option C:
close the box-level seam"). Supersedes §6 gaps 1–2.

### 11.1 The settled role

> **The visual tree is the bounded substrate for iteration-1 of the divide. It is necessary and
> good for exactly that, and silent on everything after it.**

Supporting points, each with its honest boundary:

- **Its value is boundedness.** Small enough that an LLM *always fully ingests* it → no drift.
  This is structural, not luck. (Boundary: argued this session, not measured head-to-head vs
  feeding a raw big DOM to an LLM — see §11.4.)
- **Bounded by *visual* complexity, not *DOM* complexity.** 40 levels of semantically-empty
  wrapper `<div>` soup that occupy one rectangle collapse to **one box**. This decouples the
  artifact from DOM pathology, which is why it is the *robust* divide substrate precisely on
  deeply-nested, semantically-messy sites where a structural outline drowns and clean semantics
  (landmarks/headings) are unavailable. (Boundary: reasoned, not yet demonstrated — this site
  was not pathologically nested.)
- **"Never miss anything" means never miss a top-level *box*, not never miss *content***. The
  divide is complete at the **layout** level, bounded by the spatial threshold — an embedded
  block below that threshold (a CTA in prose, a mid-article table) is legitimately swallowed
  into its enclosing box and surfaced later, in the conquer pass.
- **Divide only.** It contributes nothing to conquer: recognition, content, selectors, and
  authoring all come from other passes. Every trouble spot this session came from asking the
  visual tree to be more than the first-divide substrate.

### 11.2 Why deepening the capture (Option C) is rejected

Four reasons, strongest last:

1. **Self-defeating.** Completeness-by-depth is bought by pushing content back into the divide
   artifact, which trades away the boundedness that is its entire value — re-introducing the
   exact drift the visual tree existed to prevent.
2. **Inverse correlation — helps least where needed most.** On shallow/simple sites one level
   of descent is cheap and roughly complete, but those are the sites where you don't need it.
   On deep/complex sites — where the visual tree matters most — "one shallow level" is never
   enough and honest descent goes unbounded, so the bloat→drift cost bites hardest. A fix whose
   payoff shrinks as the site gets easier and whose cost explodes as it gets harder is not a fix.
3. **The load-bearing error: "one level deeper" ≠ "block level."** Depth is *structural*; a
   block is *semantic*; the two are **decoupled** — the same decoupling that makes the visual
   tree valuable. A given site nests the *same* card 2 boxes deep or 6 boxes deep. So a fixed
   depth chases a moving target: per site it lands short, on, or past — mostly not on. You can
   pay the full bloat cost **and still not be block-complete.**
4. **Reaching a block is *recognition*, not *depth*.** You arrive at a block by matching a
   signature ("this is a card / accordion / form") and descending **until recognized** —
   inherently variable-depth, different per block and per site, driven by the block registry.
   A fixed-depth capture cannot do this by construction. It is a **conquer-step** activity.

### 11.3 Consequences for the architecture

- **Keep the visual tree deliberately lean** (iteration-1 divide substrate; geometry-bounded).
- **The embedded-block seam is a conquer-pass responsibility** — per-box targeted DOM reduction
  - registry-driven, descend-until-recognized block detection, reached via the box's stable
  selector. Not a capture concern.
- **If the divide needs complexity-awareness** (for sequencing/estimation), add it as a
  **bounded per-box scalar annotation** — e.g. `element-density`, `contains-table`,
  `link-count`, `text-length` — a "this box needs a careful conquer pass" flag. Constant size
  per box, preserves full ingestion, points the second pass where to look, without dragging
  content up into the divide. This is the *only* salvageable form of "know more about a box."
- **Stable className-based selectors are worth keeping** (the divide→conquer handle); content
  attributes are not (they belong to the conquer re-fetch).

### 11.4 Status of the underlying claims

Two pillars of the role above were originally **reasoned, not measured**. One has now been
measured (Option A); one remains open.

**Deep-nesting advantage — MEASURED & CONFIRMED (Option A).** Captured all three representations
(raw DOM, dedup structural outline, visual tree) on three framework-heavy homepages and compared
node count + max depth:

| Site | Raw DOM | Structural outline (dedup) | Visual tree |
| --- | --- | --- | --- |
| atlassian.com | 7,508n / 28d | 570n / **27d** | 50n / **6d** |
| linear.app | 4,663n / 25d | 1,409n / **25d** | 92n / **5d** |
| stripe.com | 2,723n / 30d | 816n / **25d** | 83n / **9d** |

The decisive metric is **depth**. The dedup outline stays at **~raw depth (25–27)** because it
collapses repeated *siblings* but not the deep *unique wrapper nesting* that dominates React/Next
DOMs; it also keeps 570–1,409 nodes. The visual tree bounds **both** dimensions (50–92 nodes,
depth 5–9) — **~10–15× fewer nodes, 3–5× shallower**. Geometry beats dedup exactly because this
nesting is unique, not repetitive — confirming §11.2's "bounded by *visual*, not *DOM*,
complexity." It also vindicates the earlier pushback that "big DOMs are big because of
repetition" is false for framework sites: their depth is unique wrapper soup, where dedup fails
and the visual tree is the *necessary* bounded form.

Caveats: n = 3, homepages only; these sites were depth 25–30 — comparable to knack/koffievoordeel
(31), so the advantage holds even at "normal" depth, but a 40–50-level extreme was not found among
marketing pages. And this measured **boundedness**, not **divide-completeness** — that the bounded
tree still enumerates every top-level piece rests on the earlier per-site experiments, not on
these three.

**Anti-drift benefit — still reasoned, not measured.** The claim that a raw big DOM makes an LLM
drift/skim while the bounded tree does not was never run head-to-head. Sound by construction
(bounded input can't overflow), but no experiment this session isolated it.
