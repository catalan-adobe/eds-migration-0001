# EDS Migration Rulebook

A curated set of authoring conventions that tell the analysis pipeline how to map a
rendered source page onto EDS document structure (sections, default-content, blocks).

The rulebook exists because the correct EDS interpretation of a rendered page is **not
derivable from the DOM alone** — it requires EDS authoring philosophy ("content first,
decoration via CSS"). Rules encode that philosophy so the LLM steps produce correct,
consistent output across any website.

## Three scopes

A rule's `scope` says *what kind of truth it encodes* — which determines where it lives, how
far it travels, and how hard it is to promote.

| Scope | File | Encodes | Lifecycle |
| ------- | ------ | --------- | ----------- |
| `generic` | `generic.yaml` | Universal EDS authoring conventions — true on **any** site, under **any** capture method | Stable; only grows via cross-project promotion |
| `project` | `<project>.yaml` | Conventions specific to the **site** under analysis | Starts ~empty; grows during this migration |
| `pipeline` | `pipeline-rules.yaml` | Artifacts of **our capture/analysis method**, not the site or EDS (e.g. a zone under-rendered because we captured at `minWidth=900`) | Tied to the tooling; changes if the capture changes |

Every LLM-backed pipeline step loads **all three** files and merges them. Precedence on
conflict: `project` > `pipeline` > `generic` (the more specific context wins).

Why `pipeline` is separate: a rule like "a near-empty background zone is really an
under-rendered list — flag for Phase 2" is not an EDS convention and not a site quirk. It
exists **only** because of how we captured the tree. Filing it under `generic` would falsely
imply it holds for anyone doing EDS migration; it doesn't — it holds for anyone using *this
pipeline*.

## Convention vs team-decision

Orthogonal to scope, every rule declares a `decision_type`:

| `decision_type` | Meaning |
|-----------------|---------|
| `convention` | A near-objective mapping the domain already agrees on (raw CSS text is noise; a repeating grid is one block). |
| `team-decision` | A modeling **choice** among several valid EDS options (model an FAQ as an accordion block *vs.* plain headings; put a sidebar in its own block *vs.* inline). Not a law — a standard the migration team **picks and applies consistently**. |

`team-decision` rules **require explicit human sign-off** before `status: confirmed`, and the
report must present the alternatives that were *not* chosen so the reviewer is choosing, not
rubber-stamping. The LLM must not present a `team-decision` as a `convention`.

## How rules are consumed

Rules are injected into LLM prompts as guidance — they are **not** executed by a
deterministic engine. That means:

- The `trigger` and `decision` fields are natural language, written for an LLM reader.
- A `trigger` typically mixes universal intent with **site- or capture-specific detection
  signals** (e.g. references to `[presentation]`, `[2x1]`, class names). That coupling is one
  reason a rule discovered on one site is rarely `generic` on day one — its *detection* is
  local even when its *mapping* might be universal.
- Structured metadata (`id`, `scope`, `status`, `priority`, `category`, `decision_type`)
  exists for humans and the pipeline to **select, filter, order, and version** rules — not to
  match them.
- Only `status: confirmed` rules are loaded into production runs. `status: proposed` rules
  are surfaced in reports for human review but not yet applied.

## How rules are discovered

Site-specific rules are not written by hand up front. They emerge:

1. A pipeline step meets a pattern that no confirmed rule covers.
2. It emits the pattern to the step report as a `proposed` rule with its evidence.
3. A human reviewer accepts / edits / rejects it (via the step's `feedback.json`).
4. Accepted rules are written into `<project>.yaml` with `status: confirmed` and provenance.

The long-tail singleton clusters from Step 2 are a primary source of proposed project
rules — pages are singletons precisely because they do something unique to the site.

## Promotion policy (how a rule earns a wider scope)

Scope is **earned**, never self-declared. The hard constraint:

> A pipeline step (LLM) may only propose rules at `scope: project` or `scope: pipeline`.
> **It may never emit `scope: generic`.** A single page on a single site cannot justify a
> universal claim.

Promotion is a separate, deliberate act with evidence thresholds:

| Transition | Requires |
|------------|----------|
| `proposed` → `confirmed` (project/pipeline) | Human accept via feedback; `team-decision` rules also require the alternatives be shown and one chosen. |
| `project`/`pipeline` → `generic` | **Cross-project evidence**: the same mapping confirmed on **≥2 distinct sites**, plus human sign-off. This is a cross-migration judgment, not a per-run one. |

The promotion step enforces this mechanically — a scan-proposed `generic` rule is rejected
and downgraded, and a `generic` promotion without recorded multi-site provenance is blocked.

## Precedence

When two rules could apply to the same pattern, resolve in this order:

1. Scope — `project` > `pipeline` > `generic`.
2. Priority — higher `priority` wins within the same scope.
3. Specificity — a more specific `trigger` wins (LLM judgment, guided by the report).

Conflicts that can't be auto-resolved are surfaced in the step report, never silently
guessed.
