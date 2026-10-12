// The chrome run's brand phase alone, on a project already through chrome: the offline
// proxy and one browser as the chrome worker sets them up, the overlay rules, the header
// fragment as stored (its representative page: the shortest URL carrying it), then
// brand() from the code worktree — website/brand.json and the logo asset written through
// the data layer, with the detection's inputs, so chrome stays done. Nothing else is rerun.
//
//   node run-brand.mjs <project dir>
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LIB = '/Users/catalan/repos/adobe-skills/.worktrees/eds-content-pipeline/plugins/web/'
  + 'skills/migration-pipeline/scripts/lib';
const { brand } = await import(`${LIB}/brand.mjs`);
const { realIo, METHOD } = await import(`${LIB}/chrome.mjs`);
const { viaProxy, writeBrowserConfig } = await import(`${LIB}/browser.mjs`);
const { pageExpression } = await import(`${LIB}/cache.mjs`);
const { preparedAtTop } = await import(`${LIB}/capture.mjs`);
const { data } = await import(`${LIB}/data.mjs`);

const cwd = path.resolve(process.argv[2] ?? '.');
const M = path.join(cwd, 'migration');
const json = (rel) => JSON.parse(readFileSync(path.join(M, rel), 'utf8'));
const { migration, website } = await data(cwd);
const m = await migration.open(cwd);
const access = await website.readAccess(cwd);
const fragments = json('website/fragments.json');
const stored = fragments.fragments.find((f) => f.part === 'header') ?? null;
const pages = json('pages/pages.json').pages.filter((p) => p.verdict.status !== 'out'
  && existsSync(path.join(M, 'pages', p.id, 'visual-tree.json')));
const carrying = pages.filter((p) => {
  const file = path.join(M, 'pages', p.id, 'composition.json');
  return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).fragments
    .some((f) => f.ref === stored?.id);
}).map((p) => p.url).sort((a, b) => a.length - b.length || a.localeCompare(b));
const header = stored && carrying.length
  ? { ...stored, variant: { representative: carrying[0] } } : null;

const io = await realIo(cwd);
const proxy = await io.startProxy({ offline: true });
const config = await writeBrowserConfig(cwd, 'chrome', access, proxy.port,
  { initScript: io.treeBundle, onlyProxy: true });
const [browser] = io.browsers;
const origin = new URL(m.source.origin).origin;
let opened = false;
const visit = async (page) => {
  const url = viaProxy(page.url, origin, proxy.port);
  if (opened) return browser.goto(url);
  opened = true;
  return browser.open(url, { config, persistent: access.browser.persistent === true });
};
try {
  const out = await brand(cwd, { io: { ...io, browser }, visit,
    prepare: preparedAtTop(pageExpression(access)), header, urls: pages.map((p) => p.url),
    method: { name: METHOD, at: new Date().toISOString(), inputs: fragments.method.inputs } });
  console.log(JSON.stringify({ header: header?.id, representative: header?.variant
    .representative, summary: out.summary, name: out.name, logo: out.logo }, null, 2));
} finally {
  await Promise.all(io.browsers.map((b) => b.close().catch(() => {})));
  await proxy.stop();
}
