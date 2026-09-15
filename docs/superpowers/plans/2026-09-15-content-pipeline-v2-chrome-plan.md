# content-pipeline-v2 — local cache mechanism and the `chrome` step

Spec: `docs/superpowers/specs/2026-09-15-content-pipeline-v2-chrome-design.md`. Repo
`$CODE = ~/repos/adobe-skills/.worktrees/eds-content-pipeline`, skill
`$SKILL = plugins/web/skills/content-pipeline-v2`. Same rules as the v2 plan: zero runtime
dependencies, Node ≥ 22, `node --test`, every committed line ≤ 100 chars, no site names, no
internal jargon, control flow in code not prose, a step is done when a runner check says so.

Operating rules unchanged: a task is accepted by an outcome on disk produced by running the
thing; weakening or deleting an assertion rejects the task; after every task `npm test`,
`npm run check`, `npm run test:integration`, repo `npm run validate`; new checks are replayed
against real-run artefacts (the caches of `eds-mig-20260914-{08,09,10}`, ~100 pages each,
with one locale group and one blog template — the expected variant split).

Test beds: real caches copied to `/tmp/` (never the run repos themselves); the fixture site
of the integration tests for anything that must run in CI without a real cache.

## Part A — the local cache as a mechanism

Today the page-cache proxy is a private detail of `warm.mjs`, started and stopped per job.
No step after `cache` can use the cache without knowing that. Part A makes the cache
*available* (start-on-demand, idempotent, visible) — not permanently *running*: a server
nobody owns drifts (dead pid, taken port, several servers per repo).

Decision (after weighing a CLI for the whole pipeline): no router over the sibling skills.
Wrapping a sibling is justified only where the runner adds project state, a port, a wait or a
check — never to rename; agents wanting the raw sibling use its own skill. `status.mjs` is
already the pipeline's project-aware surface; the cache becomes a noun on it. Folding the
entry scripts into one dispatcher or a shim in the repo is cosmetic and deferred until it
demonstrably costs an agent something.

### Task A0 — `--help` from the command table

`status.mjs --help` and `status.mjs <noun> --help` are generated from the command table
(name, arguments, one line each), so briefs say "run `--help`" instead of listing verbs.
Top level lists nouns and step commands only; a noun's help lists its verbs. A test asserts
every command in the table has a one-line description and that the help fits 40 lines.

### Task A1 — the `cache` noun: `serve`, `stop`, `status`, `url`, `ls`, `has`, `get`

- `lib/cache-server.mjs`, modelled on `lib/dashboard.mjs`: `cacheServer(project, freePort,
  io)` returns `{ port, pid, offline: true, reused }`. Liveness = `/__status` answers on the
  recorded port with the recorded cache dir; then reuse. Otherwise free port, spawn
  page-cache `--offline` on `cache/.page-cache`, detached, stdio to `.work/cache-server.log`,
  wait for `/__status`, record `.work/cache-server.json`. `stop` kills the pid, removes the
  file. Every external call through `io` (`spawn`, `fetch`, `kill`).
- `proxiedUrl(origin, url, port)` → `http://127.0.0.1:<port><path><query>&_origin=<origin>`
  (the one place that knows the `?_origin=` form). Refuses a URL not on the project origin.
- `status.mjs cache serve|stop|status` — the offline server (`serve` prints `{ port, pid,
  offline, reused, cached }`); `cache url <url>...` prints one proxied URL per line, starting
  the server if needed; `cache ls [--group g] [--kind k]` lists cached URLs from the
  inventory; `cache has <url>` exits 0/1; `cache get <url>` prints the stored body (sidecar
  headers with `--headers`). `ls`, `has`, `get` read the inventory and the cache dir, no
  server. All fail with a plain message when `cache/.page-cache` does not exist yet.
- `warm.mjs` is unchanged: its online proxy is per job on its own port. Two proxies on one
  dir (one writing, one reading) are fine; a test asserts the offline server does not answer
  a URL that is not cached with anything but 404.
- Tests: unit with injected io (reuse, dead pid, port taken, bad `/__status`, stop without a
  server, `proxiedUrl` on foreign origin); integration against the real page-cache script on
  the fixture cache (start, `/__status`, one cached page served, one uncached → 404, stop).

Acceptance: on a copy of a real cache, `status.mjs cache serve` twice → same port, second
says `reused: true`; `cache url` of a cached page fetches with `curl` and returns the same
body as `cache get`; `cache url` of an uncached page → 404 and the origin is not contacted
(the proxy's `/__status` misses stay at 0, no outbound connection in `lsof`); `cache ls
--group <g>` matches `cache.md`.

### Task A2 — visible everywhere

- `status.mjs` (text and JSON) gets a `cache server` line: `running on <port> (offline,
  <N> pages)` or `not running — status.mjs cache serve starts it`; `status.json` carries the
  same object; the dashboard shows it in the project line and links `cache.md`.
- `check cache` unchanged; `check` of any later step includes `cache server reachable` only
  where that step needs it (chrome does).

Acceptance: `status.json.cacheServer` present in both states; dashboard renders both.

### Task A3 — the reference and the rule

- `references/local-cache.md` (≤ 60 lines): what the cache is (stored bodies plus what the
  browser fetched during the cache step), where (`cache/.page-cache`, `cache.md` lists the
  pages), how to read it (`status.mjs cache ls|get`), how to open a page in the browser
  (`cache url`), what offline 404 means ("not cached" — never "fetch it live"), and the
  limit: absolute same-host URLs inside a page bypass a reverse proxy (see A4).
- `SKILL.md`: one rule — after the `cache` step no step touches the origin; every read goes
  through `status.mjs cache …` (`ls`, `get`, `url`). `steps/cache.md` and `steps/report.md`
  link the reference; every later brief (chrome first) opens with it.
- Line, residue and validate gates cover the new files.

Acceptance: gates green; a subagent given only `SKILL.md` + the reference opens a cached
page through the proxy without composing `?_origin=` by hand (one-shot check, transcript
kept under `.superpowers/`).

### Task A4 — measure the escape hatch

Open ten cached pages of a real cache through the offline server in the browser, with the
network log on. Count requests that left for the origin (absolute same-host URLs, third-party
hosts). Record in this plan: share of requests that bypassed the proxy, whether any were
first-party assets, and whether a page rendered visibly different offline. Decision follows
the number: negligible → state the limit and move on; material → an issue on page-cache
(forward-proxy mode or host rewrite) and, until then, the browser session for downstream
steps blocks the origin host (`playwright-cli` route rule), so "never touch the origin" holds
even when a page tries.

### Part A — record (87b9dea, 1ed253a, 4145255, 1088167, 96af770)

A0–A3 as planned. A4 measured on ten cached pages of the 6,687-URL site through the offline
server, browser request log on: 1,221 requests; **0 to the site's own host** (page-cache
rewrites same-host absolute URLs and follows sub-resources by cookie), 0 proxy misses on
page requests; **814 (67 %) live to other hosts** — Coveo search 360, OneTrust 70, Adobe
Launch 70, the brand's image CDN 59, Brightcove, Adobe Analytics beacons, Cloudflare
Insights. So the rule held literally and failed in spirit: an "offline" render fetched the
customer's images live and fired their real analytics. Decision: material. `cache serve`
writes `.work/cache-browser-config.json` (probe config + `network.allowedOrigins` = the
proxy alone); a session opened with `--config` on it made **0 successful off-machine
requests**, and the page still rendered header, nav, hero, cards and footer with 42 of 100
images missing (all from the image CDN). Remaining gap, owned by page-cache: caching
additional first-party hosts (image CDN) with the same rewrite — hand-off note. Also seen:
the site's chrome has no `<header>` landmark (div-based), confirming that detection must
not rely on landmarks. A3's subagent one-shot ($0.13): given only `SKILL.md` and the
reference, the agent ran `cache ls`, `cache url`, opened the address with `--config`,
read the title, `cache stop`; it never composed `?_origin=` and never ran `serve` by
hand. It had to infer the browser config path and hit `--config` on `close` (rejected);
the reference now shows the literal two-line open command (2961055).

## Part B — the `chrome` step

### Task B1 — capture every cached page

- `chrome.mjs` (entry) with `lib/chrome-capture.mjs`: for every inventory record with
  `cache.verified`, open the proxied URL in a named playwright session, wait for load,
  inject the page-tree bundle (resolved from the sibling skill, `setup` already detects it),
  eval the capture, store `chrome/.captures/<sha8>.json` `{ url, capturedAt, tree, nodeMap,
  viewport }`. Three sessions in parallel (`chrome-1..3`); the proxy is local.
- Long-running (≈100 pages × 3–5 s): detached, like `warm.mjs`, with `.work/chrome/job.json`
  progress, `chrome.mjs status|stop`, resume skips existing captures, `--force` recaptures.
  Step state `running` with `N/M` label. Failed page → recorded in the job, loop continues.
- Playwright cwd is `migration/.work/`; no artefacts in the repo root.
- Tests: `fakeBrowser` from `warm.test.mjs` extended with a `capture` eval result (fixture:
  one real page-tree output, reduced); resume; failure; stop.

Acceptance: on a real cache copy, `.captures/` holds one file per verified page; a second
run captures nothing; `chrome.mjs status` mid-run shows progress.

### Task B2 — fingerprints and invariance (pure)

- `lib/chrome.mjs`: `fingerprint(node)` from tag, role, selector shape (ids, class tokens
  minus `active|current|selected|open|is-*|has-*`), child structure to depth 3; text,
  href tails and bounds excluded. `candidates(captures)` → per fingerprint: pages, support,
  median bounds, `fixed`, selectors seen.
- Position stability: bounds `y` (or fixed) consistent across pages within a tolerance;
  a fingerprint that recurs but wanders is not chrome (a card component).
- Tests on synthetic captures: same header on 9 of 10 pages → support 0.9; active class
  ignored; a repeated card in the body excluded by wandering position; hidden nodes absent.

Acceptance: `node --test` green; on the real captures a dry-run prints the top candidates
by support and the two expected header fingerprints (main, locale) appear at the top.

### Task B3 — regions, variants, rejected, without

- `regions(candidates, pages)`: place by geometry — top band (`y` < 15 % of page height, or
  fixed at top) → header; bottom band (bottom edge within 15 % of the page bottom) → footer;
  else `unplaced`. Members that co-occur on the same page set form a variant; variants with
  Jaccard page overlap ≥ 0.9 and fingerprints differing only in tokens merge.
- Rejected with reasons: support below threshold (default 0.5), skip links (`a[href^="#"]`
  first in body), consent selectors known to page-prep (read its rule set when present),
  breadcrumb (`nav[aria-label*=bread]`, `.breadcrumb`), single-page members.
- `without.header|footer`: verified pages carrying no member of any variant.
- Variant label: the inventory group with the highest share among its pages.
- Tests: two locales → two header variants with group labels; a blog footer differing by
  one column → separate variant; landing pages without header listed; breadcrumb rejected.

Acceptance: on the real captures `chrome.json` shows the locale split as two header
variants, and the pages without chrome are the campaign or landing group, if any.

### Task B4 — screenshots

- Per variant, on its representative through the proxy: inject an outline style on every
  member selector, `screenshot --full-page` → `screenshots/<role>-<id>.png`; per member,
  `screenshot <selector>` → `screenshots/<role>-<id>-<n>.png`. Paths recorded in the JSON.
- A member whose selector no longer resolves on the representative is a defect, not a
  skip: recorded as `screenshotError` and fails the check.
- Tests: fake browser records the screenshot calls and the outline eval; error path.

Acceptance: real cache copy → every variant has its full screenshot and one per member;
opening two of them shows the header outlined and the crop is the header.

### Task B5 — outputs, check, step, report, dashboard

- `chrome.json` per the spec; `chrome.md`: variants per role (support, pages count, group,
  members with selectors, screenshot links), unplaced, rejected, pages without chrome, the
  hover-only limit.
- `steps.mjs`: step `chrome` after `cache`, `writes: chrome/chrome.json, chrome/chrome.md`,
  tier medium. `checks.mjs checkChrome`: JSON present and parses; every member selector
  resolves in its representative's capture (`nodeMap` lookup — the check re-reads the
  capture); ≥ 1 header and ≥ 1 footer variant with support ≥ threshold, or `none` with a
  reason; every variant has all screenshots; `## chrome` section in `REPORT.md`; cache
  server reachable while the job is open.
- `report` depends on `chrome`; `## chrome` gets the same section command.
- Dashboard: chrome panel — per role, variants with support bar, member list, screenshots
  inline (served by `aem up` from `migration/`), without/unplaced/rejected collapsed.
- `project-structure.md` gains `chrome/`; `migration/.gitignore` gets `chrome/.captures/`.

Acceptance: `status.mjs check chrome` on the real copy → pass with reasons empty; removing
one screenshot → fail naming it; editing a selector → fail naming the member.

### Task B6 — the brief

- `steps/chrome.md` ≤ 60 lines: opens with the local-cache reference; run `chrome.mjs`;
  it is background — one `status` look, then back to the operator; when done, open one full
  screenshot per variant, confirm or note; `section chrome`; what not to do (read captures,
  browse the origin, name variants). Defines chrome in one sentence for the reader.
- `SKILL.md`: step table, command table (`chrome.mjs`, `cache …`), the
  one-sentence definition, the "future static elements" door left open in one clause.

Acceptance: gates green; brief within 60 lines; residue clean.

### Task B7 — replay and fresh run

- Replay on the three real caches: variant counts, without lists, unplaced, and a look at
  every full screenshot. Findings → this plan (Part C), fixes → tasks.
- Fresh-session run on a new clone with the usual minimal prompt plus "then detect the
  chrome". Watch: the agent uses `status.mjs cache …` and never the origin, leaves
  the job alone, looks at screenshots not captures, writes the section, dashboard panel.

## Decisions carried from the spec

Rendered DOM only; page-tree bundle for capture with the stated fallback trigger; regions as
member sets; variants first-class and never ranked semantically; detection over all cached
pages; naming `chrome` throughout, with the term defined once and left open to other static
elements later.

## Not in this plan

Nav or footer extraction; mobile viewport; hover-only panels; a forward-proxy mode for
page-cache (an issue there if A4 says so); a second capture script (only if B2 says so).
