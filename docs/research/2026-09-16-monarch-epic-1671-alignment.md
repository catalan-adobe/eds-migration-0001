--- 
title: Project Monarch (epic #1671) vs. content-pipeline-v2 — alignment research
date: 2026-09-16
---

# Project Monarch (epic #1671) vs. our pipeline — alignment research

Repo read: Adobe-AEM-Foundation/aem-experience-catalyst (private, via `gh`).
Our pipeline read: `content-pipeline-v2` skill (adobe-skills repo) plus its specs/plans in
this worktree.

## 1. Summary

Project Monarch is Adobe's plan (epic #1671, "Site Planning Mode") to take EMA's migration
tool from single-page copy-paste into a full site migration flow: scope a site, review and
correct the detected templates/blocks in a UI, own a project-local block library instead of
fetching one over HTTP, gate bulk import on coverage, then bulk-migrate a template with
per-page status and feed verified results back into the catalog. It lives entirely inside
Adobe's EMA/EXCAT product (Claude Code skills + a workspace-service backend + a React UI),
not as a standalone CLI skill. As of 2026-09-16 the epic is **open**; of its 20 listed
sub-issues, **7 are closed** (#1669, #1675, #1676, #1375, #1734, #1766, #1792) and **13 are
open** (#1672, #1670, #1106, #1429, #1767, #1768, #1770, #1789, #1790, #1897, #1898, #1899,
#473). The architecture doc (#1792, merged as
`docs/architecture/full-site-migration-architecture.md`) is done; most of the actual
scoping/block/mapping/UI work it describes is still open or only partially landed.

**Verdict on alignment:** the two efforts overlap in problem space (turn a live site into a
structured, reviewable inventory before doing expensive work on it) but solve almost
disjoint sub-problems with almost no shared vocabulary. Monarch is entirely about EDS
**content blocks** (cards, columns, heroes) and how to generate/map/import them at scale
inside one product's backend; our pipeline is entirely about **collection and page chrome**
(URLs, an offline cache, header/footer detection) as a standalone, product-agnostic skill.
Monarch has no cache layer and no measured "what leaks off-machine" data; we have no block
catalog, no content mapping, and no UI. The two could compose (our cache under their
catalog, our chrome detector next to their block detector) but nothing in either design
currently assumes the other exists, and several naming collisions ("template", "block",
"representative") would need resolving before that composition could happen cleanly.

## 2. Monarch, issue by issue

| # | Status | Goal (one line) | Artefacts |
|---|---|---|---|
| 1671 | open | Epic: scope → review → library → validate → bulk migrate | `page-templates.json` |
| 473 | open | Scope report review UI: display + edit | report, `user-*.json` |
| 1668 | closed→473 | Editable reports as a distinct artifact | merged into #473 |
| 1285 | closed→1671 | Use scoping results to drive bulk import | superseded by epic |
| 1676 | closed | Site-planning-mode entry point + viewer shell | `project.json.features` |
| 1734 | closed | `features: string[]` + `useFeatures()` hook | `project.json` |
| 1675 | closed | Scoping emits `page-templates.json` artifact | `page-templates.json` |
| 1766 | closed | `page-templates.json` = single source of truth | provenance stamp |
| 1672 | open | Enumerate every template's blocks + selectors | `blocks[]`, `instances[]` |
| 1767 | open | Derive covering set of representative pages | `representativePages[]` |
| 1106 | open | Improve block identification (reuse OOTB, git ref) | design note only |
| 1897 | open | Block ID: customer brings their own library | none yet (one-liner) |
| 1898 | open | Block ID: discover + map (no library) | none yet (one-liner) |
| 1899 | open | Block ID: blocks come from Figma | none yet (one-liner) |
| 1375 | closed | Generate `metadata.json` for customer blocks | `metadata.json` |
| 1669 | closed | Block generation skill (Phase 2), unscheduled | `<block>.js/.css`, guide |
| 1429 | open | Content mapper into an existing block library | uses `metadata.json` |
| 1670 | open | Bulk migration run: per-page status/progress | run status (undesigned) |
| 1768 | open | Cross-page mapping coverage gate before bulk import | `coverageGaps` |
| 1770 | open | Write verified mapping results back to catalog | tier upgrades, names |
| 1789 | open | Trust grade: verified_worked/failed/unverified | grade field (proposed) |
| 1790 | open | Per-project learning overlay (LoRA-style) | overlay artifact (proposed) |
| 1792 | closed | Architecture doc: shifts + gap analysis | the doc itself |

### Scoping / templates & catalog

**#1675** (closed) made `excat-site-catalog` actually **emit** `page-templates.json` as a
first-class output (PR #1700, "scoping emits page-templates.json + visual-trees.json").
Before this, "scoping runs but nothing downstream is connected to it" (epic body, verbatim).

**#1766** (closed) settled a real conflict: two producers wrote `page-templates.json` with
different quality — a full catalog scope (semantic names, full-site membership) and
migration's own classify pass (`run-classify-pipeline.js`, weak `template-1` auto-IDs). The
decision: catalog is the **authoritative producer**; migration's classify path is
**append-only** for URLs the catalog doesn't already cover; human edits (#473 "Branch 4")
outrank both. Every template carries a `provenance: {source, runId, generatedAt}` stamp so
precedence is auditable. `catalog/template-catalog.json` becomes purely internal to the
clustering algorithm — "no consumer reads `template-catalog.json`" is an explicit acceptance
criterion. Fixed by PR #1700 per a later comment.

**#1672** (open) is about **filling in** `blocks[]` on each template — not producing the
file (that's #1675/#1766). A commenter (shimahaj_adobe) first argued selectors can't be
attached at scoping time because the block detector's selector builder
(`getUniqueSelector()`) is positional/fragile while the skeleton extractor's builder
(`getSelector()`, feeding `visual-trees.json`'s `nodeMap`) is robust (id/class-first,
`nth-of-type` fallback). The issue was then revised in place: since block detection and
skeleton extraction already run in the same `analyzePage()` pass, scoping can resolve each
block's selector with the robust builder directly, no waiting for `block-mapping-manager`.
Decided shape: each classified block entry carries a `selectors: string[]` (deduped across
pages) alongside `pagesUsing`, and that list flows straight into the template's
`instances[]`. **Blocked by #1106** — the shape lives on the block-classify entry that
#1106's redesign is supposed to produce, and that entry "isn't produced yet (only the
example file exists)." Open question: sequencing depends entirely on #1106 landing.

**#1767** (open) addresses picking which page(s) per template get the expensive, deep
per-page analysis. History: #1675 removed a `representativePages` (greedy block-cover)
concept from scoping output, arguing it "can be picked at consume-time from
`block-catalog.json`." PR #1635 then added a **reader**
(`template-representatives.js`) for `representativeUrl`/`representativePages` but nothing
**populates** it when a catalog exists, so today it silently degrades to `urls[0]`. #1767
proposes a pure, deterministic, browser-free projection: given `block-catalog.json`'s
per-variant `usage.pagesUsing[]`, compute the **minimal set of pages that together cover
every block variant** in a template, and write it as `representativePages[]` onto
`page-templates.json` (per #1766's precedence rules, additive/append-only, provenance
stamped). No catalog → falls back to `urls[0]` (today's behavior). Open/thin: no code yet,
this is a design comment thread reconciling with #1766, not an implementation.

### Block identification (the core quality problem)

**#1106** (open) is a design discussion (Anthony Rumsey / Shikha Mahajan), not yet
implemented, framed by an internal Adobe paper ("Agent + Memory + Self-Improvement,"
`experience-platform/mystique`, 2026-05) that found deterministic block-detection rules
break across heterogeneous sites — "one image, five different right answers across five
customers" — and that the fix is Evaluation-Driven Development (curate a case dataset, score
with deterministic + LLM-as-judge evaluators, auto-tune and auto-revert). That EDD effort is
filed separately as #1791 (not in scope here — one level out). #1106 itself lists six desired
behaviors: (1) prefer reusing existing OOTB blocks (e.g. the boilerplate's own `columns`
block) over inventing new ones; (2) suggest a **variant** of an existing block (`columns
(blog)`) instead of a new block name when the difference is a variation; (3) steer detection
toward `adobe/aem-block-collection`'s conventions as the preferred pattern set; (4) use
`aemdemos/sta-boilerplate`'s library as the fallback for any project that brings none, and
require every block a project *does* bring to carry a plaintext description (identification
depends on it); (5) during block generation, hand the LLM a representative block's source as
inspiration — noting the "circular dependency" of needing a representative from the source
page itself when no library exists; (6) fold the single-page block-detection technique
(already working well) into the site-wide cataloging pass instead of running two different
approaches. The issue also documents the **current** two-tier mapping model for reference:
type selection treats local and library blocks the same (LLM matches a section's content
description to a block's stated purpose); variant reuse diverges — library blocks match on
prose description, local blocks match on `metadata.json`'s stored `visualCharacteristics` at
an **80% similarity threshold**. Open questions: none formally listed as blockers, but the
whole issue is unimplemented design; #1672 is explicitly blocked on it.

**#1897/#1898/#1899** (all open, all one-liners) sketch three entry scenarios for block
identification rather than defining behavior: customer brings a library and only content
needs mapping (#1897, "The block library is given, so all we need to do is map the content
to those blocks for import"); customer has no idea what blocks they need, so EMA discovers
**and** maps at once, "assumed to be the most common usecase," output reviewable/editable by
the operator (#1898); blocks come from Figma, then get mapped (#1899). These are too thin to
judge — no acceptance criteria, no artefacts, one comment on #1898 suggesting an
`OPINIONS|EMA.md` file to record per-project operator choices, referenced from CLAUDE.md.

**#1375** (closed, PR #1427) is the "customer has existing but undocumented blocks" case: a
setup-phase skill auto-generates a block library including `metadata.json` for blocks that
already exist in the target project, so migration can reason about them like any other
block. Distinguished from #1669 by trigger point (pre-migration setup vs. post-scoping
generation) — a reviewer note asks the two be reconciled before implementing overlapping
metadata/authoring-doc logic.

**#1669** (closed, "Block generation skill (Phase 2)") defined the acceptance bar for taking
the block identification artifact and generating a complete, fidelity-checked block
(`<name>.js`, `<name>.css`, an authoring guide) for every block that doesn't already exist —
explicitly marked "not yet prioritized... done manually" at filing time. The architecture doc
later folds this into `block-variant-manager` as the single block-management skill rather
than a separate one (see §3 below); a later note in the architecture doc says the "previous
standalone block-development skill has since been retired" in favor of
`excat-block-generator`.

**#1429** (open) proposes `excat-content-mapper`: given blocks that **already exist**
(Figma-first, customer's own library, or a redesign), map source-site content into them
**without ever inventing new blocks** — unmapped sections are surfaced for confirmation, not
imported. Its matching backbone is each block variant's `metadata.json` (purpose, content
model, visual characteristics). A commenter (blefebvr_adobe) asked for coordination with
#1106 to avoid divergent designs; the architecture doc later folds this into
`block-mapping-manager` as the single mapping skill rather than a parallel one.

### Migration run & progress

**#1670** (open) wants per-page status (succeeded/failed/pending) for a bulk migration run,
a failure reason per page, and traceability back to the template + import-script version
used — explicitly **not** the same as post-import content validation (#1003, out of scope
here) and explicitly UI-visible, not just logs. No design beyond acceptance criteria; still
open.

**#1768** (open) is a genuine gap found by testing: PR #1635's `verify-template-mapping.js`
only checks the derived mapping against the **same page** it came from ("selectors must
reference class/ids present in that page's `cleaned.html`"). A block variant present on
*other* pages of the template but absent from the representative silently mis-parses; today
the only feedback is a post-hoc `.report.xlsx`. Proposal: before bulk import, cross-check the
representative-derived mapping against every other page's `page-catalog.json` **tier-1**
(definitive) detections; uncovered tier-1 blocks become `coverageGaps`, trigger targeted
re-analysis, and block the template from being marked `mapped` until resolved. A comment
notes PR #1635 already emits an inert `coverageGaps` field (always `[]`, overwritten by
merge) that should be retired once this lands.

### Learning & write-back

**#1770** (open) is the most architecturally interesting of the write-back issues:
cataloging is "fast but shallow" (heuristic detector, no verified selectors, auto/derived
names) while migration is "slow but ground-truth" (real DOM selectors, LLM semantic variant
names, working parsers, verified mappings) — and today that higher-quality data is thrown
away after use. Proposal: after a template's mapping verifies, write back tier upgrades
(tier-2/3 → tier-1 confirmed detections), semantic variant names, corrected clustering
(a false "variant" split, or a missed split), and the computed covering set — additively,
non-destructively, attributable to the run. Net effect described as "a ratchet where each
migration makes the next scope/migration cheaper and safer."

**#1789** (open) extends #1770 with the Mystique paper's "keep the failures too" lesson: a
mapping isn't just written back when it worked; a `verified_failed` grade is stored so the
mapper never re-proposes a proven-wrong mapping on the same project. Three grades:
`verified_worked`, `verified_failed`, `unverified`. Feeds the content mapper (#1429) as
per-project anti-patterns, and feeds the review UI (#473) as a confirmed-vs-hypothetical
signal. Design only, not implemented; the producer would be `excat-import-validation`
extending `verify-template-mapping.js`.

**#1790** (open) proposes a LoRA-style three-layer memory: a **base** (`template-catalog.json`
/ site-architecture profile, regenerated on full re-scope), a per-block-type **overlay**
(deltas learned as pages migrate — which library block this site's "hero" maps to, verified
selectors, naming idioms — appended cheaply, updated per page/template), and a **merged**
view the content mapper reads. Explicit goal: "page 100 reuses page 5's verified mapping
instead of re-deriving." Gated behind a GO/OpenFeature flag. Acceptance criteria include a
measurable claim: "cost/latency of mapping a page drops as more of the same site is
migrated." Entirely design-stage; no code.

### UI

**#473** (open) is the human-review screen: pages grouped by URL pattern, per-page template
and detected blocks, a page-detail view with screenshot + block list, incremental updates as
analysis progresses, a downloadable HTML report, and (merged in from #1668) **editing**:
correcting misidentified blocks/templates, persisted as a distinct, run-traceable artifact
that downstream migration reads instead of raw scope output. A 2026 comment
(arumsey_adobe) says a POC UI exists on a branch but "must be heavily re-designed... follow
Spectrum 2 styling... integrate with the main chat window... AI buttons (magic wand)" — i.e.
chat-first, not a standalone report viewer. A later comment proposes surfacing #1789's trust
grade here so reviewers "spend their attention on the unverified entries." Still open, no PR.

**#1676** (closed) is scoped narrowly to the entry point + viewer shell (mode toggle +
container view that #473 mounts into) — explicitly not what renders inside it. A reviewer
comment (arumsey_adobe) pushed back on the premise: no explicit mode switch should be
needed; user prompts should detect intent and `project.json` should just record that the
project wants site-planning features, gating other UI off that flag. This is the design
#1734 then implements.

**#1734** (closed) is pure plumbing: a project-wide `features: string[]` array at the top of
`.migration/project.json` (never per-site, distinct from `demoMode`), plus a read-only
frontend `useFeatures().isEnabled(id)` hook — "source-agnostic by design" so GO/OpenFeature
flags can merge in later without changing call sites. No UI is gated by this issue itself.

**#1668** (closed) was folded entirely into #473 once it became clear display and edit are
the same screen; no independent artefact.

### Meta / architecture

**#1792** (closed) is the doc-only deliverable: `docs/architecture/full-site-migration-
architecture.md` (merged via PR #1793), covering the four shifts, gap analysis, artifact map,
and issue index. Read in full for this research; summarized in §3 below.

**#1285** (closed, superseded) is the pre-epic version of the same idea ("use scoping
results to drive bulk import") — closed in favor of #1671 wholesale.

## 3. Their artefacts and data model

All artefacts live under a project workspace (`.migration/`, `catalog/`, `tools/importer/`),
distinct from our `migration/` tree, with no shared root.

**`tools/importer/page-templates.json`** — the single source of truth (#1766). One entry per
template: URL membership, semantic name/description, `blocks[]` (variant references into
`block-catalog.json`, each carrying a deduped `selectors: string[]` per #1672),
`representativePages[]` (covering set per #1767), a `provenance: {source, runId,
generatedAt}` stamp with `source` one of `catalog | migration-classify | user-edit`.
Producer: `excat-site-catalog`'s `emit-page-templates.js` (authoritative) or
`excat-site-migration`'s `run-classify-pipeline.js` (fallback/append-only, `mergeFromCatalog`
per PR #1635). Consumer: `block-mapping-manager`, import-script generation, bulk migration,
the review UI (#473).

**`catalog/template-catalog.json`** — the clustering pipeline's internal representation
(richer per-cluster data). Since #1766, explicitly **not** read by any consumer; it exists
only to feed `page-templates.json`.

**`catalog/block-catalog.json`** — per detected block variant: screenshots, usage URLs,
counts. Per #1672's original caveat, it stores **no selector** — selectors were meant to be
resolved elsewhere until the redesign moved them onto the block-classify entry itself
(#1106's output shape). Producer: `excat-site-catalog`. Consumer: `block-variant-manager`
(what to build), `block-mapping-manager` (what to map to), #1767 (covering-set input via
`usage.pagesUsing[]`).

**`catalog/.pages/<slug>/page-catalog.json`** — per page: each detected block with
`selector`, `bounds`, and `detectionTier` (1 = definitive, 2 = heuristic, 3 = unknown; a
positional `block.selector` field here is slated for removal per #1672 once the robust
selector flows through instead). Consumer: #1768's coverage gate (checks tier-1 detections on
non-representative pages against the derived mapping).

**`visual-trees.json`** — a `nodeMap` of robust, id/class-first CSS selectors (with
`nth-of-type` fallback) keyed by structural node, emitted by scoping alongside
`page-templates.json` (PR #1700's title: "scoping emits page-templates.json +
visual-trees.json"). Consumer: `block-mapping-manager`'s separate **section**-selector
collection (kept even after #1672, which is block-selector only, not section-selector).

**`.blocks/<variant>/metadata.json`** — per block: `visualCharacteristics` (used for the 80%
similarity reuse threshold), screenshots, `usage.pagesUsing`, a required plaintext
description if the block comes from a customer library (#1106). Consumer: block-variant-
manager's reuse decision, content-mapper (#1429)'s matching backbone, #1375's populator when
the file is missing.

**`.migration/project.json`** — `origin`/project metadata plus, since #1734, a project-wide
`features: string[]` (never per-site) read by `useFeatures().isEnabled(id)`; the architecture
doc's Shift 3 drops the external `libraryUrl` field entirely (no replacement URL — the
reference lives in a workspace-service-owned git mirror instead, read as a filesystem path).

**`user-*.json`** (named in #1766, not otherwise specified) — the persisted, run-traceable
overlay of a human's edits from #473's review screen; per #1766, this is the **highest**
authority on read, above both catalog and migration-classify output.

**Trust grade** (#1789, proposed, no field name settled) — `verified_worked | verified_failed
| unverified` stamped onto block mappings written back into `block-catalog.json` /
`page-catalog.json` by #1770's write-back logic; read by #1429's content mapper as an
anti-pattern list and surfaced in #473's review UI.

**Per-project learning overlay** (#1790, proposed, no file name settled) — sits "alongside
the catalog artifacts," composes base (catalog) + overlay (per-block-type deltas) at read
time, gated behind a GO/OpenFeature flag; #1770's write-back is named as its natural
producer.

**Bulk-run status** (#1670, proposed, no file/shape settled) — per-page succeeded / failed /
pending with a failure reason, linked to the template and import-script version.

## 4. Alignment matrix

Format: **our concept** — Monarch issue(s) — same / overlapping / different / absent — note.

**`urls.json` (kind/migrate per URL)** — none directly — **absent**
Monarch groups URLs into templates (#1766/#1672) but has no artefact for "here is every
URL and whether it's a page, binary, redirect, or excluded from migration" upstream of
that grouping.

**local cache, offline proxy, `cache` noun** — none — **absent**
No issue describes caching a site before analysis. §5 argues scoping and deep-analysis
re-hit the live site on every run.

**chrome detection: variants/members/support/screenshots/without/rejected** —
`excat-navigation-orchestrator` / `excat-footer-orchestrator` are the nearest neighbors —
**different approach**
Their nav/footer work is a Tier-2 "migration finishing" phase that runs after content
import, to build EDS nav/footer *documents* from already-migrated content — not an early,
evidence-based structural detector with a support metric and human-reviewable
screenshots. It is also not a general-purpose primitive; it is EDS-specific output
generation.

**representative selection (`pick`)** — #1767 — **overlapping**
Same idea — a minimal set of pages covering every variant — but theirs derives a covering
set over **block variants** to ground a content-mapping parser; ours derives one over
**chrome variants** to pick which page gets a screenshot. Same algorithm shape, different
object covered, different downstream use.

**background jobs with status/check mechanism (queued/running/done, resumable)** — #1670
(loosely) — **different approach**
#1670 wants observability into a bulk *import* run (succeeded/failed/pending per page,
after the fact); nothing in Monarch describes a detached worker with a resumable job
file, a `status.mjs check` re-verification model, or a queue of jobs building the same
artefact incrementally.

**dashboard (read-only, `aem up`-served, live)** — #473, #1676, #1668, #1734 —
**different approach**
Same *purpose* (validate machine output at speed, spot check screenshots) but the
opposite mechanism: chat-first, embedded in the EMA React app with AI "magic wand" edit
buttons, backed by workspace-service — not a static, read-only page served by the site's
own local dev server.

**`REPORT.md` (append-only sections, one per step)** — #473's "Download Report action" —
**overlapping**
Both want a shareable, human-readable summary; #473's is an HTML export of the scope
report generated on demand, not a running append-only log keyed to a step graph.

**"mechanism not hint" checks (re-verify from disk)** — #1768, #1789 — **same principle,
different scope**
#1768's coverage gate and #1789's "ground-truth verification" both refuse to trust a
self-reported pass — same philosophy as our `status.mjs check <step>` — but applied to
content-mapping correctness, not pipeline step completion.

**agent looks only at screenshots, never raw captures** — #473 ("selecting a page should
display... page screenshot") — **overlapping, different actor**
Theirs is a **human** reviewer looking at a screenshot in a UI to validate machine
output; ours is an **agent** policy (never read `chrome/.captures/*.json`) to bound token
cost and avoid the agent inventing detail from a huge JSON blob. Same artefact type,
different consumer, different reason.

**cache-first, "never touch the origin after cache"** — none — **absent, likely
contradicted**
Monarch's "optional, on-demand LLM deep analysis... over representative template URLs"
(architecture doc §4, Shift 1) and the catalog pass itself say nothing about caching —
the natural reading is that both re-fetch the live site on demand, every time they run,
with no cache gate at all.

## 5. Where they collide or contradict

- **Two different "who owns this JSON" philosophies.** #1766 solved a real multi-producer
  conflict with a precedence rule plus a `provenance` stamp on every record inside one big
  file (`page-templates.json`). Our model is one writer per artefact
  (`status.mjs` alone writes `urls.json`; a worker alone writes `chrome.json`) with no
  provenance field because there is exactly one producer. If our artefacts and theirs ever
  needed to sit in the same project (e.g. a shared review UI reading both), we would either
  need to adopt their provenance-stamp convention for anything a human can edit, or keep the
  two artefact families strictly separate and never let a human edit ours directly.
- **"Template" means different things.** Monarch's template is a URL-pattern cluster with a
  `page-templates.json` row, blocks, and a covering set — a semantic grouping meant to drive
  what markup gets generated. Our closest concept is the inventory's "group" (first path
  segment), used only to pick a representative sample for caching cost control — it carries
  no semantic claim about shared markup. Reusing the word "template" across the two systems
  would be actively misleading.
- **"Block" and "chrome variant" are structurally similar but categorically different.**
  Monarch's blocks are reusable **content** components (cards, columns, heroes) instantiated
  many times *within* a page and across pages, mapped 1:1 to an EDS authoring block. Our
  chrome variants are **site-wide, singular-per-page** structural regions (the one header,
  the one footer) detected by the same kind of technique (recurring DOM fingerprint across
  pages) but never intended to become authorable content blocks. If someone tried to feed
  our `chrome.json` into their `block-catalog.json` pipeline expecting a "header block," the
  systems would talk past each other.
- **"Representative" is overloaded.** #1767's representative/covering-set page is the page
  used to **derive and verify a content-mapping parser** — a functional target. Our
  representative page (per chrome variant) is purely an **evidence** page for a screenshot a
  human looks at. Same word, different contract; a shared consumer would need to
  disambiguate which "representative" it's reading.
- **Phase order and origin access assumption.** Monarch's pipeline runs scope → block
  library → block mapping → coverage gate → bulk import, and nothing in the issues describes
  a caching precondition — the natural reading is live-site access at scope time and again at
  "deep analysis" time (representative template URLs), and possibly again per page during
  bulk migration. Our pipeline treats "never touch the origin after cache" as a hard rule,
  enforced by an offline proxy that 404s on anything uncached. If Monarch's block/template
  work were layered on top of our cache, its "optional on-demand deep analysis" step would
  either need to become cache-aware (read from our proxy) or would silently defeat the
  cache-only guarantee the moment it ran.
- **Source of truth granularity.** Ours is one URL-level file (`urls.json`) plus one
  chrome-level file (`chrome.json`), each with exactly one writer and no cross-run merge
  logic beyond "never delete a record, mark `inLastScan: false`." Theirs is a template-level
  file with block-level nesting, two active producers, and an explicit merge/precedence
  policy litigated over multiple issues (#1766, #1672, #1767). Combining the two would need
  a decision about whether URL-level facts (kind, migrate, cache status) become another field
  on their per-template/per-page objects, or stay a separate file theirs reads.

## 6. Ideas worth reusing here (ranked)

1. **Provenance stamp + producer precedence (#1766).** Add a `provenance: {source,
   generatedAt}` field wherever more than one producer could write the same record over
   time — most concretely, `chrome.json` once a human can edit a variant's placement (there
   is no edit UI today, but the design already anticipates "the operator compared the two
   header variants" by hand). Reuse: adopt the pattern `source: detector | operator-edit`
   with detector runs never clobbering an operator edit on re-run. Effort: **S** (one field,
   one precedence rule enforced at write time). Risk: low, but only pays off once an edit
   path exists; premature before that.
2. **Keep the failures, not just what worked (#1789).** Our `chrome.json` `rejected[]`
   already records *why* a candidate was rejected by the detector, but nothing distinguishes
   a detector guess a human later confirmed wrong from one nobody has looked at yet. Adding
   a two-value grade (`confirmed-rejected` / `unreviewed`) to `rejected[]` and to variant
   entries would let a re-run avoid re-surfacing the same false positive for review. Effort:
   **M** — needs a place for a human correction to land, which we don't have (no edit UI);
   the grade itself is cheap, the producer is not. Risk: speculative until an edit surface
   exists; don't build the field before the workflow that fills it.
3. **Covering-set derivation generalized (#1767).** Their algorithm — minimal set of pages
   covering every variant of something, from a `thing -> pages[]` map — is exactly what our
   `pick` command and our chrome-variant representative selection both hand-roll separately
   today (`pick --count N` is round-robin over groups by count; chrome's `representative()`
   just takes the shortest URL among pages carrying every core member). A single small
   utility (`coveringSet(variantToPages)`) shared by both would make the selection
   *provably* representative (every variant gets at least one page) instead of incidentally
   so. Effort: **S** — the function is a handful of lines; the value is replacing two
   ad-hoc heuristics with one audited one. Risk: low; cap the set size so an exotic site
   with many rare variants doesn't explode the cache/screenshot budget.
4. **Cross-page coverage gate before declaring a step done (#1768).** Their insight — a
   parser that passes on its own representative page can still silently miss a variant that
   only appears on other pages of the same template — has a direct analog for us: chrome
   detection already runs over *every* cached page (not just representatives, per the
   design's explicit decision), so we already avoid this specific trap for header/footer.
   The reusable idea is the **check discipline**: before any future step claims a template
   (or a page group) is "handled," re-verify against the full set of pages it claims to
   cover, not just the one it was derived from. Effort: **S** (we already do this for
   chrome; worth stating explicitly as a rule for any future step that derives something
   from a sample). Risk: none — it's already our practice, just not written down as a named
   principle.
5. **Per-page trust/status model for a bulk run (#1670).** If this pipeline ever grows a
   step that acts on many pages individually (not just detects across them, as chrome does),
   their fields — succeeded/failed/pending, a failure reason, traceability to the artefact
   version used — are a reasonable minimum bar to copy. Effort: **S** if/when that step
   exists. Risk: none now; not applicable to today's steps, which are all detect-only.
6. **Per-project learning overlay (#1790).** Interesting for cost/latency compounding on
   large sites, but three-layered, feature-flagged, and designed for a **mapping** workload
   we don't have (matching content into blocks). Not actionable at our current scope
   (detection only, no mapping, no per-block matching). Rank low; revisit only if this
   pipeline grows a content-mapping phase.

## 7. What we have that they lack

- **A working, tested, cache-first architecture with a codified rule** ("after `cache`, no
  step touches the origin"; an offline proxy that answers uncached URLs with a 504) —
  Monarch has no cache layer; its catalog pass and "on-demand deep analysis" step both read
  as live-site operations, repeatable and re-fetchable at will, with all the bot-detection
  and rate-limit exposure that implies.
- **A measured leak number.** Task A4 of our chrome plan opened ten cached pages through the
  offline proxy with the network log on and counted **814 of 1,221 requests (67%) still
  going live** to third-party hosts (search, consent, analytics, image CDN) before locking
  `network.allowedOrigins` down — a concrete, falsifiable finding. Nothing in any Monarch
  issue reports a comparable measurement of what a "read-only" or "offline" step actually
  touches.
- **A shipped, replay-tested chrome (header/footer) detector** with a fingerprint +
  geometry + support model, validated on three real ~100-page caches and one 6,687-URL
  production site, with named failure modes fixed in the underlying capture tool
  (page-tree) rather than worked around downstream (the "transparent header" bug: a
  0-height wrapper that had absorbed a fully visible nav via `collapseSingleChildren`, then
  had that nav deleted by `pruneZeroHeightLeaves`). Monarch's equivalent (#1106) is a design
  discussion with no shipped detector and an explicit admission that today's block detection
  is "rudimentary keyword matching."
- **A resumable, detached-worker job model** (`warm.mjs`, `chrome.mjs`: queued/running/
  done/stopped/failed states, `--force` to redo, resume-by-default, a `status.mjs check`
  that re-verifies from disk rather than trusting the worker's own report) — Monarch's
  closest analog (#1670, bulk-run status) is still an open issue with no design for
  resumability or queuing, only acceptance criteria.
- **A stated quality bar independent of any one feature**: zero runtime dependencies, Node
  ≥ 22, ≤100-char lines, no site-specific residue, replay harnesses run against copies of
  real production caches before any detection-logic change. No Monarch issue specifies a
  testing strategy beyond checkbox acceptance criteria; test plans are not mentioned.

## 8. Open questions to take to them

- Where would header/footer (chrome) detection fit in your pipeline, if at all — inside
  `excat-site-catalog`'s block detection (#1106), a distinct step, or genuinely out of scope
  because your nav/footer orchestrators only build authoring documents from
  already-migrated content, after import, not detect chrome structurally beforehand?
- Does `excat-site-catalog` (or the re-imagined `excat-site-analysis`) ever read from
  anything but the live site today, and is a cache-first precondition (would need to change
  is your "on-demand deep analysis over representative template URLs" step, per the
  architecture doc's §4 Shift 1) something you'd consider, given no issue currently
  mentions caching?
- Is `page-templates.json`'s template/URL membership meant to be the canonical inventory of
  every URL on the site (kind, redirect, migrate/no-migrate), or do you assume a separate
  upstream URL-discovery artefact feeds it that we haven't seen (`excat-url-discovery` is
  named in the architecture doc as "already standalone and catalog-callable" but no issue in
  this set describes its output shape)?
- Would you want a shared `provenance`/precedence convention (source + timestamp,
  detector-never-clobbers-human-edit) applied to detector artefacts outside
  `page-templates.json` too, if a future shared review UI needed to trust both families the
  same way?
- #1767's covering-set algorithm and our chrome-variant representative selection solve the
  same shape of problem (minimal set covering every variant) for different objects (block
  variants vs. chrome variants) — is there appetite for one shared utility, or is that
  premature until the two pipelines actually share a codebase?
- #1670 (bulk-run status) has no design yet for resumability or a job queue — would a
  detached-worker-plus-status-file model (like `warm.mjs`/`chrome.mjs`) be a reasonable
  starting point, or is that expected to live entirely in workspace-service's existing job
  infrastructure (which we haven't read)?
- #1789's trust grade (`verified_worked`/`verified_failed`/`unverified`) is scoped to block
  mappings — would the same three-value grade make sense on structural detections like
  chrome variants and rejected candidates, if the two systems ever shared one review UI?

## References

- Epic: https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/issues/1671
- Architecture doc (PR #1793, merged):
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/pull/1793
- `page-templates.json` single source of truth (fixed by PR #1700):
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/issues/1766
- Scoping emits page-templates.json + visual-trees.json:
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/pull/1700
- Migration classify + cluster flow (relay, `run-classify-pipeline.js`):
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/pull/1635
- Block identification design discussion:
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/issues/1106
- Scope report review view:
  https://github.com/Adobe-AEM-Foundation/aem-experience-catalyst/issues/473
