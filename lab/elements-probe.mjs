// Lab probe for the elements step: the spec's rules applied literally to a project's
// visual-tree store, printed for inspection. Usage: node lab/elements-probe.mjs <repo> [--pages]
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fingerprint, stableId, structuralChildren, tokens } from
  '/Users/catalan/repos/adobe-skills/.worktrees/eds-content-pipeline/plugins/web/skills/content-pipeline-v2/scripts/lib/chrome.mjs';

const repo = process.argv[2];
const dir = path.join(repo, 'migration/chrome/.captures');
const caps = readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
const chrome = JSON.parse(readFileSync(path.join(repo, 'migration/chrome/chrome.json'), 'utf8'));
const inv = JSON.parse(readFileSync(path.join(repo, 'migration/urls/urls.json'), 'utf8'));
const groupOf = new Map(inv.map((r) => [r.url, r.group]));
const chromeSelectors = new Set([...chrome.header, ...chrome.footer]
  .flatMap((v) => v.members.flatMap((m) => m.selectors)));

const isChrome = (n) => chromeSelectors.has(n.selector)
  || (n.collapsed ?? []).some((c) => chromeSelectors.has(c.selector));
const hasChromeBelow = (n) => (n.children ?? []).some((c) => isChrome(c) || hasChromeBelow(c));

/** The spec's content region: peel chrome-containing wrappers and dominant containers. */
function sections(capture, containerShare = 0.6) {
  const pageH = capture.tree.bounds.height;
  let nodes = [capture.tree];
  for (let guard = 0; guard < 12; guard += 1) {
    const out = [];
    let peeled = false;
    for (const n of nodes) {
      if (isChrome(n)) continue;
      if (hasChromeBelow(n)) { out.push(...(n.children ?? [])); peeled = true; continue; }
      out.push(n);
    }
    nodes = out.filter((n) => !isChrome(n));
    if (!peeled && nodes.length === 1 && (nodes[0].children ?? []).length
      && !isLeafComponent(nodes[0])) {
      nodes = nodes[0].children; peeled = true;
    }
    // A container: one node covering most of the page. Its children are the sections,
    // whatever else sits next to it (escaped or promoted nodes).
    const big = nodes.find((n) => n.bounds.height >= pageH * containerShare
      && (n.children ?? []).length > 1 && !isLeafComponent(n));
    if (!peeled && big) {
      nodes = nodes.flatMap((n) => (n === big ? n.children : [n])); peeled = true;
    }
    if (!peeled) break;
  }
  const onPage = (n) => n.bounds.x + n.bounds.width > 0 && n.bounds.x < capture.tree.bounds.width;
  const kept = nodes.filter((n) => n.bounds.height > 6 && n.bounds.width > 0 && onPage(n));
  // A node promoted out of a section by page-tree is a part of that section, not a section:
  // its selector starts with the section's.
  const selectorsOf = (n) => [n.selector, ...(n.collapsed ?? []).map((c) => c.selector)];
  return kept.filter((n) => !kept.some((o) => o !== n
    && selectorsOf(o).some((sel) => sel && n.selector.startsWith(`${sel} >`))));
}

// Element identity: the component itself (outermost element of a collapsed chain: tag,
// stable id, class tokens). Its child pattern — the SET of child fingerprints, so repetition
// never splits a type — names the variant.
const WIDTH_TOKEN = /-\d{1,2}$/; // col-sm-4, aem-GridColumn--default--12: a width, not an identity
const own = (n) => {
  const h = n.collapsed?.[0] ?? n;
  return `${h.tag}#${stableId(h.id)}.${tokens(h.className).filter((t) => !WIDTH_TOKEN.test(t)).join('.')}`;
};
const typeKey = (n) => own(n);
const variantKey = (n) => [...new Set(structuralChildren(n).map(own))].sort().join(',');
const TEXT_LEVEL = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'IMG', 'A', 'SPAN',
  'FIGURE', 'BLOCKQUOTE', 'TABLE', 'PICTURE']);
const isLeafComponent = (n) => {
  const kids = n.children ?? [];
  return kids.length > 0 && kids.every((k) => TEXT_LEVEL.has(k.tag));
};
const types = new Map();
const pages = [];
for (const c of caps) {
  const secs = sections(c);
  const contentH = secs.reduce((a, n) => a + n.bounds.height, 0);
  const page = { url: c.url, pageH: c.tree.bounds.height, sections: [], contentH };
  for (const s of secs) {
    const fp = typeKey(s);
    const t = types.get(fp) ?? { fp, pages: new Set(), instances: 0, heights: [], sample: null,
      selectors: new Set(), groups: {}, variants: new Map() };
    const vk = variantKey(s); t.variants.set(vk, (t.variants.get(vk) ?? 0) + 1);
    t.pages.add(c.url); t.instances += 1; t.heights.push(s.bounds.height);
    t.selectors.add(s.selector);
    t.sample ??= { url: c.url, selector: s.selector, text: (s.text ?? '').slice(0, 40),
      cls: (s.className ?? '').slice(0, 60), kids: structuralChildren(s).length };
    const g = groupOf.get(c.url) || '/'; t.groups[g] = (t.groups[g] ?? 0) + 1;
    types.set(fp, t);
    page.sections.push({ fp, h: s.bounds.height });
  }
  pages.push(page);
}
const total = caps.length;
const list = [...types.values()].sort((a, b) => b.pages.size - a.pages.size);
const recurring = list.filter((t) => t.pages.size >= 2);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log(`pages ${total} · sections ${pages.reduce((a, p) => a + p.sections.length, 0)} · types ${list.length} · recurring (≥2 pages) ${recurring.length}`);
const perPage = pages.map((p) => p.sections.length).sort((a, b) => a - b);
console.log(`sections per page: min ${perPage[0]} median ${median(perPage)} max ${perPage.at(-1)}`);
console.log('\ntop types (pages · instances · median h · variants · identity · text):');
for (const t of list.slice(0, 30)) {
  const vars = [...t.variants.values()].sort((a, b) => b - a);
  console.log(`${String(t.pages.size).padStart(4)}p ${String(t.instances).padStart(4)}i h${String(median(t.heights)).padStart(5)} v${String(vars.length).padStart(3)} ${t.fp.replace(/^DIV#\./, '').slice(0, 52).padEnd(52)} "${t.sample.text.slice(0, 28)}"`);
}
const recurringFps = new Set(recurring.map((t) => t.fp));
const coverage = pages.map((p) => {
  const covered = p.sections.filter((s) => recurringFps.has(s.fp)).reduce((a, s) => a + s.h, 0);
  return p.contentH ? covered / p.contentH : 0;
});
const buckets = [0, 0, 0, 0];
for (const c of coverage) buckets[c >= 0.999 ? 0 : c >= 0.8 ? 1 : c > 0 ? 2 : 3] += 1;
console.log(`\ncoverage by recurring types: full ${buckets[0]} · ≥80% ${buckets[1]} · partial ${buckets[2]} · none ${buckets[3]}`);
console.log(`unique sections: ${list.filter((t) => t.pages.size === 1).length} types on ${new Set(list.filter((t) => t.pages.size === 1).flatMap((t) => [...t.pages])).size} pages`);
if (process.argv.includes('--pages')) {
  for (const p of pages.slice(0, 8)) console.log(p.url.replace(/^https?:\/\/[^/]+/, ''), '→', p.sections.map((s) => `${[...types.get(s.fp).pages].length}p/h${s.h}`).join(' '));
}
