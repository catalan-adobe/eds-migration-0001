import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checks, factsOf } from './checks.mjs';
import { readSessions, verdict } from './monitor.mjs';
import { runId, validate } from './prepare.mjs';
import { leadPrompt } from './prompts.mjs';
import { piArgs } from '../run.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'e2e-test-'));
const put = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
};

test('readSessions: turns, tool calls, errors, cost per model, last activity', () => {
  const dir = tmp();
  const msg = (role, extra, ts) => JSON.stringify({ type: 'message', timestamp: ts,
    message: { role, ...extra } });
  put(path.join(dir, 's.jsonl'), [
    JSON.stringify({ type: 'session', timestamp: '2026-10-11T10:00:00Z' }),
    msg('assistant', { provider: 'p', model: 'opus', usage: { totalTokens: 100,
      cost: { total: 0.5 } }, content: [{ type: 'toolCall', name: 'bash' },
      { type: 'toolCall', name: 'bash' }, { type: 'text' }] }, '2026-10-11T10:01:00Z'),
    msg('toolResult', { isError: true }, '2026-10-11T10:02:00Z'),
    msg('assistant', { provider: 'p', model: 'haiku', usage: { totalTokens: 10,
      cost: { total: 0.01 } }, content: [] }, '2026-10-11T10:03:00Z'),
    '{"type":"message","timest', // a line being written
  ].join('\n'));
  const s = readSessions(dir);
  assert.deepEqual([s.turns, s.toolCalls, s.toolErrors, s.tokens, s.lastAt],
    [2, { bash: 2 }, 1, 110, '2026-10-11T10:03:00Z']);
  assert.deepEqual(s.cost, { 'p/opus': 0.5, 'p/haiku': 0.01 });
  assert.deepEqual(readSessions(path.join(dir, 'none')).turns, 0, 'no transcript yet');
});

test('verdict: budget, time, a stall; a worker making progress is no stall', () => {
  const budget = { usd: 10, hours: 2, stallMinutes: 20 };
  const snap = (minutes, extra = {}) => ({ minutes, cost: 1, lastAt: 'a',
    steps: { cache: 'running' }, progress: {}, runs: 3, runDone: 'r:5', ...extra });
  assert.match(verdict(snap(5, { cost: 11 }), [], budget), /^budget/);
  assert.match(verdict(snap(121), [], budget), /^time/);
  const still = [0, 5, 10, 15, 20].map((m) => snap(m));
  assert.match(verdict(snap(20), still, budget), /^stall: nothing new for 20 min/);
  assert.equal(verdict(snap(19), still.slice(0, 4), budget), null, 'not yet 20 minutes');
  const working = [0, 5, 10, 15, 20].map((m) => snap(m, { runDone: `r:${m}` }));
  assert.equal(verdict(working.at(-1), working, budget), null, 'the cache worker advances');
});

test('checks: steps, sample, chrome, misread, unresolved, budget — from the files', () => {
  const project = tmp();
  const m = path.join(project, 'migration');
  put(path.join(m, 'state.json'), { steps: ['discover', 'access', 'cache', 'chrome', 'triage']
    .map((id) => ({ id, state: 'done' })) });
  const ids = Array.from({ length: 10 }, (_, i) => `pag-00000000000${i}`);
  put(path.join(m, 'pages', 'pages.json'), { pages: ids.map((id, i) => ({ id,
    verdict: { reasons: i < 4 ? [{ code: 'misread', kind: 'flag' }] : [] } })) });
  put(path.join(m, 'website', 'fragments.json'), { fragments: [{ id: 'frg-h', part: 'header' },
    { id: 'frg-f', part: 'footer' }] });
  for (const [i, id] of ids.entries()) {
    put(path.join(m, 'pages', id, 'visual-tree.json'), {});
    put(path.join(m, 'pages', id, 'composition.json'), { fragments: [{ ref: 'frg-h' },
      ...(i < 7 ? [{ ref: 'frg-f' }] : [])] });
    put(path.join(m, 'pages', id, 'structure.candidates-system1.json'), { bands: [
      { kind: 'section', children: [{ kind: 'section', unresolved: true }] }] });
  }
  put(path.join(m, 'pages', 'selections', 'judge-10.json'), { pages: ids });
  put(path.join(m, 'views', 'structure-judge-10.html'), '<html></html>');
  const f = factsOf(project);
  assert.deepEqual([f.read, f.withHeader, f.withFooter, f.misread, f.structured],
    [10, 10, 7, 4, 10]);
  const r = checks(f, { cost: 3, budget: { usd: 25 } });
  assert.deepEqual(Object.fromEntries(r.checks.map((c) => [c.id, c.pass])), { steps: true,
    sample: true, header: true, footer: false, misread: false, unresolved: true, budget: true });
  assert.equal(r.pass, false);
});

test('a run: validated config, its id, the isolated pi command line, the lead prompt', () => {
  assert.throws(() => validate({ domain: 'https://x.test/' }), /missing models, skills/);
  const env = path.join(tmp(), 'env');
  put(env, 'S1_URL=x');
  const config = validate({ domain: 'https://www.jsw.in/', skills: { repo: '.', ref: 'HEAD' },
    operator: 'Cache 50.', budget: { usd: 25, hours: 4 }, s1Env: env,
    models: { lead: 'adobe-llm/claude-opus-5-5', medium: 'adobe-llm/claude-sonnet-5-5',
      low: 'adobe-llm/claude-haiku-5-5' } });
  assert.equal(config.pages, 50);
  const at = new Date('2026-10-11T09:30:00Z');
  assert.equal(runId(config, at), 'jsw-in-opus-sonnet-haiku-20261011T0930');
  const one = { ...config, models: { lead: 'a/claude-haiku-5-5', medium: 'a/claude-haiku-5-5',
    low: 'a/claude-haiku-5-5' } };
  assert.equal(runId(one, at), 'jsw-in-haiku-20261011T0930');
  const args = piArgs({ model: 'm', thinking: 'medium', project: tmp(), sessionsDir: 's',
    prompt: 'go', skills: ['/a', '/b'] });
  for (const flag of ['--no-context-files', '--no-skills', '--no-extensions', '-p']) {
    assert.ok(args.includes(flag), flag);
  }
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '--skill'), ['/a', '/b']);
  assert.equal(args.at(-1), 'go');
  const prompt = leadPrompt(config);
  for (const s of ['init --pages 50', '"Cache 50."', '--env-file=', 'background: false',
    'adobe-llm/claude-haiku-5-5', 'structure judge-10']) assert.ok(prompt.includes(s), s);
});
