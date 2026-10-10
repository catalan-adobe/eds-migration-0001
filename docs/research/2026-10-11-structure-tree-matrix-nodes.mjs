import fs from 'node:fs';
import { SITES, structures } from './tree-stats-lib.mjs';
const H = process.env.HOME;
const labOf = (s) => (s === 'wknd' ? `${H}/repos/ai/migration-tests/_lab/haiku-wknd` : `${H}/repos/ai/migration-tests/_lab/hybrid/${s}`);
const M = {}; const deeper = {};
const walk = (ns) => ns.flatMap((n) => [n, ...walk(n.children ?? [])]);
for (const site of Object.keys(SITES)) for (const s of structures(site)) {
  const hf = `${labOf(site)}/${s.page}/haiku-g2.json`; if (!fs.existsSync(hf)) continue;
  const ref = JSON.parse(fs.readFileSync(hf)).answers?.bands; const ours = s.candidates.filter((c) => c.depth === 1);
  if (!ref || ref.length !== ours.length) continue;
  const nodes = walk(s.bands);
  ours.forEach((c, i) => {
    if (c.empty) return;
    const r = ref[i]; const rk = `${r.kind}/${r.layout === 'single' ? '·' : r.layout}`;
    M[rk] ??= {}; const band0 = s.bands.find((b) => b.members.includes(c.id)); const kk = band0.members.length === 1 ? band0.kind : c.kind; M[rk][kk] = (M[rk][kk] ?? 0) + 1;
    if (r.layout !== 'single' && c.kind === 'section') {
      // is there a layout somewhere under the band holding this candidate?
      const band = s.bands.find((b) => b.members.includes(c.id));
      const has = walk(band.children ?? []).some((n) => n.kind === 'layout');
      deeper[has ? 'layout below' : 'no layout below'] = (deeper[has ? 'layout below' : 'no layout below'] ?? 0) + 1;
    }
  });
}
for (const [rk, row] of Object.entries(M).sort()) console.log(rk.padEnd(30), JSON.stringify(row));
console.log('haiku side-by-side, ours section:', JSON.stringify(deeper));
