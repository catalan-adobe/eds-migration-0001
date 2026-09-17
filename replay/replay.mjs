#!/usr/bin/env node
// Replays capture, chrome and the elements engine over the caches we hold and diffs a summary
// against replay/expected/<name>.json. Lab tooling: the caches and site names never enter the
// skill repository. Usage: node replay/replay.mjs [--update] [name...]
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const x = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(here, 'caches.json'), 'utf8'));
const update = process.argv.includes('--update');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const selected = names.length ? names : Object.keys(config.caches);
const runner = path.join(config.skills, 'content-pipeline-v2', 'scripts');
const SIBLINGS = ['browser-probe', 'page-cache', 'page-prep', 'site-scan', 'page-tree'];

async function prepare(name) {
  const dir = path.join('/tmp', 'replay', name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, '.agents', 'skills'), { recursive: true });
  await cp(config.caches[name], path.join(dir, 'migration'), { recursive: true });
  for (const sub of ['chrome', 'capture', '.work/chrome', '.work/capture']) {
    await rm(path.join(dir, 'migration', sub), { recursive: true, force: true });
  }
  await rm(path.join(dir, 'migration', '.work', 'cache-server.json'), { force: true });
  for (const s of SIBLINGS) {
    await symlink(path.join(config.skills, s), path.join(dir, '.agents', 'skills', s));
  }
  const { stdout } = await x('node', [path.join(runner, 'status.mjs'), 'setup'], { cwd: dir });
  const setup = JSON.parse(stdout);
  if (setup.reasons.length) throw new Error(`${name}: setup — ${setup.reasons.join('; ')}`);
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

/** What we compare: counts and shapes, no URLs (the expectation file stays site-free). */
function summarise(chrome, run, check) {
  const variants = (list) => list.map((v) => ({
    pages: v.pages.length, members: v.members.length, optional: v.optional.length,
    group: v.group,
  }));
  return {
    captured: chrome.capturedPages,
    failed: run.failed.length,
    header: variants(chrome.header),
    footer: variants(chrome.footer),
    without: { header: chrome.without.header.length, footer: chrome.without.footer.length },
    unplaced: chrome.unplaced.length,
    rejected: chrome.rejected.length,
    shortestUrlInHeader1: chrome.header[0]?.pages.includes(
      [...chrome.header.flatMap((v) => v.pages), ...chrome.without.header]
        .sort((a, b) => a.length - b.length)[0],
    ) ?? false,
    checkPass: check.pass,
  };
}

async function replay(name) {
  const dir = await prepare(name);
  const t0 = Date.now();
  const run = await runStep(dir, 'capture.mjs', ['--force']);
  if (run.state !== 'done') throw new Error(`${name}: capture ${run.state} — ${run.error}`);
  await runStep(dir, 'chrome.mjs');
  const chrome = JSON.parse(await readFile(path.join(dir, 'migration/chrome/chrome.json'), 'utf8'));
  const check = JSON.parse((await x('node', [path.join(runner, 'status.mjs'), 'check', 'chrome'],
    { cwd: dir }).catch((e) => ({ stdout: e.stdout }))).stdout);
  await x('node', [path.join(runner, 'status.mjs'), 'cache', 'stop'], { cwd: dir }).catch(() => {});
  const flags = update ? ['--update'] : [];
  const el = await x('node', [path.join(here, 'elements.mjs'), name, dir, ...flags])
    .catch((e) => ({ stdout: e.stdout }));
  console.log(el.stdout.trim());
  return { summary: summarise(chrome, run, check), seconds: Math.round((Date.now() - t0) / 1000) };
}

const diff = (a, b, prefix = '') => Object.keys({ ...a, ...b }).flatMap((k) => {
  const [va, vb] = [a?.[k], b?.[k]];
  if (typeof va === 'object' && va && typeof vb === 'object' && vb) {
    return diff(va, vb, `${prefix}${k}.`);
  }
  if (JSON.stringify(va) === JSON.stringify(vb)) return [];
  return [`${prefix}${k}: ${JSON.stringify(va)} → ${JSON.stringify(vb)}`];
});

const results = await Promise.all(selected.map(async (name) => [name, await replay(name)]));
let failed = false;
for (const [name, { summary, seconds }] of results) {
  const file = path.join(here, 'expected', `${name}.json`);
  const expected = await readFile(file, 'utf8').then(JSON.parse, () => null);
  if (update || !expected) {
    await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`${name}: ${expected ? 'updated' : 'recorded'} (${seconds}s)`);
    continue;
  }
  const changes = diff(expected, summary);
  if (changes.length) {
    failed = true;
    console.log(`${name}: CHANGED (${seconds}s)\n  ${changes.join('\n  ')}`);
  } else {
    console.log(`${name}: unchanged (${seconds}s)`);
  }
}
process.exit(failed ? 1 : 0);
