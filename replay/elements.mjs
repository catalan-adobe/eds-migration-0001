#!/usr/bin/env node
// Replays the elements engine over a project's visual-tree store and diffs the summary against
// replay/expected/elements-<name>.json. Usage: node replay/elements.mjs <name> <project> [--update]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(here, 'caches.json'), 'utf8'));
const lib = path.join(config.skills, 'content-pipeline-v2', 'scripts', 'lib');
const { inventory, summary } = await import(path.join(lib, 'elements.mjs'));
const [name, project] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const update = process.argv.includes('--update');

const mig = path.join(project, 'migration');
const store = path.join(mig, 'capture');
const captures = await Promise.all((await readdir(store)).filter((f) => f.endsWith('.json'))
  .map((f) => readFile(path.join(store, f), 'utf8').then(JSON.parse)));
const chrome = JSON.parse(await readFile(path.join(mig, 'chrome', 'chrome.json'), 'utf8'));
const urls = JSON.parse(await readFile(path.join(mig, 'urls', 'urls.json'), 'utf8'));
const groups = new Map(urls.map((r) => [r.url, r.group]));
const chromeSelectors = [...chrome.header, ...chrome.footer]
  .flatMap((v) => v.members.flatMap((m) => m.selectors));
const out = inventory(captures, { chromeSelectors, groupOf: (u) => groups.get(u) });
const result = { ...summary(out), compositions: out.compositions.length,
  topVariants: out.types.slice(0, 5).map((t) => t.variants.length) };

const file = path.join(here, 'expected', `elements-${name}.json`);
const expected = await readFile(file, 'utf8').then(JSON.parse, () => null);
if (update || !expected) {
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${name}: ${expected ? 'updated' : 'recorded'} ${JSON.stringify(result)}`);
} else if (JSON.stringify(expected) === JSON.stringify(result)) {
  console.log(`${name}: unchanged`);
} else {
  console.log(`${name}: CHANGED\n  ${JSON.stringify(expected)}\n  ${JSON.stringify(result)}`);
  process.exit(1);
}
