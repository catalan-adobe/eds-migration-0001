# The migration data model

A migration moves a complete website from A (the source, live on the web) to B (an EDS
project). Everything the migration knows, decides and produces lives in one directory,
`migration/`, as JSON files with stated schemas, so that any client — the skill, a CLI, a
web service, a dashboard, another decomposition method — reads and writes the same data
through the same layer. Markdown exists only as a *view* or a *note*, and every one of
them is referenced from JSON.

This replaces the step-shaped layout the pipeline grew. Nothing of it is kept for its own
sake; what survives does so because the model wants it.

## 1. Principles

1. **One home per fact.** A fact is written in one file by one writer. Everything else
   that shows it is a view, regenerated.
2. **Every file has a class**, stated in the model and checked:
   - *decision* — authored by a person, or an agent standing in for one; irreplaceable;
   - *raw* — input from outside, kept for provenance, read once;
   - *derived* — rebuildable from the cache and the decisions, deletable at will;
   - *run* — the state of one execution, ephemeral;
   - *history* — append-only record of what happened.
   The invariant: **the cache and the decisions are the migration; the rest is rebuilt.**
3. **Every entity has an id**, and references are by id, never by string matching. Ids
   are a three-letter prefix and 12 hex of a sha1 (48 bits: no collision in practice at a
   hundred thousand pages): `mig-` the migration, `pag-` a page (of its canonical URL),
   `typ-` a type (of its identity), `chr-` a chrome variant, `frg-` a fragment, `sel-` a
   selection, `not-` a note; a run is `run-<compact time>-<step>`.
4. **Every file states its schema**: `"schema": "<unit>/<file>@<version>"`. A JSON Schema
   per file lives with the data layer; reading validates, writing validates.
5. **Per-entity facts live per entity.** Nothing about one page sits inside a site-level
   file; a site-level file may carry a *summary* of pages (counts, ids), never their
   content.
6. **Process state is derived.** Which steps are done, running, waiting is computed from
   the data and the runs, cached in one file for readers that cannot compute it.
7. **Big and small apart.** Bodies, trees, images in their own files, addressed by id;
   the tables stay small enough to read whole.
8. **Every derived file carries a `summary`**: one short paragraph, in words, of what it
   holds, written by its writer. A dashboard, a `--text` view, a note or an agent reads it
   first; a run's `summary` says what the run did.

## 2. The units

```text
migration/
  migration.json            the migration: source, target, settings, approvals     decision
  state.json                every step's state, computed                           derived
  runs/                     one file per execution of a step                        run/history
  website/                  the source site as a whole
    website.json            origin, scope, how it was discovered, languages, groups derived
    access.json             how to open a page: bot-protection recipe, overlays     decision
    chrome.json             chrome variants: id, part, members (no page lists)      derived
  pages/                    the pages
    pages.json              the table: one record per URL                           derived+facts
    selections/<name>.json  a named set of page ids with its criteria               decision
    <id>/                   one page's artefacts
      composition.json      the page in EDS shape: chrome, sections, items, omitted derived
      shots/                crops taken on this page                                evidence
  cache/                    the site's bodies and assets (the proxy's own layout)   raw
  elements/                 the site's vocabulary
    types.json              element types, variants, fragments, groups' saturation  derived
    rules.json              how to decompose this site                              decision
    blocks.json             what each type is in EDS terms, block names             decision
    inventory.json          the block inventory: blocks, coverage                   derived
    evidence/<typeId>/      crops per type and variant                              evidence
  notes/                    words from people and agents
    notes.json              index: id, step, author, at, file, summary              history
    <id>.md                 the note
  views/                    rendered documents                                       derived
    report.md, pages.md, website.md, elements.md, inventory.md
```

Four entities carry the domain — **migration**, **website**, **pages**, **elements** —
with **runs**, **notes**, **evidence** and **views** as supporting units. The target (B)
is a field of the migration today and becomes a unit of its own when the build phase
writes into it (layout contract, brand, blocks).

## 3. Each file

### migration.json — *decision*

```json
{
  "schema": "migration/migration@1",
  "id": "mig-5f2a9c1e3b7d",
  "created": "…",
  "source": { "origin": "https://www.example.com/", "scope": "https://www.example.com/" },
  "target": { "repo": ".", "kind": "eds", "owner": null, "site": null },
  "plan": { "pages": 500, "selection": null },
  "settings": { "cacheAllUpTo": 500, "captureMinWidth": 250, "pace": 1500,
                "skills": { "repo": "adobe/skills", "ref": null } },
  "approvals": { "cache": ["sample-50"], "elements": true }
}
```

- `source.scope` bounds the website: only URLs under it are pages of the migration;
  groups are the first path segment below it; the rest is off-scope, recorded and not
  migrated. Explicit, default the origin — a migration of one section of a site is common.
- `plan` is how much to migrate: `pages` a budget (drives what `pick` proposes, what
  progress means, the estimate) until the operator decides *which* — then `selection`
  names the frozen selection and the count follows from it.
- `approvals` is the operator's recorded yes at the gated steps, with what was approved
  (selection names for `cache`, `true` for `elements`): what lets the state say
  `waiting-operator` and keeps an agent from going on alone.
- The skills source is a setting of the migration, not of a step.

### state.json — *derived*

The migration's global status — at the root, not among the runs. Per step `state`
(`done | ready | blocked | waiting-operator | running`), `blockedBy`, `note` (a short human
text: why it is not done), `progress`, the run id while running; a top-level `summary`;
`generatedAt`. Computed by the state function from the data and the runs; written so
dashboards and services need not compute it. Never read by a step to decide anything —
steps run the checks.

### runs/<runId>.json — *run*, then *history*

One shape for every background or foreground execution:

```json
{ "schema": "runs/run@1", "id": "r-20260922T101500-capture", "step": "capture",
  "state": "running", "started": "…", "finished": null, "pid": 4242,
  "total": 48, "done": 12, "failed": [], "current": "p-…",
  "input": { "selection": "sample-50", "minWidth": 250 },
  "summary": null }
```

`state`: `queued | running | done | stopped | failed`. Liveness is two signals, neither
tied to one kind of client: `pid` when the worker is a local process, and `updatedAt` as
a heartbeat the worker refreshes with its progress; a `running` run whose pid is dead or
whose heartbeat is older than a threshold reads as `interrupted` — computed, never
written. A finished run keeps its file: the runs directory is the migration's history
(the elements step's rules iterations are runs with a `summary` of types added and
removed; the cache's selections are runs). The newest run per step is what `state.json`
reports.

### website/website.json — *derived*

Origin and scope; how the URLs were discovered (sitemaps, crawl) and when; languages
seen; the URL groups (name, count, cached, captured) as a summary of `pages.json`;
counts. Rewritten by the pages layer when the table changes.

### website/access.json — *decision*

How to open a page of this site: the browser recipe (engine, headers, stealth, profile)
from the probe, the overlays and hide rules from the prep, the pages the recipe was
verified on. One file: a page is opened one way, wherever it is opened from.

### website/chrome.json — *derived*

The chrome **variants** a site has — any number, not one header and one footer: each with
an id, a `part` (`header`, `footer`, or a named other: `utility-bar`, `subnav`, `legal`),
its members and optional members, how it was detected, and counts. Which pages carry a
variant is not stored here: the page says so (its composition's `chrome` nodes, summarised
on its record), and "pages with variant X" is a query. A site with a campaign header, a
language footer and a legal strip is three more variants, no special case.

### pages/pages.json — *derived + facts*

The page table. One record per URL the migration knows:

```json
{ "id": "p-3f9a2c7d1e4b", "url": "https://…", "group": "blogs", "lang": "en",
  "discovered": { "from": "sitemap", "at": "…" },
  "http": { "status": 200, "contentType": "text/html" }, "redirect": null, "finalUrl": "…",
  "kind": "page", "migrate": "yes",
  "cache": { "at": "…", "path": "www.example.com_15600fa6/index.html", "selection": "sample-50" },
  "chrome": ["c-utility", "c-header-main", "c-footer"],
  "composition": { "method": "visual-tree", "at": "…", "sections": 7, "omitted": 2 } }
```

Discovery, HTTP, redirect, kind and cache are facts the proxy and the scan produced; the
`chrome` and `composition` fields are summaries of the page's own composition, maintained
by its writer. The class is mixed and said so: the record's facts are regenerable only by
re-caching, so the table is kept with the cache.

### pages/selections/<name>.json — *decision*

```json
{ "schema": "pages/selection@1", "name": "sample-50", "created": "…",
  "criteria": { "count": 50, "excludeGroups": ["zh-tw"], "audit": 5 },
  "ids": ["p-…", "p-…"] }
```

A selection freezes the ids it chose and keeps the criteria that chose them, so it can be
read ("fifty pages, one per group") and remade.

### pages/<id>/composition.json — *derived*

The page in **EDS document shape** — the one structure every decomposition method writes,
whatever it does to get there, so the elements and block layers read one thing:

```json
{ "schema": "pages/composition@1",
  "method": { "name": "visual-tree", "version": "…", "at": "…", "inputs": "sha…" },
  "chrome":   [ { "ref": "c-utility", "selector": "…", "bounds": {…} },
                { "ref": "c-header-main", "selector": "…", "bounds": {…} } ],
  "sections": [ { "id": "s1", "selector": "…", "bounds": {…}, "style": { "background": "…" },
                  "items": [
                    { "role": "content",  "selector": "…", "bounds": {…} },
                    { "role": "block",    "type": "t-…", "variant": "v-…", "selector": "…"},
                    { "role": "fragment", "ref": "f-…", "selector": "…", "bounds": {…} } ]}],
  "omitted":  [ { "selector": "…", "bounds": {…}, "reason": "hairline" } ] }
```

The depth is fixed by the schema, as an EDS document's is: chrome at the page level;
sections in order, each with its style and its items; an item is `content` (default
content), a `block` (a type of the site's vocabulary, with its variant) or a `fragment`
(a reference to another document, which has this same shape). A block never holds a
block. A method that cannot yet tell section boundaries writes one section.

`selector` is mandatory on every node — the universal locator any client can re-find.
`bounds` (the rendered rectangle) are present when the method rendered the page; crops,
position statistics and evidence use them and skip without them. `omitted` records what
the method saw and left out, with a reason, so coverage is honest across methods and
"where did my hero go" has an answer. `method` is the provenance; two methods' compositions
of one page may coexist as `composition.<method>.json`, and the page record says which is
current.

Mapping to a document is then mechanical: sections → sections, `block` → a block table,
`content` → default content, `fragment` → a fragment reference.

### elements/types.json — *derived*

The site's element types: id, identity, pages (count), instances, support, recurring,
height statistics, variants (children identities, counts), sample (page id + selector),
evidence paths, `mergedFrom`; fragments and their distinct contents; groups' saturation;
`rulesHash`, `compositionsAt`. No per-page content — the pages reference the types; "pages
with type X" is a query over compositions.

### elements/rules.json — *decision*

As today's vocabulary, named for the site: containers, fragments, merge, chrome, reject,
identity exclusions, noise classes, leaf tags, thresholds. The one file that adapts the
engine to the site.

### elements/blocks.json — *decision*

Per type id: `kind` (`block | default-content | skip`), `block` name, `notes`. The block
inventory's decisions, by their EDS name rather than "mapping".

### elements/inventory.json — *derived*

Blocks with their types, instances, page ids, variants, evidence; default content;
skipped; container leaves; coverage (covered page ids, open pages with reasons);
undecided; orphaned; the hashes of `blocks.json` and `types.json` it derives from.

### notes/ — *history*

Every piece of prose: what an agent decided and why, what the operator said, what a step
reports in words. `notes.json` indexes them (`id`, `step`, `author: agent | operator |
runner`, `at`, `file`, `summary`); the body is a Markdown file. `views/report.md` is
rendered from the notes and the data — it is never edited.

### views/ — *derived*

Rendered documents for people, regenerated by the layer that owns the data they show.
Each view is listed in the owning JSON (`"views": ["views/pages.md"]`) so a client knows
it exists and that it is disposable.

## 4. The access layer

`lib/data/` is the only code that reads or writes `migration/`:

- `migration.mjs` — open, create, settings, approvals.
- `runs.mjs` — start, progress, finish, list, newest per step.
- `website.mjs` — website summary, access, chrome.
- `pages.mjs` — the table (upsert by id, query by group/kind/cached/chrome/type),
  selections, per-page files (composition, shots).
- `elements.mjs` — types, rules, blocks, inventory, evidence.
- `notes.mjs` — add, list, render.
- `state.mjs` — compute and write `state.json` from the data and the runs.
- `schema.mjs` — the JSON Schemas and the validator every read and write goes through.

Writes are atomic (temp file + rename), validated, and recorded with `updatedAt`. Steps
call the layer; so would a CLI (`migration pages list --group blogs --uncached`) or a
service. The skill becomes one client.

## 5. Process state, derived

A step is **done** when its outcome is on disk and valid — the checks — and its inputs
are not newer than it. The checks read the data layer, not file paths: `capture` is done
when every cached page of the approved selections has a tree at the current min-width;
`elements` when every cached page has a composition at the current rules hash; and so
on. Staleness
is a comparison of recorded hashes and times inside the data, not of file mtimes.

## 6. Decided and open

Decided here:
- JSON canonical, Markdown as notes and views only, every one referenced from JSON.
- Four domain units (migration, website, pages, elements) plus runs, notes, evidence,
  views; the target becomes a unit when the build phase needs it.
- Ids everywhere, 12 hex; classes per file; schemas per file; one access layer.
- Per-page artefacts in `pages/<id>/`; the cache stays the proxy's own directory.
- One composition schema per page, in EDS document shape (chrome, sections, items),
  `selector` mandatory, `bounds` optional, `omitted` recorded; open to any method.
- Membership points from the page to the site: a page lists its chrome variants and its
  types; the site files define them and carry counts.

Open, for the review:
- **Table size**: one `pages.json` for the whole site (6 700 rows ≈ 3 MB; rewritten on
  every cached URL) versus one `pages/<id>/page.json` per page with an index. One table
  is simpler and fine to ~20 000 pages; per-page records scale further and cost a
  listing. Proposal: one table, and the layer hides the choice.
- **Where notes about a page go**: in `notes/` with a `page` field, or in the page's
  directory. Proposal: `notes/`, one place for words.
- **The cache**: the proxy's layout (host/path with sidecars) is a sibling's; the page
  record points into it. Keep, or own a copy of the body per page? Proposal: keep; one
  copy of the site.
- **Runs retention**: keep every run forever (history) or fold finished ones into a
  `history.json` per step. Proposal: keep the files; they are small.

## 7. Order of work

1. This model, reviewed.
2. `lib/data/`: schemas, validator, atomic writes, ids; `migration`, `runs`, `state`.
3. `pages`: table, selections, composition schema; the scan, pick, cache, capture steps.
4. `website`: access (probe + prep merged), chrome on page ids.
5. `elements`: types, rules, blocks, inventory, per-page sections; evidence by type id.
6. `notes` and `views`; the report rendered.
7. The steps and briefs rewritten as clients of the layer; the dashboard likewise; then
   the replay harness re-pointed and the expectations re-recorded.
