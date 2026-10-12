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
- **Brand is a phase of the `chrome` run, not a step**: after detection, the run reads the
  header fragment and writes `website/brand.json` (schema `website/brand@1`, derived) and
  the logo as evidence under `fragments/<id>/`. `STEPS` is unchanged; the `chrome` check
  fails while `brand.json` is older than `fragments.json`. No brand is a flag, not a failure.
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

### 7.25 Brand (a phase of chrome)

Spec: data model §3 `website/brand.json`.

- `migration-data`: register `website/brand@1`, `readBrand` / `writeBrand` in
  `lib/website.mjs`, schema test (accepts the shape, rejects the wrong one); the spec copy
  `references/data-model.md` brought level with the spec here.
- `migration-pipeline`: `lib/brand.mjs` (logo from the header region with page-collect's
  icon/logo classifier; name candidates from JSON-LD, `og:site_name`, `application-name`,
  logo alt, `<title>`), called by the chrome worker after detection; the logo to
  `fragments/<id>/logo.<ext>`; a run summary naming what was found; the `chrome` check;
  `steps/chrome.md` one method item and one output; `references/brand.md`.
- Dashboard (`dashboard/server`): `store.ts` declares `website.readBrand`; `factory.ts`
  adds `brand` to `Factory`; `api.ts` comments it; `pnpm api-docs`; a `factory.test.ts` case.
- e2e: the brand's summary as a judgement fact beside the baseline (`factsOf`), not a check:
  no brand is a flag, it does not fail a run.

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
| `d0f94b77` (`mpipe-7.19-bandage`) | 7.19 | the nine misread pages, each looked at: images pinned before the shot (NASA 214 → 8 broken, re-reads 18 → 0), re-read while growing, FREEZE, pseudo-element paint, `access rendering "<css>"` (aem.live reveal), broken image / embed named in the detail; 9 → 4 flags on 316 pages |
| `6a0d78df` (`mpipe-7.20-misread-ref`) | 7.20 | `references/misread-pages.md`: what each detail is, the act, what the capture already does and why, how to look |
| lab `_lab/haiku-wknd`, `_lab/hybrid` | — | level 1 by a vision model alone (Haiku 5.5 high, Sonnet 5.5 low) on strips; then the hybrid: candidates from the tree's siblings, kind per candidate, merged kind derived — 70 pages, 7 sites, $0.09; the reference for what follows |
| lab `_lab/s1` (`RESULTS.md`) | — | the System 1 questioning strategy: facts as words + five yes/no + rules; Clef vs Haiku kind 68 → 90 %, merge 85 %, 98 % repeatable; cost per page ≈ Haiku's ($0.0015), 3× faster |
| `8fafdc09` (`mpipe-7.21-structure-s1`) | 7.21 | `structure` = candidates-system1 (replaces bands-system1): tree candidates, facts, Clef, rules; `pages/structure@2`; review by kind with rule overrides shown; 70 pages: kind 90 %, merge 85 %, 43 identical to Haiku, 6.2 k tokens/page |
| `c3789324` (`mpipe-7.22-structure-l2`) | 7.22 | sections opened two levels down: wrapper walk, side columns as layout, EDS text runs unasked, same-kind merges inside, members as children; composition items = leaves + side columns; review draws depth; 93 sections opened, 0 into itself; ~7.6 k tokens/page |
| `f92df2f4` | 7.22a | a section's layout is what opening it found; a grid's columns are not a side layout (NASA Chas Hoff, read by the user) |
| `0091a4c7` (`mpipe-7.23-structure-ref`) | 7.23 | `references/structure-method.md`: how the method was chosen, level 1 settled, level 2 built not settled, the contract proposed; handoff `docs/handoffs/2026-10-10-structure-levels-handoff.md` |
| `0a765804` (`mpipe-7.24-structure-tree`) | 7.24 | one operation at every depth: cut (tree's columns / stack / wrappers / layers carried), qualify (section, block, default content, layout — `is_layout` only side by side), dig until nothing is a container; checks of default content holding parts; schema `pages/structure@3` (tree); review with per-node marks exported as JSON; 70 pages, 895 questions, ≈ $0.005/page, 6 unresolved |
| `43f278b8` | 7.25a | the access recipe's stealth script injected into every session (stored, never applied; myastrazeneca.ch CloudFront 502) |
| `16905a2a` | 7.25b | a chosen chrome part at two DOM positions is two variants (`DETECT_VERSION 6`) |
| `1a710767` | 7.25c | capture: fixed backgrounds scroll, overflow across clipped, a kept fixed header bar's background recorded (`CAPTURE_VERSION 12`); browser fixture test |
| `0341c75f` | 7.25d | access: a rerun keeps a reader's overlays (`by: reader`) and rendering rules; `access rendering --remove` |
| `73a230ed` | 7.25e | structure: prose runs at the first level, default runs on one ground, checks before merges, alike items (lists of cards) as one block |
| `50bd2fe2` (`mpipe-7.25-bench-level3`) | 7.25 | seven new sites through the pipeline (`bench-level3`), reviews with marks; 70 pages, 1 361 questions, ≈ $0.005/page median |
| `6647b6e` ($W) | E2E-1 | e2e harness (`tools/e2e/run.mjs`); first run moose × Opus 5.5 (skills `50bd2fe`): 42 min, $3.61, FAIL on triage only — retro found the 1541 px → 5 px last triage slice (same 5 pages as bench-level3), protocol-relative asset origins neither counted nor stored, triage done before chrome, untriaged pages in `sample`; run dir `~/repos/ai/migration-tests/e2e-runs/moosemountainvineyards-com-opus-20261011T0914/e2e/retro.md` |
| `d67864b7`…`9aa4d90c` | 7.26 | from E2E-1's retro: triage no sliver slice (1541 px → 5 px refused), `unread` after two failures, check after chrome; protocol-relative assets counted and stored; run ids unique within a second; `sample` triaged only; briefs (fixes before chrome, rerun once, notes name what was opened) |
| `35b9f68` ($W) | E2E-2 | moose, skills `9aa4d90`, one model per run: **Opus 5.5 PASS** 31 min $2.83 · **Sonnet 5.5 PASS** 17 min $0.73 · **Haiku 5.5 PASS** 27 min $0.08; all checks green; quality differs (Sonnet missed the Commerce7 asset origin, 1 overlay vs 3); every retro asks `decide-page --by`, batched decisions before one chrome run, a page-prep command; retros under `~/repos/ai/migration-tests/e2e-runs/moosemountainvineyards-com-*-20261011T16*/e2e/retro.md` |
| `4b0ec1ee`…`faa3cc47` | 7.27 | from E2E-2's retros: `decide-page --by agent` (a new `agent` reason) and its summary refresh; `pipeline access prep` (recipe, rules applied, detection, residual check, viewport shots, CMP rules merged); discover sends a browser's user agent (CloudFront 403); structure refreshes the summary; the summary fresh by content, not date |
| `d138193` ($W) | E2E-3 | myastrazeneca.ch, one model per run: **Opus PASS** 40 min $3.98 (skills `93dda57`) · **Sonnet** 29 min $1.06, all checks but `steps` (discover stale: fixed in `2a15a95d`/`faa3cc47`; first attempt stopped at discover on the 403, fixed in `f43299df`) · **Haiku PASS** 37 min $0.10 (`2a15a95d`); all three found the stealth need, the HCP gate and both header positions; harness survives a full disk, `--finish`; open: access prep picks by group (here languages), chosen chrome ids lost on recapture, identical variants not merged, System 1 tokens unpriced |
| `cfcd9800` | 7.28 | chrome: a variant is the set of selectors a page carries (one header at two DOM positions; `DETECT_VERSION 7`); a lost chosen candidate fails the chrome check; `access prep` picks the deepest page and one of median depth, not one per group |
| `5f71ee9`, `012f111` ($W) | E2E-4 | jsw.in, skills `cfcd980`: **Opus PASS** 42 min $3.51 · **Sonnet PASS** 29 min $1.07 · **Haiku PASS** 51 min $0.18; all three named the S3 bucket and Google Fonts, hid the fraud modal and the cookie banner, wrote the GSAP rendering rule; Opus and Haiku decided 33 pages out, Sonnet 9 (parked instead); checks now judge chrome on pages that are pages (not decided out, not parked as shells), the share over all pages in the facts |
| `012f111` ($W) | E2E-5 | continental.com/en: **Haiku leading, Sonnet on medium steps** 37 min $0.98 (Sonnet's access and chrome subagents $0.81) · **Haiku alone** 40 min $0.21; both fail only `unresolved` (3 on one sample page, as the baseline: the structure method's); both found the shadow-root consent manager and the specific selector it needs, named cdn.continental.com, header on every page; the mix bought nothing measurable at 5× the cost; monitor fix: workflow runs in the lowercased project directory |
| `($W) configs/backlinko-haiku.json` | E2E-6 | backlinko.com, Haiku 5.5 alone, skills `cfcd980`: **PASS** 49 min $0.31 ($0.18 of it System 1: 412 structure questions, $0.015/page); review added to the marking set (`e2e-runs/backlinko-com-haiku-20261012T1145`); the retro says the pass hides losses: a second `assets` call replaced the first (tools.backlinko.com dropped, 4 tool pages lost), lazy `<picture>` images blank offline, 7 of 9 root pages too tall, 10 of 55 picks 404, an `rm` under `migration/` |
| `fb343cba`, `b93a51d4` (`mpipe-7.25-brand`) | 7.25 | brand as a phase of chrome: `website/brand@1`, `lib/brand.mjs`, the check on `method.inputs`, `references/brand.md`; dashboard `Factory.brand`; e2e fact; read live on aem.live and MDN (in-page expression) |
