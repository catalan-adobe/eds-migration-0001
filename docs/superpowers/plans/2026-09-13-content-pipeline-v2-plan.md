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
