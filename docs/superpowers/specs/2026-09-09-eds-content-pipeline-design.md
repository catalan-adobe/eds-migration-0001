# `eds-content-pipeline` — design

Package the proven parts of the knack migration machine as one open-source agent skill in
`adobe/skills` (`plugins/aem/edge-delivery-services/skills/eds-content-pipeline`), installable
with `upskill`, portable across agent harnesses, with zero knack residue.

Sources this design draws on: `eds-migration-test-20260902` branch `test-f51`
(`tools/migration/`, `docs/migration/`), `EDS-MIGRATION-ANALYSIS.md` and
`experiment-B/REPORT.md` in this worktree.

## 1. Scope and positioning

**What it is.** The *content pipeline* of a site migration to Edge Delivery Services: inventory a
site, cluster its pages into templates, decompose each template into EDS primitives (section /
layout / default content / block), author a deterministic transformer per template, run it over
every URL into DA preview, and hand a verified content model to downstream agents.

**What it is not.** It does not design or implement blocks, apply brand, score rendering
(Lighthouse, visual parity), build header/footer, or publish to `.aem.live`. Those belong to
sibling skills (`content-driven-development`, `building-blocks`, `content-modeling`) or to the
operator.

**Consumer.** Open-source users of `adobe/skills`, on any harness (pi, Claude Code, Codex,
Cursor). Nothing may work only on pi.

**Relationship to siblings — reuse, never duplicate.**

| Sibling | Role in this pipeline |
| --- | --- |
| `page-tree` (in `plugins/web/skills/page-tree`) | **The one page-shape source of the pipeline**: `cluster.mjs` fingerprints pages from its visual tree (discover), and the analyst's divide step reads the same tree (template). Not part of the EDS plugin, so `init` checks for it and prints the install line (`upskill adobe/skills --path plugins/web/skills --skill page-tree`). |
| `block-inventory` | Survey of blocks already in the target repo, at template-stage start. |
| `da-auth` / `da-content` | Token acquisition and DA conventions; bulk upload stays in our runner. |
| `content-driven-development`, `building-blocks`, `content-modeling` | Downstream consumers of `blocks.json` and the stubs. |

**Deliberately not used:** `page-import` and its sub-skills (`scrape-webpage`,
`identify-page-structure`, `authoring-analysis`, `generate-import-html`, `preview-import`). They
are the page-at-a-time, LLM-per-page approach; mixing them in would blur the distinction this
skill exists to make. URLs no transformer matches are *reported*, not imported (§ 5).

## 2. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | One skill, `upskill`-installable, runners vendored under `scripts/` | What the tool supports; how siblings work. Revisit (publish runners to npm) only if tessl review or PR size objects. |
| 2 | Control flow lives in declarative stage specs (`stages/*.yaml`); gates live in runners; state lives in files | LLMs drift when the plan is prose. Specs are compiled once by the executor into its harness's workflow primitive; gates cannot be skipped by a mis-compiled workflow because they are not in the workflow. |
| 3 | pi dynamic-workflow scripts shipped as the *reference executor*; other harnesses translate the spec | Proves the specs are sufficient; keeps the package harness-neutral. |
| 4 | Stages: `discover`, `template`, `bulk`. Foundation (brand, header/footer, homepage) is out of scope and **not required** | The pipeline needs only an EDS repo, a DA space and a token to transform, upload and preview content; brand and header/footer are downstream or parallel work. The knack machine ran foundation first because it chased Lighthouse and visual parity, which this pipeline does not. |
| 5 | New blocks get a structural stub (`status: scaffold`), no brand tokens | Pages render cleanly for content review; design stays downstream. |
| 6 | Model tiers are a per-unit hint `tier: low/medium/high`; cost budgets are ledger-recorded, not enforced | Every harness can honour a tier; budgets are the executor's business. |
| 7 | Learning loop = `LEARNINGS.md` in the project, promoted to the skill by humans via PR | Automatic prompt self-modification is unproven and makes runs non-reproducible. The rules registry with earned scopes from the analysis session is deferred until the hirslanden run shows what a registry must hold. |
| 9 | Human-in-the-loop is non-blocking: reports surface decisions, `migration/feedback.json` carries structured overrides read at every stage start and unit boundary | Runs never wait on a human; corrections are applied through rework units, not by stopping the machine. |
| 8 | Project state at `migration/` in the EDS repo root, `.hlxignore`d; the skill directory is stateless and disposable | `tools/` is served by the code bus; upgrading the skill must never touch project state. |

## 3. Layout

**Skill** (`plugins/aem/edge-delivery-services/skills/eds-content-pipeline/`):

```text
SKILL.md  package.json  .releaserc.json  CHANGELOG.md
stages/        discover.yaml  template.yaml  bulk.yaml
prompts/       discover-report.md  analyst.md  transformer-author.md  reviewer.md  retro-writer.md
workflows/pi/  stage.mjs  templates.mjs  model-tiers.json  README.md  tools/{retro,watch-run}.mjs
scripts/       package.json  lib/*.mjs (+ *.test.mjs) incl. stage.mjs (plan | validate | check-* |
               sample-fidelity | run [--skip-llm] | record-run)  fixtures/example-site/ (two templates)
references/    method.md  transformer-contract.md  content-model.md
```

Conventions inherited from the plugin: SKILL.md frontmatter (`name`, `description`,
`license: Apache-2.0`, `metadata.version`), per-skill semantic-release files, registration in
`.tessl-plugin/plugin.json`, the external-content safety clause, PR gates (`npm run validate`,
tessl review ≥ 50 %).

**Target EDS repo** after `init`:

```text
migration/
  site.config.json               origin, originAliases, sitemaps, exclusions, thresholds, da, templates{}
  transformers/  rules/  fixtures/
  data/          urls.json  templates.json  blocks.json  ledger/  captures/  retros/  runs/
  templates/<t>/analysis.md      reports/       LEARNINGS.md
.hlxignore                       `migration/` appended by init
```

`SKILL.md` is a router (~100 lines): preconditions, install, the hand-off contract, and
"execute `stages/<stage>.yaml` with your harness's workflow primitive" (see § 6).

## 4. Runners (`scripts/lib/`)

**Ported unchanged in behaviour** (with tests): `inventory`, `state`,
`ledger`, `progress`, `transform`, `validate`, `bulk`, `da`, `http`, `browser`, `pool`,
`media`, `importer`, `paths`, `config`, `args`, `shapes`, `sitemap`, `retro`,
`watch-run`, `index` (kept because listing templates need a query index; it is the one
operator-gated site-config write).

**Dropped:** `brand-extract`, `brand-apply`, `design-md`, `lighthouse`, `scorecard`, `frames`,
`block-plan`, `plan-state`, `checks` (block-code quality gate: CSS scoping, imports, `decorate()`,
undefined CSS variables, rendered console errors — judges authored blocks, i.e. downstream work),
dashboard. Also dropped during Plan A: `capture` (render-layer module for the scorecard with no
importers; `bulk` keeps each fetched source page under `data/captures/<template>/<slug>.html`
instead, refreshed when the page changed, where `<slug>` is the whole pathname slugged — Rulings 3, 8, 14; controller review) and `taxonomy` (the old
site's archive crawler: hardcoded theme selectors and URL families; re-port behind
`config.taxonomy` when a target site needs it — Ruling 10).

**Re-sourcing `cluster.mjs` / `fingerprint.mjs` on the visual tree.** The knack machine fingerprinted
pages with the `page-reduce` skill's tokenised skeleton (`fingerprintFromReduce`). That dependency
is dropped: `fingerprintFromTree(tree)` derives the fingerprint from the `page-tree` visual tree
(the sequence of top-level boxes and each box's child-shape signature — the method this session
used to cluster the same site into 259 clusters). `similarity`, `clusterRecords`,
`pickRepresentatives` and the resumable per-URL loop of `cluster.mjs` are kept; only the
fingerprint source changes. `site.config.json.bundles` keeps a single entry, `pageTree`.

**Generalising `inventory.mjs`** (hirslanden.ch exposes what knack never did): recurse sitemap
indexes of any depth and size (hundreds of child sitemaps), and scope by `site.config.json`
`include[]` / `exclude[]` path regexes so a run can target one language and one section
(e.g. `include: ["^/de/corporate/"]`) while the inventory still records the whole site.

**De-knacking:**

- `transform.mjs` origin aliasing → `site.config.json.originAliases[]`, defaulted from `origin`.
- `validate.mjs` content-leakage patterns → `migration/rules/leakage.json`, with a generic
  default set shipped.
- Doc-comment examples → `example.com`. CI gate: `grep -ri knack` over the skill returns nothing.

**New:**

- `init.mjs` — creates `migration/` and `site.config.json`, appends `.hlxignore`, runs `npm ci`
  in `scripts/`. Refuses when preconditions fail: not an EDS repo (`scripts/aem.js`,
  `head.html`), `page-tree` skill not installed (prints the `upskill` line), `playwright-cli` not
  on PATH, no DA org/site reachable, no DA token (points at `da-auth`).
- `scaffold-block.mjs --template <t> | <name>` — `blocks.json.model` → `blocks/<name>/<name>.js`
  (structural classes only) and `.css` (legible grid/table layout, no brand tokens), header
  comment `STUB — structural only, see migration/data/blocks.json`. Never overwrites a non-stub.
- `state.mjs check-evidence <template>` and `state.mjs list … --count` — small additions to the
  ported `state.mjs` so `done_when` conditions are single boolean runner calls: every block of the
  template has ≥ 1 evidence selector that resolves on a captured representative.
- `fidelity.mjs <source.html> <out.html> [--checklist <file>]` — content-set diff: recall (source
  content preserved), precision (output traceable to source; catches invention), editorial
  checklist, block-shape conformance to `blocks.json.model`. Space-joined text at element
  boundaries. Prints one JSON object with `pass`.

**Feedback channel (`migration/feedback.json`, read by `state.mjs feedback` and every stage
start):** one record per item — `{ id, scope, decision, note, status }` with
`scope: global | template:<t> | block:<b> | page:<path>` and
`status: received | acknowledged | applied | verified`. Operators write items (or the reviewer
prompt records their answers to its "open operator decisions"); the analyst and transformer-author
prompts receive the items in scope as input; `bulk.mjs` re-transforms pages whose scope matches a
newly applied item (rework). Nothing in the pipeline blocks on an unanswered item.

**Gates (all in runners):**

| Gate | Where | Rule |
| --- | --- | --- |
| Coverage | `bulk.mjs` | `--run` refused when `data/bulk/<t>-dryrun.json` is missing or its coverage < `thresholds.coverage` (default 0.95); `--accept-coverage` overrides and is recorded in the `units` ledger rows (Ruling 16) |
| Content validity | `validate.mjs` via `bulk.mjs` | invalid document is not uploaded |
| Fidelity | `fidelity.mjs` at template review and bulk sampling | below `thresholds.fidelity` → template not `ready` / rework record |
| DA write | `bulk.mjs --dry-run` vs `--run` | explicit; preview only |
| Site config write | `index.mjs push --confirm` | operator approval |
| Publish | — | not a command |

**Tests:** ported `*.test.mjs` colocated; `npm test` in `scripts/`; end-to-end fixture
(`fixtures/example-site/`, 3 static pages, no network, no DA): `init → discover → template →
bulk --dry-run`.

## 5. Stage specs (`stages/*.yaml`)

Schema:

```yaml
stage: template
params: [template]
timeouts: { unit_minutes: 45 }
units:
  - id: analyse
    role: prompts/analyst.md          # LLM unit — exactly one prompt
    tier: high                        # low | medium | high
    parallel: false
    depends_on: []
    inputs:  [data/templates.json, data/captures/<template>/*]
    outputs: [templates/<template>/analysis.md, data/blocks.json]
    done_when: "state.mjs list blocks template=<template> --count >= 1 && state.mjs check-evidence <template>"
  - id: scaffold-blocks
    run: scripts/scaffold-block.mjs --template <template>   # runner-only unit, no LLM
    depends_on: [analyse]
```

Rules: `done_when` is always a runner command with a boolean result — never a judgment.
A `run:` unit may declare `resume: { while: <stop reason>, max_rounds: N }`: executors re-run
the command while its stdout JSON reports `stopped: <stop reason>` (bulk is resumable and
time-boxed), at most N more times, before consulting `done_when`; the `template` stage opens
with a `capture` unit that fetches the representatives' HTML so `analyse` has markup to work
on before any transformer exists.
`parallel: true` means units of that id are independent and each runs in its own worktree.
`gate` names the runner gate that decides the transition. Rework: `review: needs-work` and
`sample-fidelity: fail` append a `rework` ledger record; `author-transformer` re-runs while one
exists, at most 2 rounds, then the stage stops with open items in the report.

**`discover`:** `inventory` (run) → `cluster` (run, resumable) → `report` (LLM, medium: names
clusters, proposes representatives and template order, flags page-builder mix) →
`reports/discover.md`; `templates.json` entries `status: proposed`.

**`template <t>`:** `analyse` (high; exit `state.mjs check-evidence <t>`) → `scaffold-blocks`
(run) → `author-transformer` (medium; exit `stage.mjs check-transformer <t>`: every
representative transforms with 0 warnings and passes `thresholds.fidelity`) → `review` (high;
`verdict: ready | needs-work`, gated by `stage.mjs check-review <t>`, which records a `rework`
ledger row on `needs-work`) → `retro` (low). Templates are independent: executors may run
several `template` stages concurrently, one worktree each.

**`bulk <t>`:** `dry-run` (run; exit `check-coverage`) → `run` (run; upload + preview,
checkpointed; exit: ≥ 1 previewed URL and no long tail) → `sample-fidelity` (run; 5 sampled
pages, compared against their captures; exit `check-fidelity`) → `retro` (low). The long-tail
report `reports/bulk-<t>-longtail.md` is written by `bulk.mjs` itself in both modes — every
unmatched URL with its fingerprint; when ≥ `thresholds.newTemplateMin` of them share a
fingerprint, `discover` proposes a new template from them. Without a DA token the `run` and
`sample-fidelity` units report `skipped-no-da` in the no-LLM runner. Unmatched pages are never LLM-imported one by one in this pipeline.

Tier mapping is the executor's; `workflows/pi/model-tiers.json` is the reference.

## 6. Prompts and method

Each prompt ≤ 150 lines, bounded inputs, runner-checkable exit, the plugin's external-content
safety clause.

- **`discover-report.md`** — names clusters from sitemap type + class tokens (renames through
  `state.mjs rename-template`), proposes the order, flags page builders and fingerprint failures.
- **`analyst.md`** — divide (from `page-tree` output: top-level boxes → sections/layouts; never
  from raw DOM) → conquer (per box, descend the raw DOM until recognised: default content, known
  block model, or novel; record stable selectors and evidence for every leaf) → model (authoring
  table per block, variants, frequency; prefer default content; canonical EDS names where they
  fit). Exit: `done_when` of `analyse`.
- **`transformer-author.md`** — fed `analysis.md`, this template's `blocks.json` entries,
  `references/transformer-contract.md`, the `importer.mjs` API, and the 3 captures. Not fed other
  transformers (contamination). Loop ≤ 3: transform → `fidelity.mjs` → fix the concrete miss.
  Exit: 0 warnings, fidelity pass.
- **`reviewer.md`** — content-fidelity verdict only; numbered concrete misses (selector + expected
  output); operator decisions listed, not taken. Styling, Lighthouse, brand out of scope.
- **`retro-writer.md`** — ledger facts only; appends `LEARNINGS.md` entries tagged
  `generic | project`.

`references/method.md` holds the method once (from `EDS-MIGRATION-ANALYSIS.md` §§ 6–11):
trichotomy plus layout level; self-match, not descendant-match; cards-grid vs layout
discriminator; reaching a block is recognition, not depth; bounded divide, unbounded conquer.

## 7. Executors

**Deterministic core (`scripts/lib/stage.mjs`).** Every stage decision that needs no LLM lives in
a tested Node runner: `plan` (parse + validate the YAML, resolve `<param>`s, order units,
absolutise commands), `validate`, the gates (`check-transformer`, `check-review`,
`check-coverage`, `check-fidelity`, `sample-fidelity`), `record-run`, and `run <stage>
[--skip-llm]` — the sequential executor any harness can call: `run:` units execute, `done_when`
is evaluated after every unit (retry once, then stop naming the unit), LLM units are skipped
with `--skip-llm` (their `done_when` still decides) or stop the run otherwise. A failed
`review` stops the run after `check-review` recorded the rework request.

**pi reference (`workflows/pi/`).** pi workflow scripts cannot import files, read the filesystem
or run shells, so `stage.mjs` (one self-contained script, ~200 lines) asks a `small` agent to run
`stage.mjs plan`, then walks the units: `run:` units and `done_when` checks through `small`
agents with a strict result schema — every command carries its own `cd <repo> &&`, and a
non-zero exit fails a `run:` unit before `done_when` is consulted — and LLM units through
`agent(read-this-prompt-file + inputs, { tier })` with `low|medium|high` mapped to pi's
`small|medium|big` (`model-tiers.json`). It owns the rework loop (`author-transformer` →
`review`, at most `rework.max_rounds`). `templates.mjs` fans the `template` stage out over
`args.templates[]` through the saved `eds-stage` workflow; concurrency is a workflow-tool
option. `tools/retro.mjs` and `tools/watch-run.mjs` read pi run journals. Rule: no plan,
prompt or gate in the JS — if a workflow needs a rule the spec lacks, the spec is fixed.

**Other harnesses.** `SKILL.md § Executing a stage` gives the same six steps as prose: execute
`run:` units directly; one subagent per LLM unit; verify `done_when` before advancing; stop at
unit boundaries; state is in files, re-running a stage resumes. Documented asymmetry: without a
script primitive the orchestrator LLM is the loop, so execution drift is bounded only by runner
gates and per-unit isolation.

## 8. Hand-off contract (`references/content-model.md`)

`migration/data/blocks.json`, one record per block:

```jsonc
{
  "name": "specifications",
  "canonical": null,                 // "table" | "cards" | "columns" | … when it matches
  "status": "scaffold",              // scaffold | implemented (downstream flips it)
  "variants": ["", "compact"],
  "model": {
    "rows": "repeat",                // fixed | repeat
    "columns": [{ "name": "label", "type": "text" }, { "name": "value", "type": "text|link|image" }],
    "header": false
  },
  "templates": { "pdp": 1.0 },       // template → share of its pages using the block
  "evidence": [{ "url": "…", "selector": "…" }],   // ≥ 1, resolves on a representative
  "decisions": ["reviews tab dropped: AJAX-only"]
}
```

`templates/<t>/analysis.md` fixed headings: Representatives · Decomposition · Blocks · Default
content decisions · Not migrated · Open operator decisions.

**Transformer contract** (`references/transformer-contract.md`): a transformer is a plain ES
module in `migration/transformers/<t>.mjs` exporting `version`, `match(url,
document)`, `generateDocumentPath({ url })` and `transformDOM({ document, url, html, params,
importer })`. It imports nothing from the skill: the harness passes `importer` (the skill's
`importer.mjs` namespace — `Blocks`, `DOMUtils`, `FileUtils`, `pickImageSrc`, `sectionMetadata`,
`splitSections`) because Node's `imports` map cannot resolve `#lib/*` from the EDS repo (Ruling
13). `needsBrowser` was dropped (no runner acted on it). Templates are clustered
on the fine fingerprint (two levels, layout and class tokens); the coarse fingerprint groups the
long tail (Ruling 17). `overlaySelectors` is not a config key: the page-tree bundle already tags
overlays and the fingerprint skips them. `fidelity.mjs --ignore <selector>` excludes elements the
template's analysis declares "Not migrated" before computing recall. `transformHtml` also takes `hosts` (`originAliasHosts(config)`) from its caller instead of
reading `site.config.json` itself.

**Feedback settlement** (`bulk --run`): `template:<t>` and `page:<p>` items get `appliedRun` when
every URL they forced in the run finished (vacuously when none was left to run); `global` items
are settled by the operator with `state.mjs feedback set` (Ruling 15).

Stubs in `blocks/<name>/` carry the `STUB` marker and the `blocks.json` name; downstream replaces
them and flips `status`. DA documents are plain EDS document HTML whose block tables follow
`model` exactly, with `Metadata` and `section-metadata` blocks.

## 9. Acceptance

1. `npm run validate` passes; tessl review ≥ 50 %; `grep -ri knack` over the skill → nothing.
2. Fixture e2e green: `init → discover → template → bulk --dry-run`, no network, no DA.
3. A real second site end-to-end through the pi workflows: **<https://www.hirslanden.ch/>** —
   classic AEM, ~377 child sitemaps, tens of thousands of URLs across ~25 clinic sub-sites and
   four languages. Scoped for iteration 1: `discover` over the **whole** sitemap index (the
   inventory test), then `template × 3 → bulk --run` on `/de/corporate/` only — `treatments`
   (~98 URLs), `diseasepatterns` (~194) and `doctors` (~3,000 near-identical, data-driven pages)
   — to DA preview; fidelity passes on samples; stub-rendered preview reviewable via `aem up`.
   The rest of the site is a later milestone, not iteration 1.
4. That project's `LEARNINGS.md` has ≥ 1 entry per stage.

## 10. Migration from `test-f51`

Port `lib/` per § 4 with tests; mine `docs/migration/workflows/*.mjs` for gates and prompts into
specs and prompts; distil `EDS-MIGRATION-ANALYSIS.md` into `references/method.md`; then stop
referencing `test-f51`. Knack's transformers, rules and data stay there as history — not shipped,
not fixtures. This worktree's Python clustering tooling is not ported (`cluster.mjs` covers it).

## 11. Later (explicitly out of iteration 1)

Per-page LLM import of long-tail URLs; runners published to npm; automatic learning loop;
Claude Code executor beyond prose; block-collection auto-sync; tessl eval `tile.json`.
