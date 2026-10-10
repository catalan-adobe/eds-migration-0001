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
