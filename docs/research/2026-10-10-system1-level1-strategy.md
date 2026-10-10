# Level 1 with a System 1 model: the questioning strategy that reproduces Haiku

2026-10-10. Reference: Haiku 5.5 high on the tree's candidate bands (`_lab/hybrid`,
`_lab/haiku-wknd`), 7 sites × 10 pages = 70 pages, 259 candidates. Model under test: Clef
(`@cf/cloudflare/clef`, Workers AI), $0.24 per M input tokens, output free.

## The strategy (what worked)

Code decides what code can see; the model answers concrete yes/no questions about one
candidate at a time; code composes the answer.

1. **Candidates from the visual tree** (unchanged from the hybrid): sibling boxes under the
   body's first level with ≥ 2 children; side-by-side siblings form one candidate.
2. **Facts, counted by code, written as words** in the state: position, height, background;
   layout from the siblings' widths, else from the leaves' columns (`columnsOf`), else from
   the dump's rails overlapping the band (a narrow part beside a wide one = a side column;
   a layout needs ≥ 300 px of height); pictures (large image covering the band / N alike
   images of one size in a row / N images); text amount (none / short texts / a few lines /
   paragraphs); headings, links, inputs, embeds; the 16 content snippets per band.
3. **Images**: the candidate's crop and a crop of the previous candidate above it, fitted in
   1280×768 (800 px wide costs a quarter less and 2 points of kind).
4. **Questions, all yes/no** (one request per candidate, five questions):
   `is_default`, `is_block`, `is_section` (the three kind definitions as questions; the most
   probable wins), `title_above` (a heading introducing a component below it → section),
   `merge` (do `previous` and `band` form one part for an author; threshold 0.75).
5. **Rules on top**: a side layout → section; equal columns judged default → block
   (columns); one heading and nothing else → default; an image-only band → block when it
   spans ≥ 90 % of the page, else default (an image in flow); an empty band → merged.

## What did not work, in order of trying

- A three-way `choice` question: 68 % kind, 1 block found in 59 (text) — System 1 does
  not compose; it answers what it sees.
- Image only: 64 %. Text only: 68 % (and no layout, no pictures: the state was blind).
- Three features composed by rules (component / prose / side): 71 %.
- Dropping the content snippets (images + facts only): kind holds (87 %), merge drops
  85 → 78 %: the merge question reads the words.
- Dropping the pair image: merge 85 → 80 %.

## Numbers (final configuration, images 1280 + text, pair image)

| | kind vs Haiku | merge vs Haiku | per candidate |
|---|---|---|---|
| all 259 candidates | **90 %** | **85 %** | 1 679 tokens, 0.60 s |
| end to end, 70 pages | same cuts 60 (86 %) | identical bands and kinds **48 (69 %)** | |
| repeatability (two runs) | 98 % | 96 % | — |

Per site (kind / merge): wknd 92/88, aem.live 79/100, NASA 95/96, MDN 67/80, MIT 95/100,
gov.uk 83/85, Synopsys 94/78. Remaining kind misses are mostly articles with images and
several headings that Haiku called `section` and Clef `default_content`, and MDN's
article-with-side-rails whose rails neither the tree nor the dump detect on those pages.
Remaining merge misses are Synopsys's flat pages (figure + caption, heading + address
columns) where Haiku's own answers were inconsistent: both answers are defensible.

## Cost and time, per page (3.7 candidates on average)

| method | tokens/page | $/page | $/100 k pages | time/page (serial) |
|---|---|---|---|---|
| Clef, images 1280 | 6.2 k in | $0.0015 | $150 | 2.2 s |
| Clef, images 800 | 4.6 k in | $0.0011 | $110 | 1.9 s |
| Haiku 5.5 high, hybrid | 1.5 k in + 0.2 k out | $0.0014 | $140 | 5.8 s |
| Sonnet 5.5 low, hybrid (wknd) | 5.1 k in + 0.3 k out | $0.0133 | $1 330 | 3.3 s |

The premise that System 1 is much cheaper than Haiku 5.5 does not hold here: Haiku 5.5's
input is 2.4× cheaper per token than Clef's, and the hybrid gives it little to think about.
Clef's advantage is time (3× per page, parallelises the same) and determinism (98 %); its
cost is the two images per candidate. At 100 k pages the difference is tens of dollars
either way; the structure that made both cheap is the candidates from the tree.

## Files

`run.mjs` (VARIANT, WORDING, IMGW, PAIRIMG, THRESHOLD, SITES), `out/<tag>.json` per run,
`sheet.mjs` → `review-<site>.html` (Haiku and Clef bands side by side, red rows where they
differ). `columnsOf` exported from the pipeline's `band-analysis.mjs` for the facts.
