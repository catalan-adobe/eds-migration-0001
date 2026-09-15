# content-pipeline-v2 — `chrome` step: header and footer detection

Date: 2026-09-15. Status: agreed shape, before planning.

## Purpose

Produce a precise, evidenced list of the DOM regions that make up the site's chrome — the
header(s) and footer(s) — so that downstream agents can strip them from page content and
build the dedicated EDS documents from them. **Detection only.** What the header means (brand,
sections, tools) and how it becomes a nav document is another expert's work.

"Chrome" is the industry term (as in browser chrome): the parts of a page that stay the same
from page to page and frame the content. The skill defines it once, in `SKILL.md`.

## Position in the pipeline

After `cache`, before `report`. Inputs: `cache/` (the stored bodies, served by the page-cache
proxy in offline mode) and `urls/urls.json` (which pages are cached, their groups). The step
never touches the live site: every page is rendered by the browser against the offline proxy,
which also replays the scripts and fragment calls a client-side header needs, because the
`cache` step drove a real browser through the same proxy.

## Principle: rendered DOM only

One source of truth, one detector. Parsing stored bodies without a browser was considered and
dropped: its only advantage was cost, and a local cache can be hit as hard as needed. The
rendered DOM gives what the detection actually rests on: geometry (position on the page,
`position: fixed`), computed visibility, and client-side injected chrome.

## Detection

1. **Capture.** For every cached page (not only representatives — it is local), open it
   through the offline proxy and run the page-tree bundle (`plugins/web/skills/page-tree`):
   per element `tag, selector, bounds, role, text, children`, fixed and overlay elements
   promoted to the root, invisible nodes pruned. A few named playwright sessions in parallel
   are fine; there is no bot to be polite to. Store one capture per page under
   `chrome/.captures/` (gitignored).
2. **Fingerprint.** Every element at any depth gets a structural fingerprint: tag, selector
   shape, role, child structure. Text, `active`/`current`-style classes and the last segment
   of hrefs are ignored so that the current menu item, breadcrumb or locale flag does not
   split variants.
3. **Invariance.** An element is a chrome candidate when its fingerprint recurs across pages
   with a stable position. Support = share of captured pages carrying it.
4. **Regions are sets, not subtrees.** Chrome does not always have a single parent: a top bar,
   the main nav and a mega-menu appended at the end of `<body>` can be three elements. A
   region is a list of members. Members are placed by geometry: top band or fixed → header,
   bottom band → footer. An invariant element that fits neither band is reported as
   `unplaced` with its evidence, never forced into a role.
5. **Variants.** Members that recur together over the same pages form a variant. Variants are
   first-class: there is no "the" header. Each has `pages`, `support`, a representative page,
   screenshots, and the inventory group it correlates with (a label, not the criterion).
   Near-duplicate variants merge under a similarity threshold. Pages carrying no header or no
   footer are listed too — a landing-page template is real migration information.
6. **Rejected candidates** are kept with a reason: skip links, consent banners (page-prep
   knows them), breadcrumbs (per-page), sticky CTAs, elements below the support threshold.

Known limit, stated in the output: a mega-menu that only exists after hover is not in a plain
capture. The trigger is detected; the panel is not.

## Screenshots

Per role, per variant, taken through the offline proxy on the representative page:

- one full-page screenshot with every member outlined;
- one crop per member (its bounding box).

Stored under `chrome/screenshots/`, referenced from `chrome.json`, shown in the dashboard and
in the report section. A variant without screenshots fails the check.

## Outputs

```
migration/chrome/
  chrome.json          the deliverable (below)
  chrome.md            operator view: variants, members, support, screenshots, unplaced,
                       rejected, pages without chrome, the hover limit
  screenshots/         <role>-<variant>.png, <role>-<variant>-<member>.png
  .captures/           one page-tree capture per page (gitignored)
```

`chrome.json` (shape, not final field names):

```json
{
  "capturedPages": 102,
  "header": [{ "id": "h1", "members": [{ "selector": "header.global", "bounds": {},
      "fixed": true, "role": "banner", "tag": "header" }],
    "pages": ["…"], "support": 0.94, "representative": "…", "group": "/",
    "screenshots": { "full": "screenshots/header-h1.png", "members": ["…"] } }],
  "footer": [ … ],
  "unplaced": [ … ],
  "rejected": [{ "selector": "a.skip-link", "reason": "skip link" }],
  "without": { "header": ["…"], "footer": [] },
  "limits": ["hover-only menus are not captured"]
}
```

## Check (`status.mjs check chrome`)

- `chrome.json` present and every listed selector resolves on its representative's capture
  (the check re-reads the capture — mechanism, not hint);
- at least one header variant and one footer variant with support ≥ threshold, or an explicit
  `none` with a stated reason;
- every variant has its full screenshot and one per member;
- `## chrome` section in `REPORT.md`.

## The agent's part

Runs the script, looks at one screenshot per variant, confirms or notes what is wrong, writes
the report section. It never reads the captures or the corpus.

## Dashboard

A chrome panel: variants per role with their support, member list, screenshots inline,
pages without chrome, unplaced and rejected collapsed.

## Decisions

- Rendered DOM only; no offline HTML parser, no new dependency.
- Reuse the page-tree bundle for capture. Its gap: no class or id tokens beyond what the
  selector carries. If fingerprints prove too coarse on a real site (variants that should
  merge, or distinct elements that collide), replace the capture with a small script of our
  own — not before.
- Step, directory and files are all named `chrome`; the brief is titled "Chrome — header and
  footer".
- Variants are never named or ranked semantically; support and group labels are the only
  ordering.
- Detection over all cached pages, not representatives: local, cheap, and support numbers
  then mean something.

## Out of scope

Extraction of nav or footer content; mapping to EDS nav/footer documents; mobile or narrow
viewport variants; hover-only panels; pages not in the cache.
