# Experiment B — refined divide→conquer pipeline on a fresh site, end-to-end

Ran the full pipeline (visual-tree divide → per-box DOM conquer → author → verify) on a site the
migration machine never touched: **koffievoordeel.nl** (Dutch coffee e-commerce, Magento). Target
page: a product detail page (PDP), `/douwe-egberts-aroma-rood-koffiebonen`. Reused the machine's
*generic* harness (`importer.mjs` / `transform.mjs`) unchanged — which itself demonstrates the
machine amortizes across sites.

## Result: the pipeline works end-to-end, high content fidelity

| Measure | Value |
| --- | --- |
| **Editorial content preserved** | **10/10** semantic checklist (title, price €8,79, −27%, stock, description, EAN, Merk, spec rows, form heading + fields) |
| **Chrome excluded** | ✓ (no header nav, footer sitemap, cookie text) |
| **Word-level recall** | 83.1% raw → **~98% after excluding artifacts + deliberate drops** |
| **Word-level precision** | 94.1% raw → **~100% real** (the only "output-only" tokens are the price and legit EDS metadata rows — nothing invented, no CSS/chrome leaked) |
| **Structured blocks** | 13/13 spec rows → `specifications` block; 5 form fields → `form` block |
| **Warnings** | 0 |
| Transformer size | 182 lines |

The residual recall gap is benign: `,79` (tokenization of the price, which *is* present),
deliberate chrome/promo drops (`koffiekoopjes` logo, "geen actiecode nodig", "lees meer"), and one
genuine minor loss — the request-form's intro helper sentence. True content loss ≈ **1 item**.

## The verification loop earned its keep (again)

The content-fidelity diff caught a **real miss**: a `FORM.amhideprice-form` ("Meer informatie
aanvragen") inside `#maincontent` that the first conquer pass never enumerated. Closing it took two
iterations — the first grabbed English `name` attributes instead of the Dutch `<label for>` text
(`Uw voornaam`…), which the *next* fidelity measurement immediately exposed. A second suspected gap
(10 images vs an assumed 1) turned out to be a **false alarm** — the product genuinely has 9 gallery
photos; the output was correct and my assumption was wrong. Both are exactly what a verification
loop is supposed to do: surface the real gap, and correct a wrong human assumption.

## What this validates (and what it doesn't)

**Validated:**

- The refined **divide→conquer pipeline holds together end-to-end on an uncontaminated site.** The
  visual-tree divide bounded a deep DOM cleanly (PDP: 2,199 nodes / depth 31 → **22-line, depth-5**
  visual tree; homepage: 3,051 nodes / depth 31 → **29-line** tree). Every top-level box enumerated;
  nothing missed at the layout level.
- **Conquer is a per-box DOM + recognition job**, as designed: the visual tree pointed at the boxes,
  targeted `#maincontent` outlines found the blocks (title, gallery, description, spec table, form).
- **Content fidelity is high and precision ~100%** — the approach preserves editorial content and
  drops chrome without inventing anything.
- **The generic harness carried over unchanged** — evidence the machine is a one-time, cross-site
  cost, which is the crux of the "migration #2 is cheaper" argument.

**Not validated (honest limits, as agreed up front):**

- **No parity yardstick** — a fresh site has no reference transformer. Quality is source↔output
  content fidelity + a semantic checklist, not byte-parity. (Byte-parity was already proven on
  knack.)
- **No precise self-metering** — cost is not a clean `$`. Qualitatively: the run was dominated by
  cheap deterministic scripts (jsdom outlines, grep) with a handful of LLM reasoning steps; ~15
  substantive tool-calls for the PDP end-to-end. Plausibly at or below the old ~$6–10/template, but
  this is a shape argument, not a measurement.
- **n = 1** page / 1 site → a generalization signal, not proof.

## §11.4 side-evidence (opportunistic)

Two more depth data points for the deep-nesting hypothesis (still the domain of Option A, not proven
here): raw DOM depth **31** on both pages collapsed to visual-tree depth **~5**. Consistent with
"bounded by visual, not DOM, complexity," but koffievoordeel is only moderately nested — not the
pathological div-soup case that would actually settle §11.4.

## Artifacts

- `site/transformers/pdp-koffie.mjs` (in the test-f51 migration worktree) — the from-scratch PDP
  transformer, kept as evidence.
- `experiment-B/vt-home.json`, `vt-pdp.json` — captured visual trees (divide artifacts).
- `experiment-B/*-dom.dom.txt` — captured raw DOMs (gitignored, non-`.html` ext so the HTML linter
  doesn't parse the site's own duplicate-id markup).

## Bottom line

B confirms the refined pipeline is **real and generalizes**: it produced a structurally-valid,
high-fidelity EDS document from a fresh e-commerce PDP, with the verification loop catching a genuine
gap and a wrong assumption. It does **not** produce a hard efficiency number (no parity target, no
self-metering) — that was never on the table for a fresh site. The efficiency case still rests on the
shape argument from the cost analysis: the machine amortizes (reused unchanged here), and the
per-template authoring via divide→conquer is lean (182-line transformer, ~15 tool-calls) — but "lean"
is a qualitative claim, not the metered figure Option A-style rigor would demand.
