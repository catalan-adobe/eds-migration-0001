# eds-content-pipeline — Plan C part 2: lessons from the first real-site run

Source: the hirslanden.com run (session `01a090bb-6d09-7772-b04e-c59dcbcd8054`; hand-off in
`<eds-repo>/migration/{UPSTREAM,REPORT,LEARNINGS}.md`, `experiments/TEMPLATES.md`). 483 URLs,
482 previewed, 476 verified live. Three parts, in order; each task is accepted only by an
outcome on disk the controller produced by running the thing.

Repo: `$CODE` = `~/repos/adobe-skills/.worktrees/eds-content-pipeline`,
`$SKILL = plugins/aem/edge-delivery-services/skills/eds-content-pipeline`. Gates after every
task: `npm test`, `npm run check`, `PAGE_TREE_BUNDLE=$PT npm run test:e2e` (from `$SKILL/scripts`),
`npm run validate` (repo root), jargon/residue grep. Lines ≤ 100 chars.

Acceptance bar for parts 2 and 3: the hirslanden captures and trees in
`~/repos/ai/migration-tests/eds-projects/test-content-pipeline-0001/eds-mig-20260911/migration/`
are the regression set. No change to fidelity or discover may lower the offline QA below the
session's numbers (article 409/409 with transformer v3.3.4; ≥ 400 articles in one cluster,
listings and forms clustered apart), computed without a browser from the stored files.

---

## Part 1 — fix batch

### Task 1: `ignoreSelectors` parses the documented `- selector: <css> — <why>` form

- `stage.mjs ignoreSelectors()`: strip a leading list marker, accept `selector:` there, cut
  the selector at ` — `/` – `, drop empties. Fixture `product/analysis.md` and `page/analysis.md`
  rewritten in the documented form so fixture, docs and code agree.
- Tests: dashed form, bare form, a line with an em dash inside the reason, a non-selector line.
- By hand: `check-transformer product` on the fixture repo still passes; a copy of the
  fixture analysis in the *old* code drops to recall < 0.1 (proves the test bites).

### Task 2: `contentSet` reads lazy images, absolute links and `title` text

- `fidelity.mjs contentSet()`: image token from the first of `data-src`, `src` that is not a
  `data:` URL; link token = `pathname + search` of `new URL(href, base)` for every href that
  is not `#…`/`mailto:`/`tel:`/`javascript:`; `title` attribute text (≥ 3 chars, has a letter
  or digit) on elements other than `a`/`img` is a token.
- Fixture `product-a.html`: one lazy image (`src="data:image/gif;base64,R0lGOD…"`,
  `data-src="/media/spec-sheet.png"`), one absolute internal link
  (`https://fixture.example/about.html`, host from `originAliases`), one `<abbr title>`.
  Fixture transformer copies the image via `data-src` and keeps the abbr.
- Tests: data-src wins over placeholder; absolute and root-relative hrefs compare equal;
  protocol-relative external host is not internal; title text preserved as prose → precision 1.
- By hand: fixture e2e recall/precision still 1 with the new markup.

### Task 3: bulk operations — push once, fail loudly, leave nothing behind

- **Hash-keyed push**: `bulk` stores `outputHash` (sha of the produced document) per URL;
  when the fresh output's hash equals the record's `outputHash` and the record is `previewed`,
  upload is skipped (`skipped: 'unchanged'`) even if `transformerVersion` changed. Dry-run
  reports `unchanged` count.
- **Token expiry**: `bulk --run` calls `da.mjs` for `expiresAt` before the first PUT and
  refuses (`DaAuthError`, action: refresh command) when the token expires within
  `max(10 min, selected/concurrency × 2 s)`.
- **Locks**: every `withLock` releases in `finally`; a SIGINT/SIGTERM handler releases too;
  a stale lock older than 10 min is broken with a warning naming the lock path.
- **Messages**: stale-coverage refusal says `re-run: bulk --template <t> --dry-run`;
  `long-tail` ledger rows carry the validator message in `detail`.
- Tests: unchanged output → no upload (fake DA counts PUTs); expiry within window → refused
  before any PUT; abort inside the lock → lock gone; refusal message text; ledger detail.

### Task 4: terminal 404s, tolerant capture, prose-only templates

- `bulk`: source `404`/`410` → record `status: 'gone'` (terminal); `check-run` counts `gone`
  separately and passes with `remaining: 0`; the bulk report lists gone URLs.
- `capture.mjs`: a representative whose fetch fails is reported under `failed` and
  `representative` is cleared with `note: 'capture failed: <error>'`; `--check` passes when
  every remaining representative is captured and at least one exists; the failed list is
  printed so the analyst sees it.
- `check-evidence`: `blocks: 0` passes when the template's `analysis.md` has a
  `## Blocks` section whose first line is `None — default content only.`; the analyst prompt
  documents that sentence.
- Tests: gone terminal in check-run; capture with one 404 among reps; evidence prose-only
  pass and a prose-only claim with a block still listed → fail.

---

## Part 2 — gate redesign

### Task 5: word-level fidelity; element tokens stay as the diff aid

- `fidelity.mjs`: `words(text)` → lower-cased `\p{L}\p{N}` runs; `compare()` returns
  `{ recall, precision, wordRecall, wordPrecision, missing, invented }` where `recall`/
  `precision` remain the element-token scores. Gates (`check-transformer`, `sample-fidelity`,
  `check-fidelity`, `fidelity --gate`) pass on `wordRecall ≥ thresholds.recall` and
  `wordPrecision ≥ thresholds.precision`; reports print both pairs.
- Tests: a `<span>` unwrap that merges tokens → element recall < 1, word recall 1 → pass; a
  lost sentence → word recall < threshold → fail.
- Regression: `article` on the hirslanden captures with v3.3.4 → 409/409 pass by words.

### Task 6: structural block columns

- `blocks.json` `model.columns[i].structural: true` marks a column whose cell text is model,
  not source content (form field names/types, hotspot labels). `fidelity` receives
  `structural: { [blockName]: number[] }` and drops tokens of those cells from the output set
  before precision; `stage.mjs` gates build that map from `blocks.json` (block `name` and
  `variants` match the block's class list). `content-model.md` documents the flag.
- Tests: a form block with a structural `type` column → precision 1; without the flag → < 1.

### Task 7: whole-template fidelity before the push; one transformer per site

- `bulk.yaml`: `dry-run` → `check-coverage` **and** `check-transformer` over all stored
  captures (the dry-run writes every page's capture; document that) → `run` → `check-run` →
  `sample-fidelity` (live). `check-transformer` gains `--report reports/<t>-fidelity.md` with
  the per-page table the session's `qa-fidelity` printed (pass/fail, both score pairs,
  first three missing/invented tokens).
- Shared transformer: `site.config.json` `templates.<t>.transformer: '<name>'` resolves
  `transformers/<name>.mjs`; default `<t>`. `bulk`, `check-transformer`, `sample-fidelity`,
  `transform` CLI use one resolver (`transformerFor(template, config)`).
- `references/method.md` + `prompts/transformer-author.md`: analyse per template, **author
  per site** (a component map keyed on the source CMS component classes), batch per template;
  the second template's author starts from the first's file and extends the map. The
  transformer-author prompt gets the two lessons: containers may hold their own text — recurse
  only when no text lives outside the components, comparing stripped lengths on both sides;
  `curl` the capture before writing content off as dynamic.
- Tests: resolver default and override; dry-run followed by whole-template check in the
  fixture e2e; a template pointing at a missing shared transformer fails with the path.

---

## Part 3 — discover redesign

### Task 8: page-tree keeps the identity of collapsed nodes (upstream, `plugins/web/skills/page-tree`)

- `collapseSingleChildren`: `node.collapsed = [{ tag, className, selector }, …]` for every
  child folded into the node (additive; `textFormat` unchanged). Evals updated. Own commit.

### Task 9: capture full depth, low width; render a text tree with selectors

- `cluster.mjs`: `captureVisualTree(300)`; no depth cut at capture. Stored JSON unchanged in
  shape. New `visual-trees/<slug>.txt` rendered by the pipeline: one line per node,
  `indent tag.class [WxH] "text…"` with `{overlay}` marks; this is what prompts read.
- `fingerprint.mjs`: `componentSequence(tree, chrome)` (Task 11) replaces the depth-2 walk.
- Regression: recapture not required — the hirslanden `minWidth 300` trees exist; the
  renderer runs on them.

### Task 10: `chrome` unit — header/footer recipe from three pages

- `discover.yaml`: `chrome` (LLM, medium) after `cluster`'s **capture** and before identity —
  split `cluster` into `capture-trees` (run) and `cluster` (run, depends on `chrome`).
  `prompts/chrome-recipe.md`: read the text trees of 3 URLs of different kinds, name the
  content root and the chrome to remove (selectors + a text/height signature each), plus
  `structural` bands kept for content but ignored for identity. Output
  `migration/chrome-recipe.json`; `stage.mjs check-chrome` applies it to every stored tree
  and passes when each `remove`/`contentRoot` selector (or a `collapsed` selector, or the
  signature) matches on ≥ 90 % of trees; prints the misses.
- Tests: matcher precedence selector → collapsed → signature; 90 % gate; fixture recipe.

### Task 11: identity = chrome-stripped component sequence; core/optional per template

- `fingerprint.mjs componentSequence(tree, recipe)`: drop overlays and chrome (leave
  `{chrome:name}` stubs for structural bands), re-collapse single children, emit
  `tag.firstClass` per node under the content root in document order; compress `×n` runs;
  drop grid sizes; drop class-less `p/h1-6/ul/ol/li/a/span`. `cluster.mjs` clusters the
  sequences with the existing LCS ≥ 0.8; then per cluster `core` (on ≥ 90 % of members) and
  `optional`; a page outside every cluster joins one as a `variant` when it carries all core
  components and ≤ 3 unseen ones; a cluster whose core is only the generic skeleton may not
  adopt. `templates.json` gains `core`, `optional`, `variants`, `kind: 'template'|'outlier'`.
- Regression on the hirslanden trees: ≥ 400 articles in one template, clinic profiles
  together, listing and form pages not inside the article template.
- Tests: sequence normalisation cases; core/optional; adoption rule; skeleton-only refusal.

### Task 12: inventory-first discover report

- `prompts/discover-report.md`: lead with the **component inventory** (every component token,
  count, templates it appears in, core/optional), then templates with variants and
  near-misses, then outliers one by one; representatives table unchanged.
- `templates.json` → `state.mjs list components` for the report.
- By hand: run the prompt on the hirslanden state; the report names the 20 components the
  transformer's dispatch table had.

---

## Order and evidence

1 → 2 → 3 → 4 (each: failing test, fix, gates, by-hand check, commit) → 5 → 6 → 7 → 8 → 9 →
10 → 11 → 12. Regression numbers recorded in the ledger after Tasks 5, 7 and 11.
