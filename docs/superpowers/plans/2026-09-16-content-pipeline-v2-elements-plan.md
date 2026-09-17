# content-pipeline-v2 — the `capture` and `elements` steps

Spec: `docs/superpowers/specs/2026-09-16-content-pipeline-v2-elements-design.md`. Repo
`$CODE = ~/repos/adobe-skills/.worktrees/eds-content-pipeline`, skill
`$SKILL = plugins/web/skills/content-pipeline-v2`. Same rules as before: zero runtime
dependencies, Node ≥ 22, `node --test`, every committed line ≤ 100 chars, no site names, no
internal jargon, control flow in code not prose, a step is done when a runner check says so.

Operating rules unchanged: acceptance is an outcome on disk produced by running the thing;
weakening or deleting an assertion rejects the task; after every task `npm test`,
`npm run check`, `npm run test:integration`, repo `npm run validate`; every detection rule
is replayed before it lands — `node replay/replay.mjs` over the three ~100-page caches, and
the lab probe (`lab/elements-probe.mjs`) or its successor over the 806-page 300 px store
(`/tmp/cpv2-11w300`, rebuilt from the `-11` run when needed).

## Vocabulary, once

*Decomposition* turns a rendered page into its sections and resolves each to an element
type. The *elements inventory* (`elements.json`) lists the types with evidence, plus each
page's composition and coverage. The step is `elements`; the process is decomposition.
Source element types (what the DOM shows) and their EDS classification (section, default
content, block candidate) are two fields, never one. A page's *composition* is its sequence
of types; *group* is the URL group from the inventory. Nothing is called a template.

## Baby steps

Each part is small, lands alone, and leaves the previous steps working. Order matters:
the capture split first, because both chrome and elements read the store; then the engine
without any runner surface; then outputs and check; then the loop; then scale.

## Part A — the capture becomes its own step

### Task A1 — `capture.mjs`, the store's owner

- Move the capture half out of `chrome.mjs`: `capture.mjs [--force] [--min-width 300] |
  status | stop` owns `chrome/.captures/` → renamed **`capture/`** (the visual-tree store;
  `project-structure.md` already calls it that) with `capture/captures.md` (pages captured,
  min-width, page-tree bundle version, failures) and `.work/capture/run.json`. Default
  min-width **300** (the spec's finding); the capture records it per file.
- Step `capture` after `cache`, tier low, writes `capture/captures.md`; `check capture`:
  every verified cached page has a capture at the project's min-width, none failed, the run
  is not open. A store behind the cache (verified pages without a capture) is a reason the
  check names, so a new cache phase makes `capture` fall back to `ready`.
- `chrome.mjs` reads the store and no longer captures; `chrome` depends on `capture`.
  Existing captures at 900 px are recaptured once (`--force`) — the store says its
  min-width.
- Brief `steps/capture.md` (≤ 60 lines): background, one status look, never read the
  captures. `local-cache.md` unchanged; `project-structure.md` moves the store section.

Acceptance: on a copy of the 806-page cache, `capture.mjs` fills the store at 300 px in
~16 min; `check capture` passes; `chrome.mjs` on that store reproduces header 803 / footer
801; replay harness unchanged on the three caches (their expectations re-recorded once for
the 300 px capture, with the diff read and understood before `--update`).

### Task A2 — the cache phase reports a store behind the cache

- `status` and the dashboard show `capture` as `ready` with "N verified pages without a
  capture" after a cache phase; `check chrome` and later `check elements` add "the store
  is behind the cache: run capture.mjs" as a reason when it is.

Acceptance: on the `-11` copy (806 cached, 334 captured at 900) the runner says so before
anything else.

## Part B — the decomposition engine (pure)

### Task B1 — rules object and defaults

- `lib/elements-rules.mjs`: the rules vocabulary with defaults — identity exclusions
  (state, generated names, width tokens), noise classes, leaf-component tags, container
  share 0.6, recurrence threshold 2 pages — and `readRules(project)` merging
  `elements/rules.json` (`merge`, `chrome`, `reject`, and overrides of the
  defaults) over them. Unknown keys are an error with the list of known ones.

### Task B2 — sections

- `lib/decompose.mjs`: `sections(capture, chrome, rules)` — the spec's content region:
  peel chrome-containing wrappers; peel a lone node or a dominant container unless it is a
  leaf component; drop hairlines, zero-area and off-page nodes; attach parts (selector
  prefixed by a sibling section's). Returns sections with bounds and the chain.
- Tests on synthetic captures for each rule, and a test that the five real cases from the
  exploration behave (a container next to escaped heroes; a text component with 40
  paragraphs; a promoted hero image; an off-page accessibility helper; a chrome member the
  chrome step missed → `rejected` with that reason).

### Task B3 — identity, variants, types, coverage

- `identity(node, rules)` (outermost element of the chain, own tokens minus exclusions),
  `variantKey(node, rules)` (set of children identities), `inventory(pages, rules)` →
  types with stable ids (`t-<8 hex of identity>`), pages, instances, support, median
  bounds, selectors, sample, groups, variants; per-page composition and coverage; the
  sequences view; `merge`/`chrome`/`reject` applied from the rules; classification
  as a first cut with its signal.
- Tests: repetition never splits a type; a width token never does; a merge rule joins two
  ids and keeps both in `mergedFrom`; coverage arithmetic; sequences.

Acceptance for Part B: `lab/elements-probe.mjs` is deleted and its numbers reproduced by
the engine on the 806-page store — 91 types, 51 recurring, 788 fully covered, 40 unique
types on 13 pages — recorded in `replay/expected/` as the elements baseline.

## Part C — outputs, check, step

### Task C1 — `elements.mjs` and the deliverables

- `elements.mjs [--all]`: reads the store, `chrome.json`, `urls.json`, `rules.json`;
  writes `elements/elements.json`, `elements/elements.md`, the `## elements` section; runs
  in the foreground (seconds) — no job needed; screenshots (Part D) are the slow part and
  get their own flag.
- **Incremental**: types keep their ids across runs; `elements.json` records `runs[]` with
  each run's delta (+types, +sequences) and the per-group saturation table (new types and
  sequences in the last N pages of that group).
- Step `elements` after `capture` and `chrome`, tier medium, writes `elements/elements.json`,
  `elements/elements.md`.

### Task C2 — `check elements`

- JSON parses; `capturedPages` equals the store; every captured page once under `pages`,
  every section's type exists; every type's sample selector resolves in its sample capture;
  `## elements` present; the store not behind the cache.

Acceptance: check passes on the 806-page copy; editing a type id in `elements.json` fails
by name; removing a page's entry fails by name.

## Part D — evidence for the eye

### Task D1 — crops and the evaluation report

- `elements.mjs --screenshots`: through the offline server, for every type above the line:
  three random instance crops (`screenshots/type-<id>-<n>.png`), one crop per variant; one
  outlined page per fully-covered representative. `elements/evaluation.md`: per type the
  crops side by side, height spread, position habit, variant count; the flags (tenfold
  height spread; look-alike identities; once-per-page stable position → chrome leak; one-
  section pages); the unique tail; coverage distribution; sequences; the delta and
  saturation tables. `check elements` requires the crops for types above the line.
- Dashboard: the URL group stays the primary axis everywhere; composition is a derived
  second axis inside the elements panel, never a grouping of its own. The panel shows:
  the **groups × compositions cross-tab** — per group the dominant composition and the share
  of pages carrying it, the number of distinct compositions, cached pages, saturation
  state (this is the "is this group one kind of page?" view); the **types** by support with
  crop, classification, variants, and the groups each appears in; coverage distribution;
  the unique tail collapsed. The existing URL table gains per-page **composition chips**
  and a coverage badge (full / partial / uncovered), filterable, so a group's pages can be
  compared side by side. `elements.json` carries what the panel needs (`pages[].types`,
  `pages[].coverage`, `compositions[]` with pages and groups, `groups[]` with saturation).

Acceptance: on the 806-page copy the report shows, and a reviewer can tell from the crops
alone whether `column` is one type or several — recorded as a finding, whichever way.

## Part E — the loop

### Task E1 — `rules.json` round trip and the brief

- First run writes an empty `rules.json` with the vocabulary as comments-by-example (a
  `_example` key the engine ignores). `elements.mjs` prints the delta against the previous
  run so an edit's effect is visible. Brief `steps/elements.md` (≤ 60 lines): run, read
  `evaluation.md`, edit rules or confirm, run again, two or three iterations, report what
  changed; never the scripts; a wish the rules cannot express is an engine gap in the
  report section.

Acceptance: a one-shot subagent given the brief and the `-11` copy performs one iteration
that changes something defensible (a merge or a chrome leak) and reports the delta.

### E1 on the 806-page store — the first iteration, read

`rules.json`: `containers: [column, component-column.row]`, `fragments: [experiencefragment]`.
The run says "rules changed", 91 → 158 types, 8569 → 8611 sections, 788 → 777 fully covered
(30 unique types surfaced from under the column). The column is gone; the fragment table
names the site's 33 fragment documents (`cmp-experiencefragment--contact-us---general` on
132 pages) — AEM stamps the document name on the inner div, and the chain walk exposed it.
The next layer is the EDS section itself: `background-component.<bg>.<vert-pad-*>` wrappers
(174, 112, 93, 91 pages) whose classes are styles, not identity — `identityExclusions:
["-bg$", "^vert-pad-"]` is the second edit; `DIV#.container` and the unclassed row cells
`DIV#.` are the next `containers`. Engine gap found and closed in E1: decomposing through a
node with a collapsed chain must walk the chain (the fragment's content was in it).

### E1 acceptance — one fresh agent, the brief alone (medium tier, 81 min, $1.74)

Passed the mechanism: only `rules.json` and the report section changed; no script touched;
no capture read; two iterations with the runs table read; an engine gap named rather than
worked around. The edits: two whole-page wrappers → `containers` (right, closes the
one-section flag); breadcrumb → `chrome` (wrong: content; the flag's wording invited it);
leaked footer → `reject` (wrong: `chrome`; the check's remedy said "reject"). Both wordings
fixed. The named gap — 5 pages with no section — is honest: their capture holds nothing
between header and footer (gated or script-built content that did not render offline); a
cache matter, flagged as such now. Found on the way: scripts invoked through a symlinked
skill directory silently did nothing (`isMain` now resolves the entry path).

## Part F — scale

Saturation (decided in the Part C review): read from the data, not from run boundaries — a
group is saturated when its last 10 pages in capture order brought no type its earlier
pages lack; judged on types only (compositions are a long tail), a new *variant* as novelty
is the first refinement to consider in F1 if `pick` stops too early.

### Task F1 — novelty-aware `pick`

- `pick` skips saturated groups (from `elements.json`), prefers groups with few cached
  pages, stratifies by depth / extension / query string, and reserves `--audit N` random
  never-picked URLs. `urls.md` and the inventory panel's group table show saturation and
  the number of compositions per group, so the operator sees where the next batch goes.

### Task F2 — the phase loop, end to end

- On the `-11` cache: approve a batch, warm, `capture.mjs`, `chrome.mjs`, `elements.mjs`;
  read the delta; repeat until saturation on the large groups; record how many pages it
  took to saturate each group, and what the audit sample found. Findings → this plan.

## Not in this plan

Naming or mapping types to EDS blocks; transformers; content extraction; the nested
structure inside a section (the mapping expert's concern); Monarch-shaped exports; a `split`
rule (variants show the child sets; a needed split is an engine gap).

## Deferred from Part D (recorded, not forgotten)

- Outlined full-page screenshots per representative page (`page-<n>.png`): the per-type
  crops carried the judgement on the first real run; add when a reviewer asks for context.
- `--all` for crops of the unique tail: the tail is listed with its sample URL instead.
- The structural classification (`classification`, `signal`) — the EDS reading of a type as
  section, default content, block or **fragment** (a first-class EDS element: a reference
  to another document, itself a sequence of elements): a later part, once the container
  and fragment rules exist; the spec's Outputs still show the field as an intention.
- On the type card: the groups a type appears in; in the groups table: the dominant
  composition itself, not only its share.
- A "container?" hint: the numbers (variants per instance, height spread) did not separate
  containers from rich leaves on the first run; the crops did. Not added.

## Known limits (from review)

- Parts are attached by selector prefix; page-tree's selectors stop at the nearest id, so a
  part promoted from under an id'd wrapper (`div#hero-inner > img`) is not recognised and
  becomes a type of its own. Fix, if a site shows it: page-tree records the origin parent.
- A capture's min-width is held in `.work/capture/run.json`; without a run the store is held
  to 300 px. Persist it in `project.json` the day a project uses another width.

## Commit ledger

One commit per task, one row per commit, appended as work lands. Tags mark safe points on
the fork branch; a fresh clone installs from a tag with `upskill … -b <tag>`. To find a
regression: the replay column says which row moved it.

| commit / tag | task | what changed | replay (chrome ×3 · elements 806) |
|---|---|---|---|
| `b9f7749` (tag `cpv2-chrome-stable`) | — | baseline | unchanged · 91/51/788/40 |
| `f5b6838` | A1 | `capture.mjs` owns `capture/` at 300 px | h/f same, rejected +1 ×3 · 803/801 |
| `0e6506f` (tag `cpv2-capture-step`) | A2 | store-behind-cache note; chrome fails on it | n/a |
| `dac3fbd` | B1+B2 | `elements-rules.mjs`, `decompose.mjs` sections() | 8569 sections on 806 |
| `bfa87fe` (tag `cpv2-elements-engine`) | B3 | `elements.mjs` identity, inventory | 91/51/788/40 |
| `be4cb71` | review A | minWidth first key; open states; lib moves; tests | n/a |
| `45763d4` (tag `cpv2-parts-ab-reviewed`) | review B | rules validation; drop reasons | same ×4 |
| `bc6686f` (tag `cpv2-elements-step`) | C | `elements.mjs`, runs, groups, check, brief | same ×4 |
| `c61ac27` (tag `cpv2-part-c-reviewed`) | review C | rules hash, saturation, staleness | same ×4 |
| `708dc6e` | D1 | crops, flags, `evaluation.md`; worker | same ×4 |
| `5b11da6` (tag `cpv2-elements-evidence`) | D2 | dashboard panel, composition chips | n/a |
| `c7e86d8` (tag `cpv2-part-d-reviewed`) | review D | named crops, stop path, flags | same ×4 |
| `1570c2d` (tag `cpv2-elements-loop`) | E1 | containers, fragments, chain walk, seed | same ×3 |
| `20fd237` | E1 acceptance | flag/remedy wording, `isMain` through symlinks | same ×3 |
