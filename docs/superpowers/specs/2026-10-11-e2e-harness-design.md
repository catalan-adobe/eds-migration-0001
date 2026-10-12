# E2E harness for the migration-pipeline skill — design

Date: 2026-10-11. Status: agreed with the user, to build.

## Why

The pipeline was exercised step by step by an agent that knew it — commands run from memory,
judgement steps done by hand, fixes landed mid-run. That tests the code, not the skill. An
E2E run gives a fresh agent nothing but the skill and a domain, and records what happens:
whether the briefs, the state and the done-checks carry it to the end, at what cost, on
which models. The harness repeats that on any domain and any model mix, so the minimum
model (or combination) that completes a run can be measured.

## What it is, and where

A test harness outside the skill: it watches an agent use the skill, it is not a step of the
pipeline. Code in this repository, `tools/e2e/`; runs under
`~/repos/ai/migration-tests/e2e-runs/<run-id>/` (the project clone, plus `e2e/` beside
`migration/`). One command: `node tools/e2e/run.mjs <config.json>`.

## A run

1. **Project**: `git clone https://github.com/catalan-adobe/eds-mig-20260914.git` into the
   run directory.
2. **Install**: the skills at a pinned commit of the skills repository, copied (not linked)
   into `.agents/skills/` — a fix made during a run cannot change it. Everything else
   (`init`, `setup --install`) is the agent's, as the skill's quick start says.
3. **Start**: `pi -p` in the project with the lead model, isolated — no global context files
   (the project's own `AGENTS.md` appended), only the project's skills, only the workflow
   extension. One prompt: the domain, the page cap, the operator policy, the model tiers,
   the System 1 env file's path, where to stop.
4. **Monitor**: a loop beside the agent, every minute: `pipeline state --text`, the runs, the
   session transcript (tool calls, tokens, cost per model, workflow runs included). It
   records a timeline and stops the agent on budget, wall clock, or a stall (no progress in
   the transcript or the state for N minutes).
5. **Retrospective**: when the agent ends — done, stopped, or failed — code computes
   `result.json` (the checks below), then a strong model writes `retro.md` from the
   transcript, the monitor log, the project's notes and data: a timeline per step with time
   and cost, every departure from a brief, every brief that was missing or wrong, failures
   and what the agent did, the artefact checks, what to change in the skill.

## Config

```json
{
  "domain": "https://www.jsw.in/",
  "scope": null,
  "pages": 50, "audit": 5,
  "models": { "lead": "adobe-llm/claude-opus-5-5",
              "medium": "adobe-llm/claude-sonnet-5-5", "low": "adobe-llm/claude-haiku-5-5" },
  "thinking": "medium",
  "skills": { "repo": "<path to the skills repo>", "ref": "<commit>" },
  "operator": "<the policy, given to the agent as the operator's words>",
  "budget": { "usd": 25, "hours": 4, "stallMinutes": 20 },
  "s1Env": "<path to the System 1 env file; never read>",
  "baseline": "<optional: a project already run on this domain, to compare with>"
}
```

`models.lead` runs the session; the step tiers the skill declares (`low`, `medium`) map to
models the lead delegates to through the workflow tool (`agent(…, { model })`). One model for
all three is a single-model run.

## Decisions (agreed)

- **Operator gates**: answered by a policy in the config, given to the agent as the
  operator's words — default: "Cache 50 pages with 5 audits from excluded groups. Decide
  single pages and chrome as you see fit, and say why in a note." Never by the harness
  itself, never by a person during a benchmark run.
- **Success**, all of:
  1. every step up to `triage` reaches `done` in `state --text`; a `judge-10` selection
     exists; `structure` has run on it and its review is rendered;
  2. no person intervened (true by construction) and the run stayed under budget;
  3. artefact checks: header and footer placed on ≥ 80 % of the pages read; pages misread
     ≤ 30 %; every `judge-10` page has a structure with no more than 2 unresolved nodes;
  4. with a baseline: the same checks side by side (the bench-level3 projects are baselines
     for their seven domains — not ground truth).
- **Order of runs**: one domain on Opus to validate the harness; then Sonnet; then Haiku;
  then combinations (Opus lead, Haiku `low`) where a single model failed.
- **The model of a run, unless the user names one: Sonnet 5.5 at least** (user, 2026-10-12).
  Haiku passed four sites, but its retrospectives found it judging less well (missed origins,
  notes unbacked); a run that feeds the review set or a baseline is a Sonnet run or better.
- **Headless specifics given in the prompt** (the briefs assume a person between turns):
  workflows with `background: false` (a background workflow would end a `-p` session);
  waiting for a detached worker by `sleep 60` between `state --text` checks.

## Out of scope

The `elements` and `blocks` steps (not built). Parallel runs (one at a time first). A UI:
the run directory is the record.
