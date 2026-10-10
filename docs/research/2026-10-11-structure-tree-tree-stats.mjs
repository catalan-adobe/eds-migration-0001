// Per site: what the recursive structure produced on judge-10 — nodes by kind and depth,
// layouts and why, unresolved and collapsed containers, questions asked, tokens.
import fs from 'node:fs';

const H = process.env.HOME;
export const SITES = {
  wknd: 'bench-level2/wknd', aemlive: 'bench-level2/aemlive', nasa: 'bench-level2/nasa',
  mdn: 'bench-level2/mdn', mit: 'bench-level2/mit', govuk: 'bench-level2/govuk',
  synopsys: 'eds-projects/test-content-pipeline-0001/eds-mig-20260914-14',
};
export const projectOf = (site) => `${H}/repos/ai/migration-tests/${SITES[site]}`;
export function structures(site) {
  const proj = projectOf(site);
  const sel = JSON.parse(fs.readFileSync(`${proj}/migration/pages/selections/judge-10.json`));
  return sel.pages.map((id) => {
    const f = `${proj}/migration/pages/${id}/structure.candidates-system1.json`;
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : null;
  }).filter(Boolean);
}
const walk = (nodes, depth = 1) => nodes.flatMap((n) => [{ n, depth },
  ...walk(n.children ?? [], depth + 1)]);
const letter = (k) => (k === 'default_content' ? 'd' : k[0]);
export const treeOf = (n) => letter(n.kind)
  + (n.children ? `[${n.children.map(treeOf).join(' ')}]` : n.unresolved ? '?' : '');

const total = { pages: 0, asked: 0, tokens: 0 };
for (const site of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SITES)) {
  const all = structures(site);
  const byDepth = {};
  let unresolved = 0; let collapsed = 0; let asked = 0; let runs = 0; let tokens = 0; let max = 0;
  const layoutWhy = {};
  for (const s of all) {
    for (const { n, depth } of walk(s.bands)) {
      byDepth[depth] ??= {};
      byDepth[depth][letter(n.kind)] = (byDepth[depth][letter(n.kind)] ?? 0) + 1;
      if (n.unresolved) unresolved += 1;
      if (n.collapsed) collapsed += 1;
      max = Math.max(max, depth);
    }
    for (const c of s.candidates) {
      if (c.probabilities) asked += 1;
      if (c.rule === 'text run') runs += 1;
      if (c.kind === 'layout') {
        const why = c.rule ?? 'model';
        layoutWhy[why] = (layoutWhy[why] ?? 0) + 1;
      }
    }
    tokens += s.usage.inputTokens;
  }
  total.pages += all.length; total.asked += asked; total.tokens += tokens;
  const depths = Object.entries(byDepth).map(([d, k]) => `${d}:${JSON.stringify(k)}`).join(' ');
  console.log(`${site.padEnd(9)} pages ${all.length} asked ${asked} runs ${runs} `
    + `depth≤${max} unresolved ${unresolved} collapsed ${collapsed} `
    + `layout ${JSON.stringify(layoutWhy)} tokens/page ${Math.round(tokens / all.length)}`);
  console.log(`          ${depths}`);
}
console.log(`total pages ${total.pages} asked ${total.asked} `
  + `tokens/page ${Math.round(total.tokens / total.pages)}`
  + ` ≈ $${((total.tokens / total.pages) * 0.24e-6).toFixed(4)}/page`);
