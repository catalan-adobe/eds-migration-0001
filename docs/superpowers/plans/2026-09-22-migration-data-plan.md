# migration-data — plan

Spec: `docs/superpowers/specs/2026-09-22-migration-data-model.md`. A new sibling skill,
`plugins/web/skills/migration-data`, owns the data layer: schemas, validation, ids, atomic
writes, one module per unit, one CLI. `content-pipeline-v2` and any other client install
it and import `scripts/lib/*.mjs`; nothing else touches `migration/`.

Rules as before: zero runtime dependencies; Node ≥ 22; `node --test`; ≤ 100 chars a line;
one commit per task with a ledger row; tests test behaviour; every schema has a test that
rejects the wrong shape and accepts the right one.

## Unit 2 — the foundation: store, schemas, migration, runs, state

### 2.1 `lib/store.mjs` — the only code that touches the disk

- `openStore(cwd)` → `{ root, path(rel), read(rel, schema), write(rel, data, schema),
  exists, list(dir), remove }`. `root` is `<cwd>/migration`; created by `migration init`.
- `read` parses, validates against the named schema, returns the data; a file that fails
  validation throws naming the file and the first three faults.
- `write` validates, writes to `<file>.tmp`, renames (atomic), sets `updatedAt`.
- `id(kind, seed)` → `${kind}-${sha1(seed).slice(0, 12)}`: `pag-` pages, `typ-` types,
  `chr-` chrome variants, `frg-` fragments, `sel-` selections, `not-` notes, `mig-` the
  migration; runs are `run-<compact time>-<step>`.
- Classes: `CLASSES = { decision, raw, derived, run, history, evidence, view }` and a
  `classOf(rel)` from the schema registry — the invariant test reads it.

### 2.2 `lib/schema.mjs` — schemas and a validator, no dependency

- A validator for the JSON Schema subset the model needs: `type`, `properties`,
  `required`, `additionalProperties`, `enum`, `const`, `items`, `minItems`, `pattern`,
  `minimum`, `maximum`, `format: date-time`, `oneOf` by `const` discriminator. ~120 lines;
  faults as `path: message`.
- `SCHEMAS`: a registry `name → { version, class, schema }`; every file's `schema` field
  is `<name>@<version>` and must match the registry on read and write.
- Unit 2 registers `migration/migration@1`, `runs/run@1`, `state/state@1`; later units
  add theirs.

### 2.3 `migration.json`

```json
{ "schema": "migration/migration@1", "id": "mig-5f2a9c1e3b7d",
  "created": "2026-09-22T10:00:00.000Z", "updatedAt": "…",
  "source": { "origin": "https://www.example.com/", "scope": "https://www.example.com/" },
  "target": { "kind": "eds", "repo": ".", "owner": null, "site": null },
  "plan": { "pages": 500, "selection": null },
  "settings": { "cacheAllUpTo": 500, "captureMinWidth": 250, "pace": 1500,
                "skills": { "repo": "adobe/skills", "ref": null } },
  "approvals": { "cache": ["sample-50"], "elements": true } }
```

- `lib/migration.mjs`: `init(cwd, { origin, scope?, target?, plan?, settings? })`
  (refuses an existing migration), `open(cwd)`, `setting(name, value)`, `plan(patch)`,
  `approve(step, what)` (`what`: selection names for `cache`, `true` otherwise).
- `scope` defaults to the origin; `target.repo` defaults to `.` (the migration lives in
  the EDS repository).

### 2.4 `runs/<id>.json`

```json
{ "schema": "runs/run@1", "id": "run-20260922T101500Z-capture", "step": "capture",
  "state": "running", "started": "…", "finished": null, "updatedAt": "…", "pid": 4242,
  "total": 48, "done": 12, "failed": [{ "id": "pag-…", "error": "…" }], "current": "pag-…",
  "input": { "selection": "sample-50", "minWidth": 250 },
  "summary": null, "error": null }
```

- `lib/runs.mjs`: `start(store, step, input)` → run (state `queued`), `update(store, id,
  patch)` (refreshes `updatedAt`, the heartbeat), `finish(store, id, { state: 'done' |
  'stopped' | 'failed', summary?, error? })`, `list(store, { step? })`, `newest(store,
  step)`, `liveness(run, { now, staleAfterMs })` — `interrupted` when `running` with a
  dead `pid` or a heartbeat older than the threshold; `pid` is optional (a worker that is
  not a local process has only the heartbeat).
- `state` ∈ `queued | running | done | stopped | failed`; `interrupted` is computed, never
  written. `summary`: what the run did, in words.
- Finished runs stay: `runs/` is the history. `summary` is free-form per step
  (the elements step records types added and removed; the cache run its counts).

### 2.5 `state.json` and `lib/state.mjs`

```json
{ "schema": "state/state@1", "generatedAt": "…",
  "summary": "Cache running, 12 of 48 pages; chrome and elements wait on it.",
  "steps": [ { "id": "cache", "state": "running", "blockedBy": [], "run": "run-…",
               "progress": "12/48", "note": null }, … ] }
```

- The step registry lives in the data layer: `STEPS = [{ id, dependsOn, gate }]` — the
  process a migration goes through is part of the model, not of one client. Done-checks
  are data checks and arrive with their units (`pages`: the table exists; `cache`: every
  page of the approved selections is cached; …); unit 2 ships the registry, the gate and
  run logic, and a `checks` map that later units fill.
- `compute(store, checks)` → the states (`done` when its check passes; else `running`
  when its newest run is open; else `blocked` by unmet dependencies; else
  `waiting-operator` when gated and not approved; else `ready`), with `note` from the
  check; `write(store, states)` → `state.json`.

### 2.6 CLI `scripts/migration.mjs`

`migration init --origin <url> [--scope] [--target-repo]`, `migration show`,
`migration approve <step> [<selection>…]`, `migration runs [--step]`,
`migration state [--text]`. JSON out by default; `--text` for people. Unknown flags
refused with the usage line.

### 2.7 Invariant test

A test walks a fixture migration and asserts: every JSON file names a registered schema;
its class is one of the five; no `derived` file is required to rebuild another `derived`
file's inputs (the dependency graph of classes points only at `raw` and `decision`).

## Later units (one plan section each when their turn comes)

3. **pages**: `pages.json`, selections, `composition@1` schema (chrome, sections, items,
   omitted; selector mandatory, bounds optional), per-page directory; the scan, pick,
   cache and capture steps rewritten on the layer.
4. **website**: `website.json` summary, `access.json` (probe + prep), `chrome.json` as
   variant definitions; chrome detection writing variants and page compositions.
5. **elements**: `types.json`, `rules.json`, `blocks.json`, `inventory.json`, evidence by
   type id; decomposition writing compositions.
6. **notes and views**: `notes.json` + bodies; views rendered and referenced.
7. The steps, briefs and dashboard as clients; replay re-pointed.

## Commit ledger

| sha (tag) | task | what |
| --- | --- | --- |
| `542896e` | 2.1 2.2 | `store.mjs` (ids, atomic validated io), `schema.mjs` (registry, validator) |
| `e0d0314` | 2.3 | `migration.json`: init once, open, setting, plan, approve |
| `a0adcce` | 2.4 | runs: one shape, finished runs stay, heartbeat + pid liveness |
| `968676c` (`mdata-unit-2`) | 2.5–2.7 | state (process registry, checks), CLI, invariant test |
