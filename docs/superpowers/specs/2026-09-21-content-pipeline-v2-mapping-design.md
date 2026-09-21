# content-pipeline-v2 — the `mapping` step

The elements inventory says which element types recur on a site and where. It stops one
word short of a **block inventory**: it never says which types are blocks, which are
default content, and what a block is called. That judgement — "the mapping expert's work"
in the elements brief — is this step. It is generic: nothing in it knows AEM, Bootstrap or
any site; it reads types, crops and the four EDS words.

## The four words, and who owns each

| EDS word | decided by | where |
| --- | --- | --- |
| section | the `containers` rule (decomposed through) | `elements/rules.json` |
| fragment | the `fragments` rule (decomposed like a document) | `elements/rules.json` |
| default content | **mapping** | `mapping/mapping.json` |
| block | **mapping**, with a name | `mapping/mapping.json` |

So a type's `kind` is one of three: `block`, `default-content`, `skip`. A type that turns
out to be a section (its crops show unrelated things stacked) is not mapped: it goes back
to `containers` and the elements step reruns — mapping never patches what decomposition
got wrong. Fragment contents (the types inside a declared fragment) are not mapped either:
they are documents; the fragments table already says what they reuse. Header and footer
are the chrome step's and never block names.

## The file: decisions only

`migration/mapping/mapping.json`, keyed by the stable type id:

```json
{
  "types": {
    "t-9a3e0ade": { "kind": "block", "block": "hero", "notes": "image + text; CTA optional" },
    "t-5d115b62": { "kind": "default-content" },
    "t-6895f77c": { "kind": "skip", "notes": "table rows the tree split; two pages" },
    "t-279885ac": { "kind": null }
  }
}
```

- The first run **seeds** every recurring type with `kind: null`; the check fails while a
  null remains. A type that stops recurring or disappears after a rules change stays in
  the file and is reported as **orphaned** (its decision is kept, in case it comes back).
- `block`: kebab-case, `^[a-z][a-z0-9-]*$`, never `header`, `footer`, `section`,
  `fragment`; several types may name the same block (two identities, one block); a type's
  variants are that block's options unless the crops say otherwise — then the type is two
  blocks and needs a `merge`-like split the vocabulary does not have: an engine gap, named.
- `notes`: free text, for the transformer author later.
- Nothing else. No option names, no per-variant mapping, no confidence — the three-times
  rule applies.

## The derived report: the block inventory

`mapping.mjs` reads `elements.json` + `mapping.json` and writes `mapping/mapping.md` (and
`mapping/inventory.json`, the same numbers for the dashboard):

- **Blocks**: per block name — the types behind it, instances, pages (and % of captured
  pages), variants, median height, sample (url + selector), crop paths.
- **Default content**: types, instances, pages.
- **Skipped**: types with their notes.
- **Coverage**: pages whose every section is mapped (block or default content) — the page
  count a migration can budget on; pages with an unmapped or skipped section, named.
- **Undecided**: recurring types still `null`; **orphaned** entries; block names that are
  invalid.

The numbers are the estimate's inputs: blocks to build, instances per block, pages
covered. The names are migrate-block's `blockName`.

## The brief

Tier medium: an agent reads `evaluation.md`'s crops and decides; the operator edits the
JSON or tells the agent. The test is the typing test: *could an author make this in a
document?* — a heading, paragraphs, a list, one image, a link: default content; anything
with a layout, repetition or behaviour: a block. Page-frame elements (breadcrumb, title)
are default content unless the site styles them as a component. `skip` is for noise the
`reject` rule should not eat (one-page oddities, tree artefacts) — with a note. The finish
line: no null, every block named, coverage read.

## The dashboard: shows, does not edit

The dashboard is static files served by `aem up`; it has no server to write a decision.
Type cards show the kind as a chip and the block name; a **Blocks** panel lists the block
inventory (name, types, instances, pages, variants, crop). Editing happens in
`mapping.json` — by the agent or an editor. In-browser editing is a server, and a later
feature if the loop asks for it.

## Check

`check mapping`: `mapping.json` parses and validates; no recurring type undecided; block
names valid; `mapping.md` and `inventory.json` newer than `mapping.json` and
`elements.json` (else "rerun `mapping.mjs`"); orphaned entries are a warning in the
report, not a failure. Fails while the elements step's own check fails (a mapping over an
inventory behind its store is a mapping of the wrong thing).

## Not in this step

Options per variant; a mapping per page; migrate-block prompts (the `blocks` step);
styles and brand (`styles`); any AEM-specific default (a site's `text` is default content
because its crops say so, not because it is called text).
