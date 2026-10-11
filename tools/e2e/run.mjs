#!/usr/bin/env node
// One end-to-end run of the migration-pipeline skill by a fresh agent: a project cloned
// from the template with the skills pinned, the lead agent started headless and isolated
// (no global context, only the project's skills and the workflow extension), a monitor
// beside it every minute, then the result checks and a retrospective. See
// docs/superpowers/specs/2026-10-11-e2e-harness-design.md.
//
//   node tools/e2e/run.mjs <config.json> [--root <runs dir>] [--interval <seconds>]
import { spawn, execFileSync } from 'node:child_process';
import {
  appendFileSync, createWriteStream, existsSync, readFileSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { result } from './lib/checks.mjs';
import { snapshot, verdict } from './lib/monitor.mjs';
import { prepare, SKILLS, validate } from './lib/prepare.mjs';
import { leadPrompt, retroPrompt } from './lib/prompts.mjs';

const WORKFLOWS = path.join(os.homedir(), '.pi', 'agent', 'npm', 'node_modules',
  '@quintinshaw', 'pi-dynamic-workflows');

/** The pi command line of an isolated session in the project. */
export function piArgs({ model, thinking, project, sessionsDir, prompt, skills }) {
  const agents = path.join(project, 'AGENTS.md');
  return [
    '-p', '--model', model, '--thinking', thinking, '--session-dir', sessionsDir,
    '--no-context-files', ...(existsSync(agents) ? ['--append-system-prompt', agents] : []),
    '--no-skills', ...skills.flatMap((s) => ['--skill', s]),
    '--no-extensions', '-e', path.join(WORKFLOWS, 'extensions', 'workflow.ts'),
    '--no-prompt-templates', prompt,
  ];
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** Runs pi to its end, the monitor beside it; resolves with why it ended. */
function supervise(args, { cwd, log, monitorFile, sessionsDir, startedAt, budget, interval }) {
  return new Promise((resolve) => {
    const out = createWriteStream(log, { flags: 'a' });
    const child = spawn('pi', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    const history = [];
    let stopped = null;
    const tick = () => {
      const snap = snapshot({ project: cwd, sessionsDir, startedAt });
      history.push(snap);
      appendFileSync(monitorFile, `${JSON.stringify(snap)}\n`);
      const why = verdict(snap, history, budget);
      if (why && !stopped) {
        stopped = why;
        appendFileSync(monitorFile, `${JSON.stringify({ at: snap.at, stop: why })}\n`);
        child.kill('SIGTERM');
      }
    };
    const timer = setInterval(tick, interval * 1000);
    child.on('exit', (code, signal) => {
      clearInterval(timer);
      tick();
      resolve({ code, signal, stopped, cost: history.at(-1)?.cost ?? 0 });
    });
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: run.mjs <config.json> [--root <dir>] [--interval <s>]');
  const config = validate(JSON.parse(readFileSync(file, 'utf8')));
  const root = arg('--root', path.join(os.homedir(), 'repos/ai/migration-tests/e2e-runs'));
  const interval = Number(arg('--interval', 60));
  const run = prepare(config, { root });
  const skills = SKILLS.map((s) => path.join(run.skillsDir, s))
    .concat(path.join(WORKFLOWS, 'skills', 'workflow-authoring'));
  const paths = {
    config: path.join(run.e2e, 'config.json'), monitor: path.join(run.e2e, 'monitor.jsonl'),
    sessions: path.join(run.e2e, 'sessions'), result: path.join(run.e2e, 'result.json'),
    retro: path.join(run.e2e, 'retro.md'), project: run.dir,
  };
  console.log(`run ${run.id} in ${run.dir}`);
  const ended = await supervise(piArgs({ model: config.models.lead, thinking: config.thinking,
    project: run.dir, sessionsDir: paths.sessions, prompt: leadPrompt(config), skills }), {
    cwd: run.dir, log: path.join(run.e2e, 'pi.log'), monitorFile: paths.monitor,
    sessionsDir: paths.sessions, startedAt: run.config.startedAt, budget: config.budget,
    interval,
  });
  // The state as the steps stand now; the agent has ended, nothing else writes it.
  const pipeline = path.join(run.skillsDir, 'migration-pipeline', 'scripts', 'pipeline.mjs');
  try {
    writeFileSync(path.join(run.e2e, 'state.txt'),
      execFileSync('node', [pipeline, 'state', '--text'], { cwd: run.dir, encoding: 'utf8' }));
  } catch (err) {
    writeFileSync(path.join(run.e2e, 'state.txt'), `state failed: ${err.message}\n`);
  }
  const res = { id: run.id, ended, ...result(run.dir, { cost: ended.cost, budget: config.budget,
    baseline: config.baseline, stopped: ended.stopped }) };
  writeFileSync(paths.result, `${JSON.stringify(res, null, 2)}\n`);
  console.log(`${res.pass ? 'PASS' : 'FAIL'} $${ended.cost} ${ended.stopped ?? 'ended'}`);
  await supervise(piArgs({ model: config.retroModel, thinking: 'high', project: run.dir,
    sessionsDir: path.join(run.e2e, 'retro-session'), prompt: retroPrompt(config, paths),
    skills: [] }), {
    cwd: run.dir, log: path.join(run.e2e, 'retro.log'),
    monitorFile: path.join(run.e2e, 'retro-monitor.jsonl'),
    sessionsDir: path.join(run.e2e, 'retro-session'), startedAt: new Date().toISOString(),
    budget: { usd: 5, hours: 1, stallMinutes: 15 }, interval,
  });
  console.log(`retrospective: ${paths.retro}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
