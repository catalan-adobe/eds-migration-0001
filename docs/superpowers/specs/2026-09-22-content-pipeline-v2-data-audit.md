# content-pipeline-v2 — audit of the data under `migration/`

Question: can any part of the system, at any time, tell where the migration stands, what
is done, in progress and remaining — and is the data structured by what it *is* (a website,
its pages, its elements) rather than by which script wrote it, without duplicates?

Audited on a real project (synopsys.com, 48 cached pages, every step run). Numbers below
are that project's.

## 1. What is on disk, by entity

The system manages five kinds of thing. Each file below belongs to one of them.

Legend: *w* written by · *r* read by · *regen* regenerable from the cache + decisions.

**website**
- `project.json` — origin, threshold, skills source, approvals, cache selection. w `init`,
  `approve` · r every step · **decisions, not regen**.
- `setup.json` — binary, package, sibling paths + sources. w `setup` · r every step · regen.
- `probe/browser-recipe.json`, `probe/playwright-config.json` — w probe agent · r cache,
  capture, crops · **a finding, not regen**.
- `prep/page-prep.json` — overlays, hide rules, checked pages. w prep agents · r cache,
  capture, crops · **a finding, not regen**.
- `chrome/chrome.json` — header/footer variants, members, rejected. w `chrome.mjs` · r
  elements, mapping, dashboard · regen (store).
- `elements/rules.json` — containers, fragments, merge, chrome, reject, exclusions. w
  agent/operator · r elements, mapping · **decisions**.
- `elements/elements.json` `.types[] .fragments[] .compositions[] .groups[]` — w
  `elements.mjs` · r mapping, dashboard, `pick` · regen (store + rules).
- `mapping/mapping.json` — kind, block, notes per type. w agent/operator · **decisions**.
- `mapping/inventory.json` — blocks, coverage. w `mapping.mjs` · r dashboard, check · regen.

**pages**
- `urls/scan.json` — raw crawler output, 6687 rows. w scan · r `urls import`, once · regen.
- `urls/urls.json` — 6687 records: scan columns + group + http + redirect + kind + migrate
  + cache. w `urls import`, warm · r pick, cache, capture, elements, dashboard · partly
  regen (the `cache` facts come from the proxy).
- `urls/subsets/*.txt` — selections as URL lists. w scan (groups), `pick --write` · r
  approve, warm · regen.
- `cache/.page-cache/<host>/…` — bodies + sidecars, 25 MB. w page-cache proxy · r every
  later step · **the only copy of the site — not regen**.
- `capture/<sha8>.json` — one visual tree per page, 8.8 MB / 49. w `capture.mjs` · r
  chrome, elements, crops · regen (cache).
- `elements/elements.json` `.pages[]` — sections, coverage, composition per page (69 % of
  the file). w `elements.mjs` · r mapping, dashboard · regen.
- `chrome.json` `.header[].pages .footer[].pages .without` — URL lists per variant · regen.
- `mapping/inventory.json` `.coverage.uncovered[]` — per page · regen.

**evidence** — `chrome/screenshots/`, `elements/screenshots/type-*.png`, `prep/*.png`. w
workers, agents · r agents, dashboard, operator · regen (cache).

**runs** — `.work/warm/<job>.json`, `.work/{capture,chrome,elements}/run.json`,
`cache/progress.json` (w workers · r `status`, dashboard · ephemeral);
`elements.json.runs[]` (one row per rules iteration — **history, not regen**);
`status.json` (w every `status`/`check` · r dashboard · a cache of the checks).

**views** — `urls.md`, `cache.md`, `captures.md`, `chrome.md`, `elements.md`,
`evaluation.md`, `mapping.md`, `REPORT.md`. w each step · r operator, agent · regen,
except `REPORT.md`'s prose.

Not ours, found in the project: `features.json`, `jev-template-discovery.mjs` (the operator's
own experiments), `.DS_Store`, `.env`.

## 2. What is good

- **Process state is answerable at any time, from disk, by one command.** `status.mjs
  --text` recomputes every step's check (`done`, `ready`, `blocked`, `waiting-operator`,
  `running` with progress, plus notes). `status.json` caches it for the dashboard. Nothing
  depends on an agent's word. This is the question "where are we" — it is answered.
- **Decisions are separated from derivations.** Five files hold what a person (or an
  agent as a person) decided: `project.json`, `browser-recipe.json`, `page-prep.json`,
  `rules.json`, `mapping.json`. Everything else is computed from the cache plus those
  five, and can be thrown away and rebuilt — except the cache (the site) and
  `elements.json.runs[]` (history). That invariant exists in practice; it is not written
  anywhere.
- **One record per page** for the facts about a URL: `urls.json` is the page table —
  discovered where, group, language, HTTP outcome, redirect, kind, migrate verdict, cache
  location and time. `pick`, `cache`, `capture`, `elements` all key on it.
- **Big data is kept out of the small files**: the cache and the visual trees are one
  file per page; the store is addressed by `sha8(url)`.
- Every file has one writer. No two scripts write the same file.

## 3. What is not good

1. **The page has no identity, only a URL string.** Every join is by URL text:
   `urls.json.url` ↔ `capture/<sha8(url)>.json` ↔ `elements.json.pages[].url` ↔
   `chrome.json.header[].pages[]` ↔ `inventory.json.coverage.uncovered[].url`. The sha8
   already exists for the store and the crops; it is not written on the record. A page id
   on the record makes every per-page file addressable by it and the joins explicit.
2. **Per-page facts live inside site-level aggregates.** `elements.json` (3.4 MB on 1199
   pages, ~70 % of it `pages[]`) carries the sections of every page; `chrome.json` carries
   URL lists per variant; `inventory.json` carries per-page coverage. Any reader that wants
   one page's decomposition parses the whole site's. At 1 200 pages this is a 3 MB read
   for one lookup; at 10 000 it is a design fault. The site-level parts (`types`,
   `fragments`, `groups`, `runs`) are small and belong where they are.
3. **`scan.json` duplicates `urls.json`'s scan columns** (6687 rows × 10 fields). It is
   raw input, read once by `urls import`, kept as provenance. Honest, but unnamed as such:
   nothing says "raw, do not read".
4. **`subsets/*.txt` are URL lists**, not selections. The group subsets repeat URLs that
   `urls.json` already groups; a `pick --write` subset is a frozen list that silently
   diverges from the inventory it came from (pages later cached by another selection are
   still listed). The selection a step needs is "these URLs at this time" — a list is
   right for that; the duplication is the price, and `project.json.cacheSelection` names
   lists, not criteria.
5. **Run state is scattered**: `.work/warm/<job>.json` (one per selection),
   `.work/<step>/run.json` (three steps), `cache/progress.json` (a dashboard digest of the
   warm jobs — the only run file outside `.work/`), `status.json`. Four shapes for "a
   background run": `state`, `done/total`, `failed`, timestamps — similar, not the same.
6. **Views repeat their JSON.** Every `<step>.md` restates its `.json` for the operator,
   and `REPORT.md` restates the `.md` as a section. By design (words for people, data for
   programs) and cheap — but three places can disagree after a rerun (the capture section
   did not exist until this week; `## elements` is written by the worker and overwritten
   by the agent).
7. **The entity "website" is spread over the step directories.** Origin in `project.json`,
   recipe under `probe/`, overlays under `prep/`, chrome under `chrome/`, element types
   under `elements/`, blocks under `mapping/`. Each is where its step put it. A reader who
   wants "what we know about this site" has to know the steps.
8. **Nothing states the invariant** "the cache is the only irreplaceable thing; everything
   else is decisions (five files) or derivable". It is true today; a future step can break
   it without noticing.

## 4. What to change — and what not to

The structure is **process-oriented** (a directory per step) and that is right for the
question the system must answer at every moment: what is done, running, waiting. Turning
it **entity-oriented** (a `site/`, a `pages/`) would make "everything about page X"
natural and "where are we" harder; both questions matter, so the answer is not to move
files but to give them identities and a map. Minimal, in order of value:

- **A. A data model reference** (`references/data-model.md`): the five entities, the
  table above, the two invariants — *a fact has one home; everything but the cache and
  the decisions is regenerable* — and the rule a new step must obey (its JSON is either a
  decision or derived; per-page facts go per page). One page; the check that reads
  `project-structure.md` for artefacts can read this too.
- **B. A page id.** `id: sha8(url)` on every `urls.json` record (the store already uses
  it); `elements.json.pages[].id`, `chrome.json` page lists and `inventory.json` coverage
  carry the id beside the URL. No file moves. Every join becomes explicit and cheap.
- **C. Per-page decomposition out of `elements.json`.** `elements/pages/<id>.json`
  (sections, coverage, composition) written per page; `elements.json.pages[]` becomes
  the per-page *summary* (id, url, group, coverage, covered) — a few hundred bytes each.
  Readers that want one page read one file. Same for the crops' index if it grows.
- **D. Name the raw.** `urls/scan.json` → `urls/raw/scan.json` (or a `_raw` prefix) and a
  line in the model: raw input, read once, kept for provenance.
- **E. One shape for a run.** `.work/<step>/run.json` for every background step with the
  same fields (`state`, `started`, `finished`, `done`, `total`, `failed[]`, `current`);
  the warm's per-selection jobs keep their own files but share the shape;
  `cache/progress.json` goes (the dashboard reads `status.json`, which already carries
  running progress). One reader for all of them.
- **Not now**: moving to entity directories; a database; a manifest of files (the step
  table in `steps.mjs` plus `project-structure.md` is the manifest, and a test enforces
  that every artefact is listed); de-duplicating the `.md` views (they are the operator's
  reading, cheap to regenerate, and the report-section note now says when one is missing).

Order: A (words, an afternoon) → B (ids; touches `urls`, `elements`, `chrome`, `mapping`,
dashboard; replay) → E (runs; `status` and dashboard) → C (per-page files; `elements`,
`mapping`, dashboard) → D. Each a commit with its replay.

## 5. The two questions, answered after the changes

- *Where are we, what is done, in progress, remaining?* — `status.mjs --text` today;
  unchanged, with every background step reporting one shape.
- *What do we know about page X / about this site?* — by id: `urls.json` record →
  `cache` (its body), `capture/<id>.json` (its tree), `elements/pages/<id>.json` (its
  sections and coverage), membership in `chrome.json`; site-level in `project.json`,
  `probe/`, `prep/`, `chrome.json`, `elements.json` (types), `mapping.json` (blocks) —
  with `data-model.md` as the map.
