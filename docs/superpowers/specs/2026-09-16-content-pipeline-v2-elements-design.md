# content-pipeline-v2 — `elements` step: the EDS elements inventory

Date: 2026-09-16. Status: agreed shape, before planning.

## Purpose

Produce an evidenced inventory of the **elements** the cached pages are made of — the
recurring section types between header and footer — with, for every page, how much of it
those types cover. Transformers attach to elements, not to page templates: a page is
imported by walking its sections and handing each to the transformer of its type, default
content being the honest fallback. An accurate elements inventory is therefore the thing
that makes any page importable; a "page templates" inventory is at most a view over it
(recurring sequences of types) and is not a deliverable of this step.

Detection only. What an element *means* (which EDS block it should become, how its content
maps) is the next expert's work; this step hands over the precise, screenshot-backed list.

## Position in the pipeline

After `chrome`. Inputs: the visual-tree store (`chrome/.captures/`, one page-tree capture
per verified cached page), `chrome/chrome.json` (which nodes are chrome), `urls/urls.json`
(groups). The browser is needed only for screenshots, through the offline cache server.
Nothing is rendered again for detection; nothing touches the origin.

## Definitions, stated once

- **Content region**: a page's tree minus its chrome members. Wrappers that contain chrome
  descendants are peeled; a lone node, or a node covering most of the page height (≥ 60 %)
  with several children, is a container and is peeled too — unless its children are
  text-level elements (`p`, headings, lists, images…): that is a leaf component, and the
  peel stops there.
- **Section**: a child of the content region, minus **parts**: a node whose selector starts
  with another section's selector on the same page was promoted out of that section by the
  capture (a hero image, a carousel track) and belongs to it. Sections map onto EDS
  sections.
- **Element type**: sections that share an **identity** — the outermost element of the
  capture's collapsed chain: tag, stable id, class tokens minus state, generated names and
  width tokens (`col-sm-4`, `…--default--12`). Children do not enter the identity:
  repetition (three cards or four) never splits a type. Text, bounds and hrefs never count.
- **Instance**: one section of a given type on one page. A type has pages (how many pages
  carry it) and instances (how many times in total).
- **Variant**: within a type, the **set** of its children's identities (cards with and
  without an image, a hero with and without a call to action). A set, so the count of a
  repeated child is not a variant either.
- **Coverage** of a page: the share of its content-region height made of sections whose
  type has support ≥ the threshold. What is left is listed, per page, as unique sections.

## Capture resolution

The store's default capture folds elements narrower than 900 px into their parent — right
for chrome, too coarse here: every AEM column looked identical. The elements step needs
the store captured at **300 px** (`chrome.mjs --min-width 300`); on 806 real pages that
left chrome detection intact (header 803, footer 801). When the capture becomes its own
step, 300 px is its default and chrome reads the same store.

## Detection

1. Read every capture; remove chrome members (by selector or by any selector of their
   `collapsed` chain); find the content region and its sections as defined above.
2. Fingerprint each section; group into element types; per type record `pages`,
   `instances`, `support` (pages / captured pages), median bounds, every selector seen,
   sample (page, selector, text excerpt), the inventory groups its pages come from.
3. Variants: within a type, fingerprints at depth + 1 that recur on ≥ 2 pages.
4. **Structural classification**, from structure signals only, as a first cut the expert
   can overrule: `block-candidate` when the type recurs with a repeated child pattern, a
   grid layout, a background, or a media + text composition; `default-content` when it is
   flowing text, headings, images or lists without such a pattern; `unique` when it is on
   one page only. The signal that decided is recorded with the classification.
5. Coverage per page; pages fully covered, partially covered (with what is missing), not
   covered.
6. Rejected: sections that are chrome after all (a member missed by the chrome step —
   reported back), hairlines, zero-area nodes, consent overlays.

Recurring sequences of types (would-be templates) appear in the `.md` as a courtesy view,
with no merging, no thresholds and no claim: page signature counts, nothing more.

## Sample, not site

Everything here is derived from the **cached sample** (typically ~100 of thousands of
URLs). The outputs say so: support is over captured pages; the inventory groups tell
which groups are represented and which have no cached page at all. Extrapolating to the
site is a claim the operator makes, with the numbers in front of them, not the step.

## Screenshots

For every element type with support ≥ the threshold, and for every variant: one crop of a
representative instance (through the offline server, hide rules applied), plus one
full-page screenshot per fully-covered representative page with its sections outlined and
labelled by type id. Types under the line get a crop only when the operator asks
(`--all`), to keep the long tail from costing minutes.

## Outputs

```
migration/elements/
  elements.json        the deliverable (below)
  elements.md          operator view: types by support with classification, variants,
                       screenshots; coverage per page; unique sections; sequences view;
                       groups without a page; rejected; limits
  screenshots/         type-<id>.png, type-<id>-v<n>.png, page-<n>.png
```

`elements.json` (shape, not final field names):

```json
{
  "capturedPages": 97, "threshold": 0.05,
  "types": [{ "id": "t1", "fingerprint": "…", "classification": "block-candidate",
    "signal": "repeated child pattern (3× same structure) + grid 3x1",
    "pages": 41, "instances": 58, "support": 0.42, "bounds": { "height": 554 },
    "selectors": ["…"], "sample": { "url": "…", "selector": "…", "text": "…" },
    "groups": { "products": 20, "solutions": 12 },
    "variants": [{ "id": "t1-v1", "pages": 30, "sample": {} }],
    "screenshots": { "crop": "screenshots/type-t1.png", "variants": ["…"] } }],
  "pages": [{ "url": "…", "sections": [{ "type": "t1", "bounds": {} }],
    "coverage": 0.93, "unique": [{ "selector": "…", "height": 120 }] }],
  "sequences": [{ "types": ["t3", "t1", "t7"], "pages": 12 }],
  "groupsWithoutPages": ["…"],
  "rejected": [{ "selector": "…", "reason": "chrome member missed by the chrome step" }],
  "limits": ["…"]
}
```

## Check (`status.mjs check elements`)

- `elements.json` present, parses, `capturedPages` equals the number of captures;
- every captured page appears once under `pages`, its sections' types all exist;
- every type above the threshold and every variant has its crop; every representative page
  screenshot exists; no screenshot defect;
- every type's sample selector resolves in its sample page's capture (re-read — a
  mechanism, not a hint);
- `## elements` section in `REPORT.md`; the run's phase while it is open.

## The agent's part

Runs the script, looks at the crop of every type above the line and one outlined page
screenshot, confirms or notes (a type that is two things, two types that are one, a
classification that is wrong), writes the report section. Never reads the captures, never
names types, never edits `elements.json`.

## Dashboard

An elements panel: types by support with classification, crop, variant count, page count;
coverage distribution (fully / partially / not covered); unique sections and groups
without a page collapsed.

## Decisions

- Elements, not templates: the inventory is what makes pages importable; sequences are a
  view. This also retires the "template" word and its collision with other efforts.
- Same engine as chrome (fingerprint at position → fingerprint anywhere); same playbook:
  no LLM in the detector, screenshots as evidence, agent confirms by looking, every rule
  replayed on the three held caches before it lands.
- Structural classification is a first cut with its deciding signal recorded, never a
  verdict; the expert who maps content overrules it.
- Threshold for "recurring" defaults to 2 pages (support ≥ ~2 % on a 100-page sample);
  reported, adjustable, never silent.
- Reads the visual-tree store; when this step lands, the capture becomes its own step
  (`capture` → `chrome`, `elements`) — the mechanical split announced in the store's
  contract.

## What the first exploration measured (2026-09-16, 806 cached pages of one site)

Rules applied literally to the visual-tree store, in the lab (`lab/elements-probe.mjs`):

| rule set | types | recurring | fully covered | unique types / pages |
|---|---|---|---|---|
| spec as first written, 900 px, depth-3 fingerprint | 283 | 52 | 154 / 334 | 231 / 178 |
| + containers peeled, off-page nodes rejected | 231 | 92 | 248 / 334 | 139 / 84 |
| 300 px capture, depth-3 fingerprint | 1,449 | 429 | 255 / 806 | 1,020 / 546 |
| identity = outermost element, variants = child set | 105 | 61 | 785 / 806 | 44 / 16 |
| + parts attached, leaves kept, widths out | **91** | **51** | **788 / 806** | **40 / 13** |

The final list reads as the site's component catalog (column, text, banner, breadcrumb,
experience fragment, table of contents, page title, image, carousel, blog banner, floating
tabs, box links, form, rich text, spotlight, anchor, faq, card container…), median 9
sections per page. Each row above was a design change forced by the data, not a tuning.

## Out of scope

Naming or mapping element types to EDS blocks; transformers; content extraction; nested
sections (a section's inner blocks are the mapping expert's concern); hover-only and
narrow-viewport variants; pages not in the cache; any export in another effort's
vocabulary.
