// Level 1 of the stored structures against the Haiku hybrid reference: kind per candidate
// (layout counted as section: Haiku had no layout kind), merge per candidate, pages whose
// first-level bands are the same.
import fs from 'node:fs';
import { SITES, structures } from './tree-stats-lib.mjs';
const H = process.env.HOME;
const LAB = { wknd: `${H}/repos/ai/migration-tests/_lab/haiku-wknd` };
const labOf = (s) => LAB[s] ?? `${H}/repos/ai/migration-tests/_lab/hybrid/${s}`;
let k = 0; let kn = 0; let n = 0; let m = 0; let mn = 0; let same = 0; let pages = 0;
const misses = {};
for (const site of Object.keys(SITES)) {
  for (const s of structures(site)) {
    const hf = `${labOf(site)}/${s.page}/haiku-g2.json`;
    const cf = `${labOf(site)}/${s.page}/candidates.json`;
    if (!fs.existsSync(hf) || !fs.existsSync(cf)) continue;
    const ref = JSON.parse(fs.readFileSync(hf)).answers?.bands;
    const rc = JSON.parse(fs.readFileSync(cf)).candidates;
    if (!ref) continue;
    pages += 1;
    const ours = s.candidates.filter((c) => c.depth === 1);
    if (ours.length !== rc.length) { console.log('cuts differ', site, s.page, ours.length, rc.length); continue; }
    let pageSame = true;
    ours.forEach((c, i) => {
      const r = ref[i];
      // Haiku had no layout kind: parts side by side were a section with a side layout or a
      // block with columns. Ours is a layout exactly when Haiku saw parts side by side.
      const refKind = r.layout && r.layout !== 'single' ? 'layout' : r.kind;
      n += 1;
      if (c.kind === r.kind || c.empty) kn += 1;
      if (c.kind === refKind || c.empty) k += 1; else { pageSame = false; const key = `${refKind}→${c.kind}`; misses[key] = (misses[key] ?? 0) + 1; }
      if (i > 0) { mn += 1; const merged = c.merge >= 0.75; if (merged === r.mergeWithPrevious) m += 1; else pageSame = false; }
    });
    if (pageSame) same += 1;
  }
}
const pc = (a, b) => `${a}/${b} (${Math.round((100 * a) / b)} %)`;
console.log(`kind (side by side = layout) ${pc(k, n)} · kind as Haiku named it ${pc(kn, n)} · merge ${pc(m, mn)} · pages all-agree ${pc(same, pages)}`);
console.log('misses (haiku→ours):', JSON.stringify(misses));
