#!/usr/bin/env node
// Lab: recapture a project's cache at another min-width and read what the inventory and the
// mapping make of it. Copies the project (rules.json and mapping.json kept), never touches the
// source. Usage: node replay/width.mjs <project-root> <width>...
import { cp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const x = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(here, 'caches.json'), 'utf8'));
const runner = path.join(config.skills, 'content-pipeline-v2', 'scripts');
const SIBLINGS = ['browser-probe', 'page-cache', 'page-prep', 'site-scan', 'page-tree'];
const LAB = path.join(os.homedir(), 'repos/ai/migration-tests/_lab/width');
const [source, ...widths] = process.argv.slice(2);
if (!source || !widths.length) throw new Error('usage: width.mjs <project-root> <width>...');

async function prepare(width) {
  const dir = path.join(LAB, `${path.basename(source)}-w${width}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, '.agents', 'skills'), { recursive: true });
  await cp(path.join(source, 'migration'), path.join(dir, 'migration'), {
    recursive: true,
    filter: (src) => ![
      /\/migration\/(capture|chrome|\.work\/(chrome|capture|elements))(\/|$)/,
      /\/migration\/elements\/(elements\.json|elements\.md|evaluation\.md|screenshots)/,
      /\/migration\/mapping\/(inventory\.json|mapping\.md)$/,
    ].some((re) => re.test(src)),
  });
  await rm(path.join(dir, 'migration', '.work', 'cache-server.json'), { force: true });
  for (const s of SIBLINGS) {
    await symlink(path.join(config.skills, s), path.join(dir, '.agents', 'skills', s));
  }
  // setup.json must point at the symlinked siblings, not at the source project's copies.
  const { stdout } = await x('node', [path.join(runner, 'status.mjs'), 'setup'], { cwd: dir });
  const setup = JSON.parse(stdout);
  if (setup.reasons.length) throw new Error(`w${width}: setup — ${setup.reasons.join('; ')}`);
  return dir;
}

const status = async (dir, script) => JSON.parse(
  (await x('node', [path.join(runner, script), 'status'], { cwd: dir })).stdout,
);

async function runStep(dir, script, args = []) {
  await x('node', [path.join(runner, script), ...args], { cwd: dir });
  for (;;) {
    await new Promise((r) => { setTimeout(r, 5000); });
    const run = await status(dir, script);
    if (!['queued', 'running', 'analysing'].includes(run.state)) return run;
  }
}

async function readJson(dir, rel) {
  return JSON.parse(await readFile(path.join(dir, 'migration', rel), 'utf8'));
}

async function one(width) {
  const dir = await prepare(width);
  const t0 = Date.now();
  const cap = await runStep(dir, 'capture.mjs', ['--force', '--min-width', String(width)]);
  if (cap.state !== 'done') throw new Error(`w${width}: capture ${cap.state} — ${cap.error}`);
  await runStep(dir, 'chrome.mjs');
  await runStep(dir, 'elements.mjs');
  await x('node', [path.join(runner, 'mapping.mjs')], { cwd: dir }).catch(() => {});
  const e = await readJson(dir, 'elements/elements.json');
  const inv = await readJson(dir, 'mapping/inventory.json');
  const last = e.runs.at(-1);
  const leafPages = inv.coverage.uncovered.filter((u) => u.leaves.length).length;
  const openPages = inv.coverage.uncovered.filter((u) => u.types.length).length;
  return {
    width,
    minutes: Math.round((Date.now() - t0) / 6000) / 10,
    sections: last.sections,
    types: e.types.length,
    recurring: e.types.filter((t) => t.recurring).length,
    fullyCovered: last.covered.full,
    compositions: e.compositions.length,
    blocks: inv.blocks.length,
    undecided: inv.undecided.length,
    containerLeaves: inv.containerLeaves.map((l) => `${l.identity.split('.').at(-1)}:${l.pages}`)
      .join(' '),
    mappingCovered: `${inv.coverage.covered}/${inv.coverage.pages}`,
    openForLeaves: leafPages,
    openForTypes: openPages,
    warnings: e.warnings.length,
    dir,
  };
}

const rows = [];
for (const w of widths) {
  rows.push(await one(Number(w)));
  console.log(JSON.stringify(rows.at(-1)));
}
console.table(rows.map(({ dir, ...r }) => r));
