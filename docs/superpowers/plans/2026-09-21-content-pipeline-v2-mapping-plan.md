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

## Commit ledger

| sha (tag) | task | what | replay |
| --- | --- | --- | --- |
