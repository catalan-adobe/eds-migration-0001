# Handoff — page structure, levels 1 and 2 (2026-10-09/10)

Where the work stands at the model switch, so nothing depends on a conversation.

## Repositories and tags

- Code: `/Users/catalan/repos/adobe-skills/.worktrees/eds-content-pipeline`, branch
  `eds-content-pipeline`, pushed to fork `catalan-adobe`. Skills under
  `plugins/web/skills/{migration-pipeline,migration-data,page-tree,page-cache}`.
  Tags this round, in order: `mpipe-7.17-pixels` (the picture checks the band capture),
  `mpipe-7.18-misread` (check runs with the chrome step; `misread` reason; report "Picture"),
  `mpipe-7.19-bandage` (capture faults made generic or data: images pinned before the
  screenshot, readings repeated while the page grows, FREEZE, pseudo-element paint,
  `access rendering "<css>"`, broken image / embed named), `mpipe-7.20-misread-ref`
  (`references/misread-pages.md`), `mpipe-7.21-structure-s1` (level 1 by System 1 on the
  tree's candidates), `mpipe-7.22-structure-l2` (sections opened), `mpipe-7.23-structure-ref`
  (`references/structure-method.md`). HEAD `0091a4c7`.
- This repository (`$W`): ledger `docs/superpowers/plans/2026-09-23-migration-pipeline-plan.md`
  has a row per tag; `docs/research/2026-10-10-*` holds the lab findings and the three lab
  scripts copied from `~/repos/ai/migration-tests/_lab/` (not under git).
- Rules kept: every committed line ≤ 100 chars (`npm run check` in each skill), `npm test`
  in `migration-pipeline/scripts` (61) and `migration-data/scripts` (44), repo
  `npm run validate`; replace, don't deprecate; staleness by rule (versions, hashes), never
  by flag; one commit per task plus a ledger row; verification-before-completion before a
  commit; never chain `git commit` with other commands.

## Test projects

- Bench: `~/repos/ai/migration-tests/bench-level2/{aemlive,nasa,mdn,mit,govuk,wknd}`;
  Synopsys: `~/repos/ai/migration-tests/eds-projects/test-content-pipeline-0001/eds-mig-20260914-14`.
  Each has `.agents/skills/*` symlinked to the code worktree, ~50 pages cached, a `judge-10`
  selection, chrome detected, triage, pixel checks, `structure` run, reviews rendered at
  `migration/views/structure-judge-10.html` and `migration/views/report.html`.
- System 1 (Clef): env file `/Users/catalan/repos/ai/gc/catalan/site-census/.worktrees/xp-cf-clef/.env.clef`,
  used as `node --env-file=<file> …`; never read by the skill. $0.24 per M input tokens.
- Azure Anthropic (Haiku 5.5, Sonnet 5.5) for lab references: endpoint in
  `~/.pi/agent/models.json` (`azure-anthropic`), key via
  `security find-generic-password -a catalan -s azure-foundry-api-key -w` at run time
  (`AZ_KEY=$(…) node run.mjs`); the models want `thinking: { type: 'adaptive' }` +
  `output_config.effort`. The pi workflow runtime's subagents send `thinking.type: enabled`
  and are refused by these models (a bug to report to pi-dynamic-workflows).

## What was established

1. **The picture checks the reading** (7.17–7.18). Per band, the DOM's claimed background
   against the painted margin inside the claimed box and outside every recorded leaf; ink
   where leaves claim content; ink outside every band. Tolerance 4 (JPEG-tight: a section's
   light grey is 7 from white). Flags `bg-mismatch | unpainted | unclaimed-ink`; a `misread`
   reason with the disagreement as detail (a broken image by host, an embed not rendered
   offline). 557 pages → 9 flags, none wrong; after the fixes below, 3.
2. **Capture faults, each generic** (7.19): a script scrolling after prepare (pinned before
   each reading; a scrolled dump fails); a fixed curtain (> 300 px is no chrome); a
   clip-path-hidden panel (no area = hidden); the full-page screenshot reflowing the page
   (images pinned to their candidate; NASA 214 → 8 broken images, re-reads 18 → 0);
   pseudo-element paint as large as its element; animations frozen; failed images retried.
   One site-specific fact made data: `migration.mjs access rendering "<css>"` (aem.live's
   slide-reveal). Asset origins found from broken-image hosts → `assets` + `cache fill`.
3. **Level 1 by a vision model, then by System 1** — see
   `docs/research/2026-10-10-system1-level1-strategy.md` and the skill's
   `references/structure-method.md`. Candidates from the tree's siblings; facts as words;
   five yes/no questions; rules. Clef vs Haiku-high on 259 candidates: kind 90 %, merge
   85 %, 43/70 pages identical, 98 % repeatable, ~6 k tokens/page. Cost per page: Clef
   ≈ Haiku ($0.0015 vs $0.0014); Clef 3× faster.
4. **Level 2 built, not settled** (7.22 + `f92df2f4`): sections opened into children with
   the same machinery; side columns as layout; EDS text runs unasked; same-kind merges
   inside; depth 3. 93 sections opened, none into itself. The user's reading of the NASA
   Chas Hoff page found two layout faults, fixed (`f92df2f4`); the user's conclusion, which
   the assistant shares: isolated fixes are not a method for levels 2..N.

## 2026-10-11: levels 2..N decided and built (`mpipe-7.24-structure-tree`)

Decided with the user: level 1 is the cut (page → unqualified bands); qualification is
iterative — every section is cut and qualified again with the same three kinds, nested
sections allowed while digging (flattening to EDS's one level is a later phase); a fourth
kind `layout` (parts side by side), decided by Clef (`is_layout`, asked only when the
parts are side by side); block types out of scope. Built as `qualify(cut(x))` with no
level-specific code; see the skill's `references/structure-method.md` for the cut, the
rules, the digging, the numbers and the instability of near ties. Lab scripts copied to
`docs/research/2026-10-11-structure-tree-*.mjs` (`tree-stats` per site, `score-l1` and
`matrix-nodes` against Haiku, `cuts-check` level-1 cuts against stored ones).

**Next: the user marks the reviews** (`<project>/migration/views/structure-judge-10.html`,
a mark per node: ok / the kind it should be / wrong cut, with a note; "Export marks"
downloads `structure-marks-judge-10.json`). Marks carry the wording hash. Then: a schema
for the marks (decision layer), scores against them, and only then wording or rule
changes. Near ties move with wording; single pages cannot tell which wording is better.

## The open question (as of 2026-10-10, now answered above)

Level 2 is not level 1 again: inside a section EDS has items — text runs, blocks, side
columns — and depth is fixed (section → items → block rows → cells). The judgement needed
per subtree is *one component or a group*; "kind = section" was a proxy for it and left the
recursion without a clean stop. Thresholds (side column 40 % width / 40 % height / top
fifth; 1.6 width ratio; 300 px) were set by eye on three pages.

Proposed, not started: write the level-2 contract (candidate kinds `text run | subtree |
side column`, one question per subtree, stop at a component or a run; block internals as a
separate structural pass); build a sample of ~30 opened sections across the seven sites on
a sheet where the right items can be marked; set thresholds against the sample. The user
to decide whether the item-level truth comes from them first (assistant's preference) or
from a Haiku run on the 93 opened sections (~$0.03) as a stand-in.

## Also open, smaller

- Side rails as fragments at level 0 (aem.live docs nav on 29/29 pages, MDN both sides):
  recurring side column within a group → `placement: template`, part `rail`; the review
  should grey it like header and footer.
- Code samples are default content in EDS; the type criteria should say so.
- `MAX_DEPTH 3` and the wknd adventure grid: opening deeper is cheap, knowing when to stop
  is the contract above.
- The structure review is read-only; the correction UI (band verdicts reshaped to items)
  was deferred until the level-2 contract exists.
- Haiku's own reference is inconsistent in places (MIT article + rail `default_content/
  main-left` vs MDN `section/main-left`; "Germany heading + addresses" merged, "Ireland +
  Netherlands" not): a human reference is due.
