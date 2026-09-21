# content-pipeline-v2 — what the `-13` run teaches, and what to bring in

Source: session `01a0c06f` (project `eds-mig-20260914-13`, synopsys.com, skill at
`cpv2-elements-iter3`). The operator ran the whole analysis as a workflow: one orchestrator
script, one agent per step at its tier. Two runs: the first crashed in the orchestrator's
own script after the `prep` agent timed out at 600 s ($0.79); the second completed
(6 agents, 19 min, $2.16). Outcome on disk: all ten `check <step>` pass; 50 pages cached
(48 + 2 redirects, 178 assets, no blocking); chrome 1 header / 1 footer; elements 48 pages,
48 types, 25 recurring, 48/48 covered, three iterations, no warnings.

## What the retrospective saw

1. Orchestrator script crashed on a `null` agent result (`prepResult.substring`) — while
   the `prep` artefacts were on disk and `check prep` passed. The agent timed out; the step
   did not. The assistant then guessed the crash point wrong; `status.mjs --text` knew.
2. Tier routing: `tier: 'low'` ran on `claude-opus-4-6`; the setup section claims Flash.
3. `prep` timeout 600 s too tight for page-prep thorough mode; `prep-verify` took 80 s.
4. `REPORT.md` sections missing for `prep` (timeout) and `capture` (agent returned without
   writing it); the `report` agent rebuilt both from `prep/prep.md` and `captures.md`.
5. `elements` the most expensive agent: 3.42 M tokens, $1.15 (three runs, crops, re-reading
   `evaluation.md`).
6. `durationMs` = 0 for every agent in the run events.
7. One empty page, labelled "engine gap" in the report.

## What the retrospective could not see

- **The loop stopped two layers early.** After three iterations the report says "0 new
  types, 0 unresolved defects" — and `DIV#.aem-GridColumn.column` (39 of 48 pages, 141
  instances) and `SECTION#.component-column.row` (50 instances) are still types. On the
  `-11` store the same two were the first containers declared, and behind them sat
  `background-component` (36 style-class identities) and three more wrappers. The agent
  used the runs table's delta as the finish line; the brief names it as the progress signal
  and gives no finish line. Its per-iteration calls (`anchor`, `synopsysContainer`,
  `aem-Grid`) were reasoned from crops and are defensible.
- The "empty page" wording in `evaluation.md` says "not a rules matter"; the agent still
  wrote "engine gap". It is a cache/render matter (gated or script-built content) and the
  flag should say so in those words.
- `anchor` as a container: the agent saw an anchor's captured span "wrap whatever unrelated
  content sits below it" — `-11` shows the same type (33 pages, 97 instances, 476 px
  median). That is page-tree assigning children to a zero-height jump target, a capture
  matter worth a look before it becomes a rule on every AEM site.

## Bring in (the skill)

### A. Briefs — the words that were missing

- **A1. `steps/elements.md`: a finish line.** "Done when every recurring type's crops show
  one thing an author placed. A type whose crops show several unrelated things stacked —
  a column, a row, a grid, a background band — is a container, whatever its class says;
  peel until none is left. On AEM sites expect three to six containers. The runs table
  says how far a change reached, not whether you are done." Two sentences on the onion:
  each wrapper peeled shows the next.
- **A2. Duration lines.** One line per step brief (`Takes: …`) from measured runs: probe
  ~1–2 min; prep 2–8 min (thorough); scan ~1 min from sitemaps; prep-verify ~1–2 min;
  cache ~4 min per 50 pages at 1500 ms; capture ~2 min per 100 pages; chrome < 1 min;
  elements: inventory seconds, crops ~1 min per 100 pages, three iterations normal. An
  orchestrator sets its timeouts from these; an agent knows when to worry.
- **A3. `steps/elements.md`: what to read.** "Read `## Flags` and the crops of the types
  you act on; the type sections are reference." Cuts the re-reading that made elements
  the most expensive agent.
- **A4. `evaluation.md` empty-page flag**: "a cache or rendering matter (gated or
  script-built content); name the pages in the report" — no room for "engine gap".
- **A5. `SKILL.md`**: "seven steps" → ten, with the step table; and one line for
  orchestrators next to the existing workflow sentence: "An agent that times out or fails
  leaves its artefacts; run `status.mjs --text` before redoing a step — the check, not the
  agent's last words, says whether it is done."

### B. Mechanisms — where words did not hold

- **B1. Missing report section is a visible state.** A step `done` with no `## <step>`
  section in `REPORT.md` shows `done (no report section)` in `status --text`, the
  dashboard and `status.json` (the existing `note` mechanism, as store-behind-cache). The
  `report` brief already fills a missing section from `<step>/<step>.md`; now it sees
  which. No new writer, no atomic-section machinery.
- **B2. Setup records where the siblings came from.** `setup.json` gains the repo/ref
  each sibling was installed from (upskill's metadata if it leaves any, else the values
  `setup` passed); `check setup` fails when a sibling's source differs from
  `project.json`'s `skills`. Four of five siblings differ between `adobe/skills` main and
  the fork; today nothing says so.

### C. Look at, decide later

- **C1. `anchor` in page-tree.** On the `-11` store: does a zero-height anchor absorb the
  following siblings as children (promotion/collapse rule)? If so, fix in page-tree, not
  by a rule on every site.
- **C2. Reference orchestration.** Two runs have now been driven by an operator-written
  workflow script (E1 acceptance, `-13`), each with its own bugs. A `references/` example
  is harness-specific and against the skill's portability; not before a third run asks.

## Not ours — report upstream

- Workflow runtime: `tier` → model resolution not what the script asked; `durationMs` 0
  for every agent; no resolved-model surface at script-write time.
- The orchestrator's own script: null-guard every `agent()` result; ≥ 900 s for
  browser-heavy steps (cache's 1200 s was right).

## Declined

- Budget hints in tokens ("expect ~3 M tokens"): model- and harness-dependent, stale on
  arrival. A2's durations and A3's reading rule address the cost where it arises.
- Atomic REPORT sections / a runner that writes prose for the agent: the artefact is the
  outcome; B1 makes the missing prose visible, the `report` step fills it.

## Order

A1, A4, A5 (words, one commit) → B1 (one commit, tests) → A2, A3 (one commit) → B2
(one commit, tests) → tag `cpv2-retro-13` → C1 on the `-11` store → rerun the `-13`
project's elements loop from its current `rules.json` with the new brief, fresh agent,
and read whether it finds `column`.

## Commit ledger

| sha (tag) | item | what |
| --- | --- | --- |
| `cb8c77d` | A1 A3 A4 A5 | elements finish line, reading rule; empty-page words; ten steps |
| `695b7fe` | B1 | done step without its section: note `no report section`; report brief reads it |
| `2cde89a` | A2 | `takes` column in the step table, measured; twice for a timeout |
| `15fed33` (`cpv2-retro-13`) | B2 | `skills.<name>.source`; `check setup` on mismatch |
