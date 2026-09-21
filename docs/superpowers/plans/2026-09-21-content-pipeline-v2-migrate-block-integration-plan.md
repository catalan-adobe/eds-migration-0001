# content-pipeline-v2 × migrate-block — integration plan (plan only)

Source read: `aemcoder/skills` worktree `feat-universal-skills`, `skills/migration/migrate-block`
(SKILL.md 820 lines, `scripts/verify-images.js`, `manifest.yaml`), its orchestrator
`migrate-page` (SKILL.md, `scripts/generate-agent-prompts.js`, `visual-tree.js`,
`brand-extract.js`, `block-inventory.js`), `docs/specs/*cost-analysis*`, `*portability*`,
`universal-skills-plan.md`, `*retrospective-fixes*`.

## What migrate-block is

A **per-block worker brief** for a sub-agent. Input: `blockName`, `sourceUrl`, a visual-tree
`id` + `bounds`, `projectPath` (an EDS repo), `notes`, plus an orchestrator-owned "section
heading" flag and an enrichment block (brand, existing blocks, layout contract). It then:

1. opens the **live** source page at 1440×900, extracts the component's content and up to
   five tokens in one JS call, screenshots the component (its own reference for later);
2. downloads the images to `drafts/images/`;
3. writes `drafts/{block}.plain.html` (the content model: rows and cells, images in their
   own cell, entities for ©™®), `blocks/{block}/{block}.css` (scoped, custom properties,
   respects the layout contract), `blocks/{block}/{block}.js` (`decorate`);
4. builds `drafts/{block}-preview.html` with the project's real `head.html`, serves the
   repo, verifies the EDS framework loaded (`hlx`, `appear`, block `loaded`), settles and
   verifies images (`verify-images.js`), sanity-checks the decorated structure;
5. iterates the CSS at most three times against its source screenshot, by eye;
6. optionally writes `.migration/reports/{block}-report.json`; returns a JSON payload
   (`status`, `hasHiddenPanes`, `fullWidth`, files, issues).

It is written harness-agnostic ("intent over invocation"), assumes an orchestrator that
already dismissed overlays, set the layout contract in `styles.css` and brand in
`brand.css`/`head.html`, and treats header and footer as special (`migrate-header`, footer
fragment pipeline). Measured cost in its home (Slicc): ~$35 a page, 90 % in the block
workers — roughly **$5 a block**, three visual iterations.

## Where the two meet — and where they do not

migrate-page decomposes **one page** into blocks and spawns a worker per block instance;
content-pipeline-v2 decomposes **every cached page** into element **types** that recur
across the site. The join is exact and it is the whole point:

| migrate-block wants | content-pipeline-v2 has |
| --- | --- |
| `sourceUrl`, tree `id`, `bounds` | a type's `sample` (url, selector); bounds in the store |
| its own source screenshot | crops per type and per variant, offline, recipe applied |
| the live page | the local cache (page-cache proxy, offline, no bot risk) |
| overlays dismissed by the orchestrator | the prep recipe, applied when the cache was warmed |
| `blockName` | nothing — types are unnamed by rule (the mapping expert's job) |
| block vs default-content vs section | nothing yet — classification deferred (four words) |
| brand + layout contract | chrome step (header/footer, backgrounds); no brand step |
| one instance | a type's variants (distinct children sets): the content model must cover them |
| `projectPath` = EDS repo, writes `.migration/` | the repo where `migration/` lives; a clash |

**One worker per recurring type, not per page-block.** On `-13` that is 25 recurring
types (fewer once containers, default content and fragments are taken out — perhaps 10–12
blocks); on `-11`, ~110 recurring of 166, of which `text`, `column`, wrappers and the XF
are not blocks. At ~$5 a block: **tens of dollars for a site's block code**, against
$35 × pages. The content of every page is then a transformer's job (the v1 contract in
`eds-content-pipeline/references/transformer-contract.md`), and migrate-block's
`.plain.html` for the sample is the **content model the transformer must produce** —
that is the artefact that carries over to the import phase.

Not a fit, and left where it is: `migrate-page`'s Phase 1–2 (its own visual tree at
min-width 900, its decomposition, its three fragments) — our capture, chrome and elements
steps are that, site-wide. `visual-tree.js` and page-tree share a lineage (positional ids,
`nodeMap`); we hand over selectors, not ids.

## The missing step between them: mapping

Nothing in the pipeline says which types are blocks. That judgement — the four words —
is exactly the "mapping expert's work" the elements brief defers, and it is the step
migrate-block's `blockName` requires. It belongs to the pipeline, not to migrate-block:

`elements/mapping.json` — per recurring type: `kind` (`block` | `default-content` |
`section` | `fragment` | `chrome` | `skip`), `block` (the EDS block name; several types
may map to one block, a type's variants to one block's options), `notes`. Written by an
agent from the crops (the evaluation report is its evidence), edited by the operator on
the dashboard type cards (a select and a name field), checked by the runner: every
recurring type has a kind; every block name is a valid EDS block name; `text`-like types
are not blocks unless said so with a note. Coverage arithmetic follows: pages fully
covered by mapped kinds, instances per block, pages per block — the block inventory a
migration is budgeted on.

## New steps

```text
… → elements → mapping → styles → blocks → (import, later)
```

### `mapping` (tier: medium; agent reads crops, writes one JSON)

- Inputs: `elements.json`, `evaluation.md`, crops. Brief: the typing test ("can an author
  make this in a document?" → default content), containers are sections, XF are
  fragments, header/footer chrome; one block name per visual component; variants of a
  type are options of one block unless the crops say two blocks.
- Outputs: `elements/mapping.json`, `mapping.md` (the block inventory table: block, types,
  instances, pages, variants, sample). `check mapping`: every recurring type mapped, names
  valid, no block named header/footer.
- Dashboard: kind select + block name on each type card; inventory panel groups by block.

### `styles` (tier: medium, once per site) — the layout contract and brand

migrate-page Phase 2.5, done from the cache rather than a live page: content max-width and
gutters measured from the store (widest main content bounds across pages, not per page),
section padding from sibling y-offsets, brand from `brand-extract.js` run against a cached
page through the proxy, fonts resolved by its cascade. Writes `styles/brand.css`, the
layout-contract rules in `styles/styles.css`, font links in `head.html`; records the
numbers in `migration/styles/styles.json`. `check styles`: contract rules present, imports
first, values within the measured range. Reuses migrate-page's scripts as they are.

### `blocks` (tier: per block; the runner prepares, agents build)

- `blocks.mjs prompts`: from `mapping.json` + `elements.json`, one prompt per block in
  `migration/blocks/<block>/prompt.md`, in migrate-block's parameter shape — `blockName`,
  `sourceUrl` = the sample page **through the cache proxy** (`http://127.0.0.1:<port>/…`),
  the **selector** (not a positional id), bounds, `projectPath`, notes = the type's
  identity, variant count, `within` container, the crop paths as the reference
  screenshots, the two or three variant samples to cover, `fullWidth` hint from bounds.
  The enrichment block migrate-page appends (brand, existing blocks, layout contract) is
  ours to generate from `styles.json` and `blocks/` — `generate-agent-prompts.js` shows
  the shape; the runner writes it.
- Ordering: header and footer first via `migrate-header` / the footer case, from the
  chrome step's variants and screenshots; then blocks by pages covered, descending.
- Serving: the project is already served by `status.mjs dashboard` (`aem up`); the
  preview URL is that port. Each agent an isolated browser session
  (`sessionName(project, block)`), fire-and-forget as the skill demands.
- `check blocks`: per mapped block, `blocks/<b>/<b>.css` and `.js` exist and are scoped
  to `.<b>`, `drafts/<b>.plain.html` has no `html/head/body/script/style`, the report
  json (if opted in) says `status` and `edsVerification.blockLoaded`; the runner lists
  blocks done / partial / missing in `blocks.md` and the dashboard. The check reads the
  outcome; it never trusts the agent's payload.
- Dispatch is the operator's or the orchestrator's: sequential agents, or fanned out
  ("run the blocks step as a workflow"), each given one `prompt.md` and the migrate-block
  skill. The skill stays a sibling, installed by `setup` from its own repo
  (`aemcoder/skills`, path `skills/migration`) — `setup.json` records the source (B2).

## Frictions to settle before building (each a decision, not a surprise)

1. **`.migration/` vs `migration/`.** migrate-block writes `{projectPath}/.migration/`
   (source shots, reports). Accept it as the sibling's scratch and read it from there, or
   ask upstream for a `workDir` parameter. Recommend: accept, and `.hlxignore` it.
2. **Lazy-loaded images are not in the cache** (known page-cache follow-up). Step 2 of
   migrate-block would download `about:error`. Either fix the warm step to fetch
   lazy sources first, or let the prompt point image downloads at the live origin only.
   The fix belongs to page-cache and pays everywhere; do it first.
3. **The skill wants a screenshot it takes itself**; ours are better (offline, recipe,
   per variant). Upstream ask: accept `referenceScreenshot` paths and skip its Step 1
   shot. Until then the prompt says "reference crops at …; do not re-shoot".
4. **Variants.** The skill migrates one instance. Prompt notes carry the variant samples;
   upstream ask: a `samples[]` parameter and "the content model must fit every sample".
5. **Names.** The pipeline never names types; `mapping` names blocks. The elements brief's
   "never name types" stays true — naming is the next step's job, said so in both briefs.
6. **Fonts on localhost** (Typekit refuses): expected, the skill says so; the check must
   not score typography.
7. **Cost**: ~$5 a block, three iterations, Opus-class agents in its home. Route simple
   blocks (default-content-like, single row) to a medium tier; the mapping step can tag
   `simple`.

## What this buys, honestly

- Block code once per type from the site-wide inventory, with evidence per variant, from
  the cache, without touching the live site again: the piece migrate-page cannot do.
- Not a page migration. The content of 1199 pages still needs transformers producing
  migrate-block's content model per type — the import phase, with the v1 transformer
  contract and `franklin-bulk-shared`; the `.plain.html` samples are its specification.
- The `mapping` step is the real new work and the real value: it is the block inventory
  with a human in the loop, on evidence. `styles` is a port of existing scripts. `blocks`
  is a prompt generator and a check.

## Order

1. page-cache: warm lazy image sources (friction 2) — replay unaffected, cache grows.
2. `mapping` step: spec (four words, `mapping.json` shape, check), dashboard controls,
   brief; run on `-13` and `-11` by an agent, read.
3. `styles` step: port migrate-page 2.5 to the cache; run on `-13`.
4. `blocks` step: prompt generator + check + `blocks.md`; install migrate-block as a
   sibling from `aemcoder/skills`; run two blocks by hand on `-13`, then the rest as a
   workflow; measure cost and iterations per block.
5. Upstream asks to migrate-block (3, 4, 1) with the measurements attached.
6. Then the import phase plan: transformers per type against the `.plain.html` models.
