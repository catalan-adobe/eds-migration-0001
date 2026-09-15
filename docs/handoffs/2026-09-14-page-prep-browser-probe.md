# Hand-off: page-prep and browser-probe findings

From two runs of `content-pipeline-v2` (a 483-URL section site and a 6,684-URL root site, both
with OneTrust consent). Evidence: session `01a09f30-f00d-75d1-94c5-fa5e4f0e12d4` and
`~/repos/ai/migration-tests/cpv2-acceptance/migration/prep/`.

## page-prep

### P1 — every CMP in the database has `hide: []` and `dismiss: []` (defect, high)

`~/.cache/page-prep/patterns.json`: 44 CMPs, **0** with hide rules, **0** with dismiss actions.
Cause in `scripts/overlay-db.js` `normalizeCmpRules()`:

```js
const method = rule.methods?.[0];
hide: extractHideSelectors(method?.HIDE_CMP),
dismiss: extractDismissActions(method?.DO_CONSENT, method?.SAVE_CONSENT),
```

Consent-O-Matic's `Rules.json` has `methods` as an **array of `{ name, action }`** (e.g.
`{ name: 'HIDE_CMP', action: {...} }`, `{ name: 'DO_CONSENT', ... }`,
`{ name: 'SAVE_CONSENT', ... }`), not an object keyed by method name. `methods[0].HIDE_CMP`
is always `undefined`, so a `cmp-match` carries no actionable recipe and the agent hand-writes
`#onetrust-accept-btn-handler` every time. Fix: `const byName = Object.fromEntries(
rule.methods.map((m) => [m.name, m.action]))`, then `byName.HIDE_CMP`, `byName.DO_CONSENT`,
`byName.SAVE_CONSENT`. Add a test asserting `onetrust.dismiss.length > 0` after normalising the
live rules (or a fixture copy of them).

### P2 — `playwright-cli eval` takes an expression; statements return nothing (docs, medium)

Bare `var x = …; …` returns no output and no error, so a hide loop looked like the recipe
failed on every page (about five turns lost). SKILL.md should state it once and every snippet
should already be wrapped: `(() => { … })()`.

### P3 — in-page `element.click()` does not dismiss OneTrust; native click does (docs, low)

`playwright-cli click "#onetrust-accept-btn-handler"` worked where `eval` + `.click()` left the
banner visible. One line in the dismiss section.

### P4 — the detection `eval` echoes the whole injected bundle (docs, low)

Every call prints the 32 KB script back under `### Ran Playwright code`. Tell agents to keep
the `### Result` block only (`| sed -n '/### Result/,/### Ran/p'`).

### P5 — the click did not set a consent cookie in headless sessions (note)

After a successful accept click `document.cookie` had no `OptanonAlertBoxClosed`; the banner
returns on the next page. Hide rules are the durable path; the recipe manifest should say
which of the two a consumer may rely on.

## browser-probe

### B1 — "Unknown command: network" printed on every probe (noise, low)

`browser-probe.js` calls a `playwright-cli` subcommand that `@playwright/cli@0.1.18` does not
have. Harmless, but it reads as an error to an agent.

### B2 — the update banner of `@playwright/cli` is repeated on every call (environment)

Not the skill's fault; a note in SKILL.md ("ignore the update banner") saves tokens on long
runs.

## Cross-cutting

Both skills' scripts are driven by agents that pay for every echoed byte. Prefer quiet
output with a `--json` result over human banners.

## P6 — browser-probe: `health.hasMainContent` false on sites without a `<main>` landmark

Seen on a large AEM site (2026-09-15 run): the page rendered fully (title, 9,468 characters of
visible text inside `div.root`), yet `probe-report.json` said `"hasMainContent": false`, which
reads as "rendered by scripts / blocked". The heuristic seems to look for a `<main>` (or role)
landmark. Suggest a fallback on visible text density (e.g. body text length above a threshold,
or the largest text-bearing block) before reporting `false`, and a distinct field for "no
landmark" so consumers can tell the two apart.

## B3 — browser-probe: "Unknown command: network"

Still printed by the probe script with @playwright/cli 0.1.18 (a subcommand that version does
not have); harmless, but four update banners plus this line make the output look broken to an
agent reading it.
