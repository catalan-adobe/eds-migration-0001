# migration-pipeline — the pipeline as a client of the data layer

Spec: `migration-data/references/data-model.md`. The analysis pipeline rebuilt on
`migration-data`: a new skill, `plugins/web/skills/migration-pipeline`, with the process
the model names — `discover`, `access`, `cache`, `chrome`, `elements`, `blocks`, `report`
— each step a brief for an agent and a script that reads and writes only through the
layer. The engines are kept where they earned it (page-tree's bundle, the chrome
detector, the decomposition, the warm driver); their storage is not. `content-pipeline-v2`
stays as it is, untouched, alongside.

Rules as before: zero runtime dependencies; Node ≥ 22; `node --test`; ≤ 100 chars a
line; every step a brief ≤ 60 lines ending with its check; one commit per task with a
ledger row; replay before any detection change; nothing about a site in the engine.

## Decisions

- **A new skill, not a rewrite in place.** Nothing of the step-shaped storage is carried
  over; engines are copied as they are needed and lose their file knowledge on the way.
  `content-pipeline-v2` is left alone — nothing is deleted.
- **Steps are the model's process.** `setup` (installing tools and siblings) is the
  skill's own first command, not a step: `pipeline setup` records what it installed in
  `migration/.work/setup.json` (run-class, not part of the model).
- **Done-checks are data checks**, supplied by this skill to `state.compute`:
  - `discover`: `pages.json` has in-scope pages; `website.json` refreshed after it.
  - `access`: `access.json` exists, verified on ≥ 2 pages besides the home page.
  - `cache`: every page of the approved selections has `cache` on its record; no open run.
  - `chrome`: `fragments.json` exists; every cached page has a composition whose template
    fragments are resolved, or a `no-header`/`no-footer` reason; method inputs current.
  - `elements`: `types.json` current to the compositions' method inputs; every cached page
    has a composition with sections; no recurring type undecided.
  - `blocks`: `inventory.json` derived from the current `types.json` and `elements.json`;
    every block name valid; coverage read.
  - `report`: `views/report.md` newer than every file it is rendered from.
- **The visual tree is a method artefact**: `pages/<id>/visual-tree.json` (derived,
  schema `methods/visual-tree/tree@1`, registered by this skill — the layer accepts a
  client's schemas). Capture is a phase of the `chrome` run, not a step: `chrome` captures
  what is missing, then detects. `elements` reuses the trees.
- **`chrome` writes compositions**: template fragments resolved, `sections: []`,
  `omitted` with what it dropped; `elements` rewrites them with sections. A composition
  without items reads as empty until `elements` runs — the inventory says so.
- **Runs through the layer**: every worker starts a run, heartbeats progress, finishes
  with a summary in words; `state.json` is written after every command.
- **Notes through the layer**: a step's words (`status.mjs section`) become `pipeline
  note <step> agent "…"`; the runner's summaries are notes by `runner`.
- **One method file**: `elements/methods/visual-tree.json` holds what `rules.json` held
  minus what moved to `elements.json` (containers → `wrapper`/`section`, fragments →
  `fragment`, chrome → `fragment` with a part); keeps identity exclusions, noise classes,
  leaf tags, thresholds, merge, reject.
- **Dashboard** reads `state.json`, `pages.json`, `fragments.json`, `inventory.json`,
  `views/report.md`; served as before by `aem up`; synced from the skill on start.

## Parts

### 7.1 Skeleton, setup, discover

- Skill scaffold; `scripts/pipeline.mjs` CLI (`setup`, `state`, and one subcommand per
  step as they land); `lib/checks.mjs` with the checks table; `pipeline state` =
  `state.write(cwd, CHECKS)` + `asText`.
- `discover`: the site-scan sibling as before; result into `pages.upsert` (discovered
  from, source, at); `website.refresh`; a runner note with the proposal (the groups to
  cache, or all); a run with its summary.
- Brief `steps/discover.md`.

### 7.2 Access

- `access`: probe (browser-probe) and prep (page-prep) as before, their findings merged
  into `website.writeAccess` (browser, overlays, scroll fix, verifiedOn); the prep-verify
  pass adds pages to `verifiedOn`. One step, two briefs' worth of work folded into one
  brief with the two phases.

### 7.3 Cache

- `pipeline pick --count N [--audit] --write <name>` → `selections.create` (criteria
  kept); `pipeline approve cache <name>` → `migration.approve`; `cache` worker: the warm
  driver on the layer — a run per selection, each visited URL → `pages.upsert` with http,
  redirect, finalUrl, kind, cache; the verdict follows. Reasons the table derives itself.
- The page-cache proxy's layout stays the proxy's; `cache.path` on the record.

### 7.4 Chrome (with capture)

- The `chrome` worker: capture the missing trees (page-tree bundle, prep expression,
  settle, top) → `pages/<id>/visual-tree.json`; detect (the chrome engine) → template
  fragments **grouped by part** (one header, one footer, however many bands; a second
  design only with a label) → `website.writeFragments`; per page a composition with its
  fragments → `composition.write`; pages without → `pages.setReasons('chrome', …)`;
  evidence crops under `fragments/<id>/`.

### 7.5 Elements and blocks

- `elements` worker: decompose every tree with `elements.json` + `methods/visual-tree.json`
  → compositions with sections and items (wrapper through, section with style, fragment
  item, skip to omitted) → `elements.writeTypes` (seeds decisions) → inventory. Crops as
  evidence per type. The loop: decide (`pipeline decide-type` or the CLI), rerun.
- `blocks`: `inventory.write`; the check on names and coverage. The `blocks` brief is the
  decision brief (the typing test, the six kinds).

### 7.6 Report, dashboard, replay, deletion

- `report`: `views.writeReport`; brief.
- Dashboard on the new files; integration test.
- Replay harness re-pointed; expectations re-recorded in the new shapes.
- `migration-pipeline` documented; tag.

## First runnable slice

7.1 + 7.2 + 7.3: `setup → discover → access → cache` on a clean project, from the briefs,
producing `pages.json` with verdicts, `selections/`, `access.json`, `website.json`,
`state.json`, `views/report.md`. That is the ground the operator's other decomposition
experiments stand on; it exercises verdicts, selections and runs with real data before
chrome and elements move.

## Commit ledger

| sha (tag) | task | what |
| --- | --- | --- |
| `bea7a44` (`mpipe-7.1`) | 7.1 | skeleton, setup, discover; live: 7271 URLs, 34 groups |
| `2be09fd` (`mpipe-7.2`) | 7.2 | access (probe + prep → access.json), pick with selections |
| `a4bbe26` (`mpipe-7.3`) | 7.3 | cache on the layer; live: 50 pages, 6.5 min, 0 failed |
| `b52b2cf` (`mpipe-7.4`) | 7.4 | chrome on the layer; live: 44 trees, header + footer on all |
| `a561f8f5` (`mpipe-7.6-report`) | 7.6 | report: views/report.md + report.html, the report step |
| `2683a59` (`mpipe-7.7a-shots`) | 7.7 | shots, too-tall, look-then-act, asset origins, fill |
| `8a5eaa45` (`mpipe-7.8-triage`) | 7.8 | triage: System 1 level 1 beside chrome; live 44 normal |
| `64ae2e5` | 7.8+ | empty as 4th question (0 flips); 247-page run: 242 normal, 1 review, 4 empty |
| `ef3b80f` (`mpipe-7.9-sessions`) | 7.9 | chrome N sessions, phase timings; 246 pages in 3.3 min |
| `b3f690d` (`mpipe-7.11-chrome-rules`) | 7.11 | six-site bench; chrome rules; review 108 → 20 |
| `5b59a3a` (`mpipe-7.12-choose`) | 7.12 | candidate sheet + choose; MIT footer, -14 one header |
| `04812d2` (`mpipe-7.13-verdicts`) | 7.13 | verdicts, annotation sheet, sample; 7 sheets |
| `9983ba86` (`mpipe-7.14..16`) | 7.16 | band capture ported; structure iteration 1; review sheets |
| `e1e85a2c` | 7.16a | three capture faults seen on one aem.live page: curtain (fixed > 300 px), scroll after prepare (pinned, scrolled dump fails), clip-path-hidden panel |
| `6fc3b30c` (`mpipe-7.17-pixels`) | 7.17 | the picture checks the band capture: bg-mismatch / unpainted / unclaimed-ink; 557 pages, 9 flagged, 0 wrongly |
| `2aa05b2a` (`mpipe-7.18-misread`) | 7.18 | check runs with the chrome step; `misread` reason; report "Picture"; brief |
