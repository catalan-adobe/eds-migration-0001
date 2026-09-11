# eds-content-pipeline — Plan C, part 1 (two gaps before a real-site run)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two gaps that make the `template` and `bulk` stages unrunnable on a real
site: representatives have no source captures before `analyse`, and a time-boxed `bulk --run`
passes its gate on a partial run. Part 2 (the hirslanden run) is written once a DA org/site
exists.

**Architecture:** A `capture` run unit opens the `template` stage and fetches the
representatives' HTML into `data/captures/<t>/` through the shared capture writer that `bulk`
already uses. `bulk --run` writes `data/bulk/<t>-run.json` with what was selected, what
reached a terminal status and what remains; `stage.mjs check-run <t>` gates on it; a new unit
key `resume: { while: <stopped value>, max_rounds: N }` tells both executors to re-run a
`run:` unit while its stdout JSON reports that stop reason (bulk is resumable), instead of
retry-once.

**Tech Stack:** as Plan B. **Spec:** `docs/superpowers/specs/2026-09-09-eds-content-pipeline-design.md`
§5, §7. **Ledger:** `.superpowers/sdd/2026-09-10-eds-content-pipeline-plan-b/progress.md`
(continued).

## Global Constraints

Those of Plan B apply unchanged (gates from `$SKILL/scripts`: `npm test` 293 pass now,
`npm run check`, e2e, repo `npm run validate`; ≤ 100-char lines; no jargon; TDD; never weaken
an assertion; acceptance = an outcome on disk the controller produced by hand on the fixture).

---

### Task 1: `capture.mjs` and the `capture` unit

**Files:**

- Create: `$SKILL/scripts/lib/capture.mjs`, `$SKILL/scripts/lib/capture.test.mjs`
- Modify: `$SKILL/scripts/lib/state.mjs` (export `writeCapture`), `$SKILL/scripts/lib/bulk.mjs`
  (use it), `$SKILL/stages/template.yaml`, `$SKILL/prompts/analyst.md` (inputs mention the
  unit), `$SKILL/SKILL.md` (runner table, stage table), `$SKILL/scripts/lib/stage.test.mjs`
  (template walk-through expects `capture` first)

**Interfaces:**

- Produces: `writeCapture(paths, template, url, html) → file` in `state.mjs` (writes
  `data/captures/<t>/<captureSlug(url)>.html` when missing or changed; returns the path).
  `capture.mjs <template> [--limit 3] [--check]`: selects the template's representatives
  (`representative=true`; when none is flagged, the first `--limit` URLs of the template in
  `urls.json` order), fetches each with the http client (`rateLimit`, cache off), writes the
  capture, prints `{ template, captured: [url…], failed: [{ url, error }] }`, exit 1 when any
  failed. `--check` fetches nothing: exit 0 when every representative has a capture file,
  else prints `{ template, missing: [url…] }` and exits 1. `stages/template.yaml` gains
  `- id: capture / run: node scripts/lib/capture.mjs <template> / done_when: node
  scripts/lib/capture.mjs <template> --check`, and `analyse.depends_on: [capture]`.

- [ ] **Step 1: Failing tests** (`capture.test.mjs`, using the fixture server and a seeded
  temp repo as `stage.test.mjs`'s `fixtureRepo()` does — copy that helper):

```js
test('capture fetches the representatives and --check passes only when all exist', async () => {
  const { repo, server, paths } = await fixtureRepo();
  try {
    const before = await cli(repo, 'capture', 'product', '--check').catch((e) => e);
    assert.equal(before.code, 1);
    assert.deepEqual(JSON.parse(before.stdout).missing.length, 2);
    const out = await cli(repo, 'capture', 'product');
    assert.deepEqual(out.captured.sort(), [`${server.origin}/product-a.html`,
      `${server.origin}/product-b.html`]);
    const file = path.join(paths.dataDir, 'captures', 'product', 'product-a.html');
    assert.match(await readFile(file, 'utf8'), /<table class="specs">/);
    assert.equal((await cli(repo, 'capture', 'product', '--check')).missing.length, 0);
  } finally { await server.close(); }
});

test('a representative that fails to fetch is reported and the others are captured', …);
// stub the http client through MIGRATION_* env? capture.mjs takes the real client; the test
// seeds a urls.json record pointing at `${origin}/missing.html` (404) beside product-a.
```

(`cli` here runs `lib/capture.mjs` the way `stage.test.mjs`'s `cli` runs `stage.mjs`.)

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement.** Move `bulk.mjs`'s `captureSource` body into `state.mjs` as
  `export async function writeCapture(paths, template, url, html)`; `bulk.mjs` calls it.
  `capture.mjs`: `loadConfig`, `createClient({ requestsPerSecond, cacheDir })`,
  `listRecords('urls', { where: { template } })`, pick representatives, `client.get(url,
  { cache: false })`, non-200 → `failed`. Add the YAML unit; `analyse` depends on it. Update
  the `stage.test.mjs` template walk-through to expect `['capture','done']` first (it already
  has captures from the bulk run, so `capture` re-fetches and `--check` passes).
- [ ] **Step 4: Run** → pass; `npm run check` (validate:stages covers the YAML); e2e. By hand
  on a fresh fixture repo WITHOUT running bulk first: `stage.mjs run template template=product
  --skip-llm` must now get past `analyse` (captures exist → `check-evidence` passes) and stop
  at `review` — the exact circularity this task removes.
- [ ] **Step 5: Commit** — `git commit -m "template stage: capture the representatives before analyse"`

---

### Task 2: `bulk --run` reports what remains; the executors resume until nothing does

**Files:**

- Modify: `$SKILL/scripts/lib/bulk.mjs` (run report), `$SKILL/scripts/lib/stage.mjs`
  (`check-run`, `resume` in the schema and in `runUnit`), `$SKILL/workflows/pi/stage.mjs`
  (resume loop), `$SKILL/stages/bulk.yaml`, `$SKILL/scripts/lib/bulk.test.mjs`,
  `$SKILL/scripts/lib/stage.test.mjs`, `$SKILL/scripts/lib/pi-stage-rework.test.mjs`,
  `$SKILL/scripts/lib/workflows.test.mjs`, `$SKILL/SKILL.md`

**Interfaces:**

- `bulk --run` writes `data/bulk/<t>-run.json`: `{ template, runId, generatedAt, selected,
  terminal, remaining, longTail, failed, stopped }` where `selected` = URLs the run was asked
  to process, `terminal` = those now in `uploaded|previewed|verified|long-tail|failed`,
  `remaining` = `selected − terminal` (deadline-skipped or still `analyzed`/`transformed`),
  `stopped` = `'deadline' | null`. The report's `stopped` is also the CLI's stdout `stopped`.
- `stage.mjs check-run <t>` → `{ template, selected, remaining, longTail, failed, stopped,
  pass }`, exit 1 unless `remaining === 0 && longTail === 0 && failed === 0 && !stopped`;
  exit 1 with `No run report at …` when the file is missing.
- Stage schema: optional unit key `resume: { while: 'deadline', max_rounds: 8 }` (only on
  `run:` units; validator rejects it on `role:` units). Both executors: after a `run:` unit's
  command exits 0, if its stdout JSON has `stopped === resume.while` and rounds < max_rounds,
  run the command again (not a retry — a resume) before evaluating `done_when`; the unit's
  ledger row carries `detail: 'resumed N times'`. Exhausting `max_rounds` fails the unit
  with `stop.reason: 'resume-exhausted'`.
- `stages/bulk.yaml` `run` unit: `resume: { while: deadline, max_rounds: 8 }`, `done_when:
  node scripts/lib/stage.mjs check-run <template>`.

- [ ] **Step 1: Failing tests**
  - `bulk.test.mjs`: with `options: { maxMinutes: 0 }` (deadline already passed) a `--run`
    over two URLs writes `run.json` with `selected: 2, terminal: 0, remaining: 2, stopped:
    'deadline'`; a normal run writes `remaining: 0, stopped: null`.
  - `stage.test.mjs`: `check-run product` fails with `No run report`; after writing a report
    with `remaining: 1` it fails with `pass: false`; with `remaining: 0, longTail: 0, failed:
    0, stopped: null` it passes. Schema: a `role:` unit with `resume` is rejected by
    `validateStages` with `resume only on run units`. Executor: a temp stage YAML whose `run:`
    command is a tiny script (written by the test) that prints `{"stopped":"deadline"}` on
    its first two invocations and `{"stopped":null}` on the third (count in a temp file);
    `stage.mjs run` with `resume: { while: deadline, max_rounds: 5 }` records `resumed 2
    times` and `done`; with `max_rounds: 1` it fails with `resume-exhausted`.
  - `pi-stage-rework.test.mjs`: the same two cases through the interpreter with an agent stub
    whose `stdoutJson.stopped` sequence is `deadline, deadline, null`.
  - `workflows.test.mjs`: static — the interpreter reads `unit.resume` and `stdoutJson`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (bulk report in `writeArtifacts` for `run` mode; `check-run`;
  `resume` in `UNIT_KEYS`, `schemaErrors`, `planStage` output, `runUnit`; interpreter's
  `settleUnit` loop; YAML; SKILL.md stage table note "bulk `run` resumes until every selected
  URL is terminal").
- [ ] **Step 4: Run** → all pass; e2e; `npm run check`. By hand on the fixture: `stage.mjs run
  bulk template=product --skip-llm` unchanged (`run` is `skipped-no-da`); then with a fake
  `DA_TOKEN` and a stubbed DA? Not available without DA — instead run `bulk.mjs --template
  product --run --max-minutes 0` directly and read `run.json`: `remaining: 2, stopped:
  'deadline'`; `stage.mjs check-run product` exits 1 naming `remaining`.
- [ ] **Step 5: Commit** — `git commit -m "bulk run: report what remains; executors resume until nothing does"`

---

## Self-review

- Spec §5: `done_when` stays a runner command; `resume` is a new schema key → spec §5 to
  gain one sentence at the end of the plan. §7: both executors implement resume identically.
- Placeholders: the second capture test is described, not written — the implementer writes
  it following the first; all other code is given or names an existing function.
- Types: `writeCapture(paths, template, url, html)` used in Tasks 1 (bulk, capture.mjs);
  `resume: { while, max_rounds }` used in Task 2 across YAML, stage.mjs, interpreter, tests.
