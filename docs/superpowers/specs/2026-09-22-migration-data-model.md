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
3. **Every entity has an id**, and references are by id, never by string matching. A
   page's id is `sha1(canonical url)` truncated to 12 hex (48 bits: no collision in
   practice at a hundred thousand pages). A type's id is `sha1(identity)`, 12 hex. Runs,
   notes and selections carry their own ids.
4. **Every file states its schema**: `"schema": "<unit>/<file>@<version>"`. A JSON Schema
   per file lives with the data layer; reading validates, writing validates.
5. **Per-entity facts live per entity.** Nothing about one page sits inside a site-level
   file; a site-level file may carry a *summary* of pages (counts, ids), never their
   content.
6. **Process state is derived.** Which steps are done, running, waiting is computed from
   the data and the runs, cached in one file for readers that cannot compute it.
7. **Big and small apart.** Bodies, trees, images in their own files, addressed by id;
   the tables stay small enough to read whole.

## 2. The units

```text
migration/
  migration.json            the migration: source, target, settings, approvals     decision
  state.json                every step's state, computed                           derived
  runs/                     one file per execution of a step                        run/history
  website/                  the source site as a whole
    website.json            origin, scope, how it was discovered, languages, groups derived
    access.json             how to open a page: bot-protection recipe, overlays     decision
    chrome.json             header and footer: variants, members, membership        derived
  pages/                    the pages
    pages.json              the table: one record per URL                           derived+facts
    selections/<name>.json  a named set of page ids with its criteria               decision
    <id>/                   one page's artefacts
      tree.json             the visual tree                                         derived
      sections.json         the decomposition: sections, types, coverage            derived
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
  "id": "m-5f2a9c1e3b7d",
  "created": "…",
  "source": { "origin": "https://www.example.com/", "scope": "https://www.example.com/" },
  "target": { "repo": ".", "kind": "eds", "owner": null, "site": null },
  "settings": { "cacheAllUpTo": 500, "captureMinWidth": 250, "pace": 1500,
                "skills": { "repo": "adobe/skills", "ref": null } },
  "approvals": { "cache": ["sample-50"], "elements": true }
}
```

`approvals` is the operator's yes per gated step, with what was approved (selection names
for `cache`). The skills source is a setting of the migration, not of a step.

### state.json — *derived*

The runner's view: per step `state` (`done | ready | blocked | waiting-operator |
running`), `blockedBy`, `note`, `progress`, the run id while running; `generatedAt`.
Computed by the state function from the data and the runs; written so dashboards and
services need not compute it. Never read by a step to decide anything — steps run the
checks.

### runs/<runId>.json — *run*, then *history*

One shape for every background or foreground execution:

```json
{ "schema": "runs/run@1", "id": "r-20260922T101500-capture", "step": "capture",
  "state": "running", "started": "…", "finished": null, "pid": 4242,
  "total": 48, "done": 12, "failed": [], "current": "p-…",
  "input": { "selection": "sample-50", "minWidth": 250 },
  "summary": null }
```

`state`: `queued | running | done | stopped | failed`. A finished run keeps its file:
the runs directory is the migration's history (the elements step's rules iterations are
runs with a `summary` of types added and removed; the cache's selections are runs). A
run is addressed by step and time; the newest per step is what `state.json` reports.

### website/website.json — *derived*

Origin and scope; how the URLs were discovered (sitemaps, crawl) and when; languages
seen; the URL groups (name, count, cached, captured) as a summary of `pages.json`;
counts. Rewritten by the pages layer when the table changes.

### website/access.json — *decision*

How to open a page of this site: the browser recipe (engine, headers, stealth, profile)
from the probe, the overlays and hide rules from the prep, the pages the recipe was
verified on. One file: a page is opened one way, wherever it is opened from.

### website/chrome.json — *derived*

Header and footer: variants with members and optional members, each variant's page ids,
pages without, unplaced and rejected candidates. Page ids, not URLs.

### pages/pages.json — *derived + facts*

The page table. One record per URL the migration knows:

```json
{ "id": "p-3f9a2c7d1e4b", "url": "https://…", "group": "blogs", "lang": "en",
  "discovered": { "from": "sitemap", "at": "…" },
  "http": { "status": 200, "contentType": "text/html" }, "redirect": null, "finalUrl": "…",
  "kind": "page", "migrate": "yes",
  "cache": { "at": "…", "path": "www.example.com_15600fa6/index.html", "selection": "sample-50" },
  "capture": { "at": "…", "minWidth": 250 },
  "decomposition": { "at": "…", "sections": 7, "covered": true } }
```

Discovery, HTTP, redirect, kind and cache are facts the proxy and the scan produced; the
`capture` and `decomposition` fields are summaries of the page's own files, maintained by
their writers. The class is mixed and said so: the record's facts are regenerable only by
re-caching, so the table is kept with the cache.

### pages/selections/<name>.json — *decision*

```json
{ "schema": "pages/selection@1", "name": "sample-50", "created": "…",
  "criteria": { "count": 50, "excludeGroups": ["zh-tw"], "audit": 5 },
  "ids": ["p-…", "p-…"] }
```

A selection freezes the ids it chose and keeps the criteria that chose them, so it can be
read ("fifty pages, one per group") and remade.

### pages/<id>/tree.json — *derived*

The page's visual tree as page-tree returns it, with `capturedAt` and `minWidth`.

### pages/<id>/sections.json — *derived*

The page's decomposition: `rulesHash`, `sections[]` (type id, selector, bounds, variant,
`within`), `rejected[]` with reasons, `coverage`, `composition`. Written by whichever
decomposition method ran — the pipeline's or another — in the same schema, so the
elements and block layers read one shape.

### elements/types.json — *derived*

The site's element types: id, identity, pages (count), instances, support, recurring,
height statistics, variants (children identities, counts), sample (page id + selector),
evidence paths, `mergedFrom`; fragments and their distinct contents; groups' saturation;
`rulesHash`, `storeAt`. No per-page content.

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
- `pages.mjs` — the table (upsert by id, query by group/kind/cached), selections, per-page
  files (tree, sections, shots).
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
`elements` when every tree has sections at the current rules hash; and so on. Staleness
is a comparison of recorded hashes and times inside the data, not of file mtimes.

## 6. Decided and open

Decided here:
- JSON canonical, Markdown as notes and views only, every one referenced from JSON.
- Four domain units (migration, website, pages, elements) plus runs, notes, evidence,
  views; the target becomes a unit when the build phase needs it.
- Ids everywhere, 12 hex; classes per file; schemas per file; one access layer.
- Per-page artefacts in `pages/<id>/`; the cache stays the proxy's own directory.
- Decomposition per page in one schema, open to other methods.

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
3. `pages`: table, selections, per-page files; the scan, pick, cache, capture steps on it.
4. `website`: access (probe + prep merged), chrome on page ids.
5. `elements`: types, rules, blocks, inventory, per-page sections; evidence by type id.
6. `notes` and `views`; the report rendered.
7. The steps and briefs rewritten as clients of the layer; the dashboard likewise; then
   the replay harness re-pointed and the expectations re-recorded.
