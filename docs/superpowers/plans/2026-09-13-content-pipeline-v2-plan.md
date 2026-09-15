# content-pipeline-v2 — implementation plan

Spec: `docs/superpowers/specs/2026-09-13-content-pipeline-v2-design.md`. Repo
`$CODE = ~/repos/adobe-skills/.worktrees/eds-content-pipeline`, skill
`$SKILL = plugins/web/skills/content-pipeline-v2`. Node ≥ 22, ESM, **zero runtime
dependencies**, tests with `node --test`, every committed line ≤ 100 chars (SKILL.md
`description:` excepted), no site names, no internal jargon.

Operating rules (from the first skill's retro): a task is accepted only by an outcome on
disk the controller produced by running the thing; agent reports and exit codes are inputs;
weakening or deleting an assertion rejects the task; the controller runs `npm test`, the line
and residue gates and `npm run validate` (repo root) after every task.

## Layout

```text
$SKILL/
  SKILL.md
  steps/{setup,probe,prep,scan,prep-verify,cache,report}.md
  scripts/
    package.json          { "type": "module", "scripts": { "test": "node --test lib/" } }
    status.mjs            CLI entry: status | check <step> | urls | init | setup
    lib/
      steps.mjs           the step graph: id, tier, dependsOn, skill, artefacts, check()
      project.mjs         migration/ paths, project.json read/write, init
      checks.mjs          the done-checks (pure functions over file contents)
      urls.mjs            URLExtended reading, distribution, caching proposal, urls.md
      setup.mjs           dependency detection and project-scope installers (injectable)
      *.test.mjs
  references/project-structure.md
```

## Tasks

### Task 1 — project + step graph + status

- `project.mjs`: `resolveProject(cwd)` → paths under `<cwd>/migration/`; `init({ origin })`
  writes `project.json` `{ origin, created, cacheAllUpTo: 500 }` and `migration/.gitignore`
  (`.work/`, `cache/.page-cache/`).
- `steps.mjs`: the seven steps with `dependsOn`, `tier`, `skill`, `writes[]`, and
  `operatorGate: true` on `cache`.
- `status.mjs` (no args): per step `{ id, tier, skill, state, blockedBy[], writes }` where
  state ∈ `done | ready | blocked | waiting-operator`; `--text` renders a table. `cache` is
  `waiting-operator` when its dependencies are done and `project.json.cacheApproved` is not
  `true`; `status.mjs approve cache` sets it (the operator's yes, recorded).
- Tests: empty project → only `setup` ready; fake artefacts step by step → states change
  exactly as the graph says; `cache` gate; `--text` renders every step.

### Task 2 — done-checks

- `checks.mjs`: one pure function per step over `{ files }` → `{ pass, reasons[] }`:
  `probe` (recipe parses, `probe.md` non-empty), `prep` (≥ 1 `checked`, every overlay has
  `selector`), `scan` (`urls.json` array of `URLExtended` with ≥ 1 `url`; `urls.md`
  present), `prep-verify` (≥ 3 checked from ≥ 2 first path segments), `cache` (`cache.md`
  lists every URL of the approved selection as cached/failed/skipped), `report` (a `## <step>`
  section for every step whose artefacts exist). `setup` delegates to Task 4.
- `status.mjs check <step>` → JSON `{ step, pass, reasons }`, exit 1 when failing.
- Tests: every check pass and every listed failure reason, with minimal fixtures inline.

### Task 3 — URL distribution and caching proposal

- `urls.mjs`: `distribution(urls)` → total, by first segment, by second, by language
  (`URLExtended.lang` else the first segment when it is a 2-letter code); `proposal(dist,
  { cacheAllUpTo })` → `{ all: true }` or the largest prefix groups covering ≥ 80 %;
  `renderUrlsMd(dist, proposal)`; `writeSubsets(proposal)` → `urls/subsets/<prefix>.txt`.
- `status.mjs urls` writes `urls.md` and the subsets, prints the proposal.
- Tests: distribution on a mixed list; both sides of the threshold; 80 % cover with a long
  tail; subset files' contents; `urls.md` names the proposal in one sentence.

### Task 4 — setup detection and installers

- `setup.mjs`: `detect({ env, cwd, home, exec })` → `{ node: { ok, version }, playwrightCli:
  { ok, path }, packages: { 'franklin-bulk-shared': { ok, path } }, skills: { <name>: { ok,
  path } } }` looking at PATH, `migration/.work/node_modules/.bin`, `.agents/skills`,
  `.claude/skills`, `~/.agents/skills`; `install(missing, { exec, cwd })` runs the
  project-scope commands from the spec, `npx -y upskill` when `upskill` is absent;
  `writeSetupJson`.
- `status.mjs setup [--install]`; `check setup` = `detect()` all ok.
- Tests: fake PATH/dirs for every combination; `--install` calls the injected `exec` with the
  exact commands and never a global install; Node < 22 → exit 1 with the message.

### Task 5 — SKILL.md, step briefs, project-structure reference

- `steps/<id>.md` (≤ 60 lines each): purpose, tier, inputs (paths), the sibling skill to read
  and follow, outputs with exact names, the `REPORT.md` section to append, the done command.
  `scan.md` includes the `franklin-bulk-shared` snippet writing `URLExtended[]` to
  `urls/urls.json` and running `status.mjs urls`; `cache.md` starts with "only after
  `status.mjs approve cache`"; `prep-verify.md` picks 2 URLs from prefixes other than the
  homepage's.
- `SKILL.md`: description (triggers), quick start (`init`, `setup --install`, `status`), the
  structure, the step table with tiers, the harness ladder (workflow tool → subagents → todo)
  with the same loop in each, the guardrails, "Not in scope".
- `references/project-structure.md`: every file under `migration/`, who writes it, who reads
  it.
- Tests: `prompts.test.mjs`-style checks — every step has a brief, every brief names its done
  command and outputs, no brief exceeds 60 lines, no `Date.now()`/clock text.

### Task 6 — gates and acceptance

- `scripts/check-lines.mjs`, `check-residue.mjs` (site names, jargon) run by `npm run check`;
  repo-root `npm run validate` passes for the new skill; `plugins/web/tile.json` lists it.
- Acceptance by the controller, from an empty folder, on the acceptance site: `init` →
  `setup --install` (from nothing) → `status` → each step by the briefs → `status` all
  `done`; once driven by a todo list, once by a workflow script written outside the skill.
  Findings go to the plan's ledger, defects back into tasks.

## Order

1 → 2 → 3 → 4 → 5 → 6. Tasks 1–4 are code-only and can be parallel after Task 1 (2 and 3
independent; 4 independent). Task 5 needs 1–4 for exact command names. Task 6 last.

---

## Part 4 — after the first fresh-session run (6,684-URL root site, 20 min, $4.42)

1. `init` accepts `--skills-repo`/`--skills-ref` (recorded in `project.json`); every command
   rejects unknown flags loudly. The scan snippet resolves the project from its own location,
   not the cwd.
2. Scan snippet: no `limit` for sitemaps, `limit` only for `http`, a warning when the cap is
   hit; the brief asks to record any deviation from the snippet in `REPORT.md`. `urls.md`
   opens with the proposal sentence and caps every table at 25 rows.
3. SKILL.md: state the harness rung before the first step; a tier means a model switch or a
   subagent at that tier, and when the harness cannot, `REPORT.md ## setup` says so; one
   todo per step named by id. Briefs: screenshots under `migration/prep/`; sibling SKILL.md
   is the fallback when the snippet fails; refresh the overlay database when older than
   7 days; `eval` takes an expression (wrap statements in an IIFE), dismiss with the native
   click.
4. Hand-off note for the page-prep and browser-probe sessions.
5. Acceptance in a fresh folder on the same site: `init` with the flags → `setup --install`
   → scan from inside `migration/.work/` → `urls.md` proposal on its first lines, no cap.

---

## Part 5 — after the second fresh-session run (same site, medium-tier model)

Steps 1–5 ran clean; `cache` failed four ways and `check cache` passed an HTML-only cache. The
cache step is the one step that drives a long-lived process across many tool calls; it becomes
one script.

1. **`check cache` inspects the cache.** For every `cached` row the proxy's body file exists at
   the deterministic path (`<host>_<sha256(origin)[0:8]>/<path>`, `index.html` for directories
   and extension-less paths, `!query` before the extension); a cache holding pages but no
   CSS, JS, image or font fails with "warmed without a browser". `approve cache` with no
   selection errors on an over-threshold site and lists the subsets; `all` must be typed.
2. **`pick --count N --write <name>`** writes `urls/subsets/<name>.txt`: N URLs round-robin over
   the groups, HTML pages only (no pdf/xml/txt/php), no duplicates, reachable.
3. **`status.mjs section <id>`** upserts one `REPORT.md` section from stdin; briefs use it; the
   report brief never rewrites the file.
4. **`scripts/warm.mjs`** — the cache step as one process: resolve the selection; start the
   page-cache proxy on a free port; drive `playwright-cli` through it (open with the probe
   config, `goto` per URL, hide rules + scroll fix in one expression, scroll down and back,
   pace); stop; restart `--offline`; request every URL, record `cached`/`failed`; count assets;
   write `cache/cache.md`; upsert `## cache`; exit 1 when a URL failed or no asset was cached.
   Every external call (`spawn` proxy, `playwright-cli`, `fetch`) is injectable; tests use a
   fake proxy (an `http` server that records requests and writes files in the cache format) and
   a fake browser. The cache brief becomes: approve, run `warm.mjs`, read the check.
5. Briefs and SKILL.md: scan runs in the foreground and quotes its last line; never delete
   under `migration/cache/` (a re-warm is idempotent); pre-authorisation in a prompt names a
   size, so build the subset with `pick --write` and approve that; no bash arrays; `cache`
   stays tier `low` because the driver carries the mechanics.
6. Acceptance: the second run's 47-HTML cache fails the new check; the driver caches 5 pages
   of the real site through the real proxy with assets present and `check cache` passing.

---

## Part 6 — the URL inventory, augmented at cache time

Premise: every URL to be migrated is cached at some point, so the cache visit is where a URL
is classified and documented — no separate pass, no extra request per URL. The one file that
holds what is known about each URL is `urls/urls.json`; the runner is its only writer.

1. **Inventory ownership.** `scan` writes the crawler's raw `URLExtended[]` to `urls/scan.json`.
   `status.mjs urls` merges it into `urls/urls.json`: new URLs added (`URLExtended` fields
   plus `group`, the first segment below the shared scope), known URLs keep every enrichment,
   URLs missing from the latest crawl get `inLastScan: false` (never deleted). Operator lists
   go through the same merge (`status.mjs urls import <file>`). `urls.mjs` owns read, merge,
   write; `lib/inventory.mjs` holds the record shape.
2. **Augmentation by `warm.mjs`**, per visited URL, from the proxy sidecars only plus one
   browser read:
   - `http`: `status`, `contentType`, `bytes` (cached body size), `lastModified`, `etag`.
   - `redirect`: `status`, `target` (normalised to a site URL), `chain[]` (every hop the proxy
     stored), `targetInList`.
   - `finalUrl`: `location.href` after the pace wait, normalised (proxy prefix removed,
     fragment dropped); a cross-origin landing keeps the other host. `finalUrl !== url` with a
     2xx sidecar marks a client-side redirect.
   - `kind`: `page` (2xx + html, no redirect) · `binary` (2xx + other) · `redirect` (3xx, or
     `finalUrl` elsewhere) · `error` (4xx/5xx) · `unreachable` (no response).
   - `migrate`: `yes` (page) · `target` (redirect; migrate `redirect.target`/`finalUrl`) · `no`
     (error) · `asset` (binary).
   - `cache`: `{ at, selection, path, durationMs }`.
   Written through `urls.mjs` (`recordVisit(url, facts)`), never by hand. A source `4xx/5xx`
   is `kind: error`, terminal, and not a cache failure; `failed` stays for no response.
3. **Binaries**: decided by extension before the visit and, when a navigation turns out to be a
   download, after it: fetched through the proxy with a browser-side `fetch` from the current
   page (same channel, no download prompt, cached, content-type confirms).
4. **Consumers**: `cache.md` rows carry `kind` and the target for redirects; `urls.md` gains
   counts by kind, the redirect table (source → target, status, in list), the not-to-migrate
   list, cached vs uncached; `pick` and the proposal skip URLs already known as `redirect`,
   `error` or `binary`; `check cache` requires `kind` for every selected URL; `check scan`
   accepts `scan.json` + merged `urls.json`.
5. **Deferred**: `title`, `lang`, `canonical`, `robots`, `textLength`, soft-404 and other DOM
   reads; automatic downgrades of `migrate` from flags.
6. **Acceptance**: replay on the run-5 cache (50 sidecars → 50 records with `kind: page`, the
   9 sample PDFs classified `binary` when cached); a hand-made fixture with a 301, a 404 and a
   client-side redirect through the fake proxy and browser; the fresh-site run afterwards.

## Part 7 — the migration dashboard (built ahead of this write-up)

Done in 2525443 and 614915a. `init` copies `tools/migration/` (HTML, module, stylesheet, no
dependencies) into the EDS repository and adds `migration/` to an existing `.hlxignore`;
`aem up` serves ignored files from disk (with a warning), so the dashboard reads
`migration/status.json` (now written on every `status`/`check`), `project.json`,
`setup.json`, `urls/urls.json` and `REPORT.md` locally while nothing is deployed.
`status.mjs dashboard [stop]` starts `aem up` on a free port and prints the URL; `free-port`
tests by connecting (a bind succeeds on ports other processes serve — SO_REUSEADDR).

## Part 8 — caching in the background, in phases

Operators cache in phases (one subset, then another) and must not have their session blocked
while a phase runs. Both runs so far blocked the session for the whole warm; a second subset
meant waiting. The mechanism belongs in `warm.mjs`, as with `dashboard`: the script detaches
itself; there is no foreground mode to pick wrongly.

### Task 1 — jobs and the detached worker

- `lib/jobs.mjs`: `enqueue(project, selection, urls)` writes
  `migration/.work/warm/<id>.json` `{id, selection, total, done, failed, current, started,
  finished, pid, state}` with `state: queued|running|done|interrupted|stopped`; `readJobs`,
  `alive(pid)` (`process.kill(pid, 0)`), `next()`.
- `warm.mjs` (no arguments): resolves the approved selection as today, enqueues a job (a job
  for the same selection that is `queued` or `running` is not duplicated), and if no worker is
  alive spawns `node warm.mjs --worker` detached with stdio to
  `migration/.work/warm/worker.log` (never inherited: an inherited pipe blocks the harness's
  shell call), `unref()`, prints `{job, queued, worker: {pid, started}}` and exits. Under one
  second.
- `--worker`: takes jobs from the queue in order; runs `warm()` per job with an `onProgress`
  io hook that updates the job file after every URL (done/failed/current); marks `done`.
- Tests: fake io as now; the CLI adapter's spawn is injectable; the job file after each URL.

### Task 2 — the step graph knows about running work

- `stepStates` gains `running` (a job `running` or `queued` exists and `check cache` is not
  yet passing). `status.mjs --text`, `status.json` and the dashboard chip show it, with
  `12/50 (blogs) · queued: ja-jp`.
- `check cache` refuses while a job is alive: `cache: warm job blogs running 12/50 — nothing
  downstream may start on a half-warmed cache`. Only when the queue is empty does it inspect
  `.page-cache/` and the inventory as today.
- `warm.mjs status` prints the jobs; `warm.mjs stop` sends SIGTERM to the worker, which drains
  (finishes the current URL, writes the job as `stopped`) — the drain exists today for SIGINT.

### Task 3 — interruption and resume

- A job whose pid is dead but whose state is `running` is reported `interrupted` (machine
  slept, terminal closed). Running `warm.mjs` again enqueues the same selection; the worker
  skips URLs whose inventory record has `cache.at` for this selection — the proxy would serve
  them from disk anyway, but skipping saves the browser visits.
- Only one worker at a time: the playwright-cli session and the proxy are per-job singletons,
  and serial is the bot-friendly behaviour.

### Task 4 — briefs

- `steps/cache.md`: run `warm.mjs`; it returns at once; do not poll in a loop or wait for it —
  report the job to the operator and stop, or move to the next unblocked step; the operator
  (or the next session) runs `status.mjs` to see progress; `report` is blocked while a job
  runs. `approve cache <next subset>` followed by `warm.mjs` queues the next phase.
- `SKILL.md`: `warm.mjs [status|stop]` in the command list; the phase pattern in the cache
  section; the `running` state in the states list.

### Task 5 — acceptance

- Unit: queue order, dedup, progress after every URL, `check cache` refusal while running,
  `interrupted` on a dead pid, resume skipping, stop draining.
- Real (a scratch clone, not a run in progress): approve `blogs`, `warm.mjs` returns in
  under a second, session free; approve `ja-jp`, `warm.mjs` queues it; `status.mjs --text`
  shows `running 12/50 (blogs) · queued: ja-jp`; `check cache` refuses during and passes
  after; the dashboard's cached count grows on reload; `warm.mjs stop` mid-job leaves a
  `stopped` job and a consistent inventory; rerun resumes.

### Deferred

- Parallel workers per host, a progress websocket for the dashboard (reload is enough),
  notifications when a job ends (the next `status.mjs` call is the notification), and any
  scheduling (pace/hour windows) until a site needs it.

## Part 9 — testing at the seams

Line coverage of `lib/` is 98.7 % (c8, one-off), the suite runs in 5 s, and none of the six
defects found by real runs in Part 8 was in covered library code. They were at process and
contract seams: the CLI adapters in `scripts/warm.mjs` (no tests at all), the sibling CLIs'
real output, the OS. More unit tests would not have found them; running the real thing does.

### Task 1 — the CLI adapters get tests

- `proxyStarter`, `playwright`, `ensureWorker`, `workerMain`, `main` move from
  `scripts/warm.mjs` to `lib/warm-cli.mjs` with `execFile`, `spawn` and `fetch` injectable;
  the entry file stays a few lines. Same for `status.mjs dashboard`'s io.
- Tests: `playwright()` against recorded real output (`### Result`, `### Error` on stdout,
  the update banner on stderr) — `-s=cache` on every call, the real error line extracted;
  `ensureWorker` with a fake spawn — one claim under concurrent calls, `detached`, stdio to
  the log and never inherited; `proxyStarter` — dead child reported with its stderr,
  `--offline` passed, stop escalates to SIGKILL.

### Task 2 — contract tests against the real siblings

`npm run test:integration` (`node --test integration/`), each test skipped with a clear
message when its sibling is not installed; a fixture site on `127.0.0.1`, never the internet.

- page-cache proxy: sidecar layout matches `cacheRelativePath`, `?_origin=`, a 301 stored
  with its `location`, `/__status`, `--offline` serving.
- playwright-cli: `eval` double-encoding (the `parseEval` assumption), `### Error` on a
  failed `goto`, session isolation (default session opened and closed while `-s=cache` holds
  a page).
- `aem up` through `status.mjs dashboard` in a temporary git repository: starts while other
  ports are held, serves an `.hlxignore`d `migration/`, `stop` frees the port; a folder that
  is not a git repository fails with the message.
- `free-port` against listeners bound on `0.0.0.0`, `127.0.0.1` and `::`.

### Task 3 — one end-to-end run without the internet

Fixture site (sitemap, a 301, a 404, a PDF, a cookie banner) served locally: `init → urls
import → approve → warm (worker in-process) → check cache → status`, then the dashboard
rendered by playwright-cli with its rows and cards asserted. The regression net for "the
pieces still fit" and the only test the dashboard has.

### Task 4 — assertion strength, once

Stryker mutation testing run ad hoc on `lib/` (`npx`, nothing committed); survivors that
matter are fixed. Not a gate.

### Task 5 — hostile fakes by default

The fake browser and proxy gain `failsOn`, `diesAfter` and slow knobs and the existing
tests use them, so unhappy paths run every time.

### Not done on purpose

A coverage threshold (would push toward padding), jsdom for the dashboard (playwright-cli
does it without a dependency), property-based tests (no parser worth it), more tests for the
parked first skill.
