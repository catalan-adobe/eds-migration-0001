// Level-1 cuts from the current code against the cuts stored in each structure file.
import fs from 'node:fs';
import { SITES, projectOf, structures } from './tree-stats-lib.mjs';
const { candidates } = await import(process.env.CODE
  + '/plugins/web/skills/migration-pipeline/scripts/lib/structure.mjs');
let same = 0; let diff = 0;
for (const site of Object.keys(SITES)) {
  for (const s of structures(site)) {
    const tree = JSON.parse(fs.readFileSync(`${projectOf(site)}/migration/pages/${s.page}/visual-tree.json`));
    const now = candidates(tree.tree, s.body).map((c) => c.top).join(',');
    const was = s.candidates.filter((c) => (c.depth ?? 1) === 1).map((c) => c.top).join(',');
    if (now === was) same += 1; else { diff += 1; console.log(site, s.page, '\n was', was, '\n now', now); }
  }
}
console.log({ same, diff });
