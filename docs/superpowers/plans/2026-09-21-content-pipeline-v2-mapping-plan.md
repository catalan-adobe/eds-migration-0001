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

## Commit ledger

| sha (tag) | task | what | replay |
| --- | --- | --- | --- |
| `e1e4c1e` | A | `lib/mapping.mjs`: seed, validate, derive, render + tests | n/a |
| `0f095cd` | B | `mapping.mjs`, step, check, brief, structure, SKILL row | n/a |
| `3235d77` | C | dashboard: block inventory panel, kind chips | n/a |
| `245df3d` (`cpv2-mapping-step`) | D | undecided orphans dropped; run read above | n/a |
