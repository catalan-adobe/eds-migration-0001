# content-pipeline-v2 — `mapping` step: plan

Spec: `docs/superpowers/specs/2026-09-21-content-pipeline-v2-mapping-design.md`.
Operating rules as for the elements plan: acceptance is the outcome on disk; every gate
after every task (`npm test`, `npm run check`, `npm run test:integration`, repo
`npm run validate`); one commit per task, ledger row here; ≤ 100 chars a line; no site
residue; nothing in the engine knows a site.

## Part A — engine: `scripts/lib/mapping.mjs` (+ tests)

- `seedMapping(elements, previous)` → `{ types }`: every recurring type present with the
  previous decision or `kind: null`; previous entries for types no longer recurring kept.
- `validateMapping(mapping)` → reasons: shape, kinds, block names (pattern, reserved),
  `block` required with `kind: block`, absent otherwise.
- `deriveInventory(elements, mapping)` → `{ blocks[], defaultContent, skipped[],
  coverage: { pages, covered, uncovered[] }, undecided[], orphaned[] }`; a page is
  covered when every section's type is `block` or `default-content`; fragment contents
  and rejected sections do not count against it.
- `renderMappingMd(inventory)` → the report; every line ≤ 100 chars.
- Tests: seeding keeps decisions and adds nulls; validation names each fault; coverage
  arithmetic on a three-page fixture; orphan detection; rendering has every section.

## Part B — the step

- `scripts/mapping.mjs`: reads `elements.json`, seeds or reads `mapping/mapping.json`,
  validates, derives, writes `mapping/mapping.md` + `mapping/inventory.json`, upserts the
  report section (blocks, coverage, undecided count). No worker: it is synchronous.
- `STEPS`: `mapping` after `elements`, tier medium, writes `mapping/mapping.json`,
  `mapping/mapping.md`, `mapping/inventory.json`; `CHECKS.mapping` per the spec (elements
  check must pass; no null; names valid; derived files newer than their inputs).
- `steps/mapping.md` (≤ 60 lines): purpose, inputs, method (run, read crops, decide in
  the JSON, rerun, read coverage; back to `containers` for a section; engine gap named),
  outputs, Done with the check command.
- `references/project-structure.md`: the three files. SKILL.md: table row (tier, writes,
  takes ~1 min a run), `mapping` in the step list.
- Tests: `checks` for each failure reason; brief tests pick the new brief up
  automatically; integration: a project with an `elements.json` fixture → `mapping.mjs`
  seeds, `check mapping` fails with "N types undecided", decide all → passes.

## Part C — dashboard

- Type cards: kind chip (`block hero` / `default content` / `skip` / `undecided`).
- **Blocks** panel: the inventory table with crops, from `mapping/inventory.json`, loaded
  only when the step is done and the file newer than the panel's last load (as elements).
- Integration test extends the dashboard one.

## Part D — on the `-13` project

- By hand first: decide the 25 recurring types from the crops; read `mapping.md`; record
  what the vocabulary could not say (an engine gap or a rules matter) here.
- Then a fresh medium agent from the brief alone; compare its decisions with mine; fold
  wording into the brief.

## Part D on the project — read

By hand, following the brief. The seed had 21 types (25 recurring minus 4 fragment
contents). Step 3 of the brief applied at once: `column` (61 of 141 instances leaves, the
rest wrapping bare `div`s and unrelated mixes) and `component-column.row` went to
`containers`; the rerun exposed `background-component` × 11 and `container` — the onion,
as on the larger store; exclusions `-bg$`, `^vert-pad-` and three more containers settled
it in one more rerun. 30 types to decide; 17 blocks, 6 default content, 0 skipped;
44 of 48 pages covered. The four open pages hold one-page types only (`spotlight`,
`downloads`, `contentTile`, a `changeSize.text` look-alike) — more pages or a rules line.

- Two types, one block, three times: `banner.image` + `blogBanner.image` → `hero`;
  `cards.image` + `cardContainer` + `dynamicCards` → `cards`; `boxLinkContainer` +
  `boxLink` → `box-links`; the form container and its column → `form`.
- **`columns` is the honest name for the leaf columns**: a generic layout column whose
  content the capture could not see (the 300 px limit). Mapped as a block with the note
  that the transformer must look inside; the alternative — `skip` — would have left 22
  pages uncovered for a capture matter, not a content one.
- The dashboard needed a copy of the current `tools/migration/` by hand: the project was
  initialised before the panel existed (`dashboard --update`, still a follow-up).
- Engine fix from the run: seeded nulls for types dissolved by a rules change were
  reported as orphans; an undecided entry is no decision and goes (`245df3d`).
- Nothing the vocabulary could not say; no engine gap beyond the orphan wart. The site's
  names never entered the engine: the decisions live in `mapping.json`.

## Acceptance — one fresh medium agent from the brief alone, one reviewer

Run `mapping-acceptance-mub7ju2l-pzs55g` (2 agents, 17 min, $3.55). The agent passed the
check: 14 blocks, 11 default content, 0 skipped, 44/48 covered; edited only `mapping.json`
and the report section. The reviewer compared it with the hand mapping type by type and
was told not to assume the reference right; it did not:

- **Agreed** on hero, page-nav, cards (three types merged), carousel, breadcrumb (both read
  the dropdown arrows as component styling), the link grid (both types), tabs, form (both
  types), benefits, accordion, search, and every default-content type of the reference.
  Its names beat mine three times (`link-list`, `logos`, `benefits` say what the thing is;
  `box-links`, `logo-carousel`, `key-benefits` echo the class).
- **Reference better**: `quote` (a boxed testimonial with name and logo — the agent
  followed the brief's literal "a quote: default content"); `embed` for the raw-HTML
  component (the agent named the majority crop, and miscounted from three crops); `tags`.
- **Neither right**: the leaf columns. Both of us decided a type that cannot be decided —
  a container whose content the capture never saw. The agent said so in its own words
  ("mapping.json has no section kind … it has to masquerade as default-content") and
  named it an engine gap. It was. It also claimed `divider-row` was a dead-end container;
  it was in neither `containers` nor childless — the missing verification step.

Engine (`9a20012`, tag `cpv2-mapping-accepted`): **container leaves** — a container
identity whose instances all lack children — are not seeded, are listed as their own
section, keep their pages open with the reason, and a stale decision on one covers nothing.
On the project: 36 of 48 covered, 12 open for leaves alone — the 300 px capture limit
priced in pages for the first time. Brief: a boxed testimonial is a `quote` block; one
item of a repeated group takes the group's name; two components under one type name what
the source element is (raw HTML: `embed`); counts from `elements.json`, not from crops;
leaves are the runner's, not the agent's.

## "12 of 48 pages open for container leaves" — what it was

The number had been read as the 300 px capture limit. Recapturing the project at 200 and
150 px (`replay/width.mjs`, a lab copy per width) moved nothing: `column` stayed a leaf on
16 pages at every width. So it was not the width. The DOM under a leaf column was complete
— `container → section.row → two 424 px columns → content` — and page-tree dropped the
subtree at the row.

- **Cause 1, page-tree**: containment was exact within 2 px. A grid row with negative
  margins (878 px inside an 848 px container — every Bootstrap-style row) read as an
  element rendered outside its parent: the collapse stopped, `promoteEscapedNodes`
  re-parented the row to the nearest wider ancestor, the columns went with it. Downstream:
  the container came back childless (the leaves) and the row surfaced elsewhere as a type
  of its own (`component-column.row`, 50 instances of "unrelated" content). Fix
  (`309007d`): a child is contained when nine tenths of its area lie inside the parent; a
  dropdown below its trigger or a banner off to the side still escapes. Replayed on three
  caches: sections −59, two types fewer, one stray footer variant merged. Leaves on the
  project: 18 → 9 pages. This very likely is C1 (the `anchor` absorbing what follows) too.
- **Cause 2, the width**: what remained were four-up rows of `col-sm-3` at 293 px and
  quarter-width rails — genuinely under 300 at a 1280 viewport. Default min-width → 250
  (`4a5bb17`); 200 saw nothing more. Leaves: 9 → 2 pages; four new types to decide (a
  sticky left-rail TOC, right-rail items, a `four` wrapper — the onion, one more line).
- **The width's price, and its fix**: at 250 the footer's five link columns became
  structural children; the site's other-language footer has four, so its fingerprint
  differed and twelve pages of three caches lost their footer. The chrome fingerprint now
  hashes the *set* of children fingerprints, not the list — one more of the same child is
  repetition, as the elements engine already reads a variant. Footer back to every page;
  on the project 48/48 header and footer (was 47 footer).

Final on the project at 250 with both fixes: 73 types, 38 recurring, leaves on 2 pages,
38/48 covered with 4 types still to decide (the newly visible content). Tag
`cpv2-capture-250`. Lesson kept: a "known limit" is a hypothesis until the number moves
when the limit does — this one did not, and the real cause was a page-tree rule that had
been wrong on every grid site since the beginning.

## The project brought to the new default

Reinstalled from `cpv2-capture-250` (the `.claude/skills/page-tree` mirror upskill leaves
had to go first: detection found it and skipped the install), recaptured, chrome 48/48
both, elements 73 types / 38 recurring, four new types: `four` → `containers` (the
onion), the left-rail TOC → `toc` (same component as the top bar), right-rail items →
`link-list` (one item), the generated back-to-top button → noise. `skip` would have kept
its two pages open, and `reject` took only selectors, which differ per page for generated
nodes: `reject` now takes an identity too (`669efda`, tag `cpv2-reject-identity`). Final:
14 blocks, 9 default content, leaves on 1 page, **43 of 48 covered** — from 36 this
morning, with nothing decided that the eye could not see.

## The fresh run on a clean project (`fresh-run-12-mubjjvu6-kwqxco`, 68 min, $11.27)

One medium agent, setup to mapping, from the briefs alone, at `cpv2-warm-scrolls`; one
reviewer on the disk. Outcome: 10 of 11 checks pass (report not asked); five siblings with
their source recorded; 50/50 cached, no same-host image missing (the scrolling warm at
work); chrome 48/48; elements seven runs; mapping 34 decided, 12 blocks, 42/48 covered —
close to the hand-mapped project. Not as the operator would have it, and the reviewer saw:

- **The sticky nav measured at the bottom of every page** and the header shrunk to the
  utility bar. Mine, from the same afternoon: the capture ran `prep, scrollTo(0,0)` as one
  comma expression, right while the prep was synchronous, wrong the moment the warm's
  expression became an asynchronous scroll pass ending at the bottom. The replay would
  have caught it; it was not run after the warm change ("detection-neutral", I thought).
  Fixed (`4c1a3fb`): the prep is awaited, then the top. Rule kept: **every change that
  touches what the browser does before a measurement is a detection change; replay.**
- **One page captured empty, on both projects.** Not page-tree, not a flake: the landing
  page sits at opacity 0 for five seconds after load, then fades in; page-tree prunes
  opacity 0, rightly. Three tries at a settle wait: stable element count and height
  (misses it — nothing changes but opacity); wait while a large opacity-0 block exists
  (right, 541 s for 48 pages — every carousel slide and parked chat window held the
  capture to the bound); **wait while a hole is left** — a block in the flow, a quarter of
  the viewport, opacity 0, with children, nothing visible drawn over it (`394a5c0`):
  right, 180 s. The fixture caches' one "none"-covered page captures now too.
- **"An AEM site: three to six" read as a cap on reruns**; the agent stopped one wrapper
  short (`three`, `four` mapped as `cards`) and declined the run it knew it needed. The
  brief says "no limit on reruns" (`e039e7f`). Same commit: the capture worker writes its
  report section; an empty page is not "covered".
- Not acted on: the footer's optional member that is a CTA band (chrome heuristic — an
  optional member above the mandatory one is suspect; noted); cross-host images
  (`images.synopsys.com`: 40 of 100 on the home page) outside the cache's same-origin
  scope — a decision for the operator, not a bug; the operator's authorising words for
  the cache not recorded (the prompt pre-authorised it).

Tag `cpv2-fresh-12`.

## Commit ledger

| sha (tag) | task | what | replay |
| --- | --- | --- | --- |
| `e1e4c1e` | A | `lib/mapping.mjs`: seed, validate, derive, render + tests | n/a |
| `0f095cd` | B | `mapping.mjs`, step, check, brief, structure, SKILL row | n/a |
| `3235d77` | C | dashboard: block inventory panel, kind chips | n/a |
| `245df3d` (`cpv2-mapping-step`) | D | undecided orphans dropped; run read above | n/a |
| `9a20012` (`cpv2-mapping-accepted`) | acceptance | container leaves; brief words | n/a |
| `309007d` | page-tree | containment by overlap area (rows with negative margins) | re-recorded |
| `4a5bb17` (`cpv2-capture-250`) | capture | default 250 px; set fingerprint | re-recorded |
| `669efda` (`cpv2-reject-identity`) | rules | `reject` by identity | unchanged |
| `f2efba9` (`cpv2-dashboard-follows`) | dashboard | the copy follows the skill | n/a |
| `5f0cc99` (`cpv2-warm-scrolls`) | cache | the warm scrolls through the page; lazy images | n/a |
| `4c1a3fb` | capture | prep awaited, then the top (sticky nav regression) | re-recorded |
| `394a5c0` | capture | wait for a hole to fill, bounded | re-recorded |
| `e039e7f` (`cpv2-fresh-12`) | three fixes | rerun limit; capture section; empty page | n/a |
