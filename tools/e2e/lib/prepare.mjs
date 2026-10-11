// A run's directory: a fresh EDS project cloned from the template, the skills copied in at a
// pinned commit (copied, not linked: a fix made during the run cannot change it), the
// resolved config beside it. Everything else — init, setup — is the agent's to do.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEMPLATE = 'https://github.com/catalan-adobe/eds-mig-20260914.git';
export const SKILLS = ['migration-data', 'migration-pipeline', 'page-tree', 'page-cache',
  'browser-probe', 'page-prep', 'site-scan'];
export const SKILLS_PATH = 'plugins/web/skills';
const REQUIRED = ['domain', 'models', 'skills', 'operator', 'budget', 's1Env'];

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });

/** A config is complete or fails with what is missing. */
export function validate(config) {
  const missing = REQUIRED.filter((k) => config[k] === undefined);
  if (missing.length) throw new Error(`config: missing ${missing.join(', ')}`);
  for (const k of ['lead', 'medium', 'low']) {
    if (!config.models[k]) throw new Error(`config: models.${k} missing (provider/model id)`);
  }
  if (!existsSync(config.s1Env)) throw new Error(`config: s1Env ${config.s1Env} not found`);
  return {
    pages: 50, audit: 5, thinking: 'medium', scope: null, baseline: null,
    retroModel: 'adobe-llm/claude-opus-5-5', ...config,
  };
}

const slug = (url) => new URL(url).hostname.replace(/^www\./, '').replace(/\W+/g, '-');
const short = (model) => model.split('/').pop().replace(/^claude-/, '').replace(/-\d+-\d+$/, '');

/** The run's id: domain, the models (lead, then the tiers when they differ), a timestamp. */
export function runId(config, now = new Date()) {
  const { lead, medium, low } = config.models;
  const mix = [lead, medium, low].map(short);
  const models = new Set(mix).size === 1 ? mix[0] : mix.join('-');
  return `${slug(config.domain)}-${models}-${now.toISOString().slice(0, 16).replace(/[-:]/g, '')}`;
}

/** Clones the template, copies the skills at the pinned ref, writes the resolved config. */
export function prepare(config, { root, now = new Date() }) {
  const id = runId(config, now);
  const dir = path.join(root, id);
  if (existsSync(dir)) throw new Error(`run directory ${dir} exists`);
  run('git', ['clone', '-q', config.template ?? TEMPLATE, dir]);
  const sha = run('git', ['-C', config.skills.repo, 'rev-parse', config.skills.ref]).trim();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'e2e-skills-'));
  const archive = run('git', ['-C', config.skills.repo, 'archive', sha, SKILLS_PATH],
    { encoding: 'buffer', maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', tmp], { input: archive });
  const skillsDir = path.join(dir, '.agents', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  for (const name of SKILLS) {
    cpSync(path.join(tmp, SKILLS_PATH, name), path.join(skillsDir, name), { recursive: true });
  }
  const e2e = path.join(dir, 'e2e');
  mkdirSync(path.join(e2e, 'sessions'), { recursive: true });
  const resolved = { ...config, id, skills: { ...config.skills, sha },
    startedAt: now.toISOString() };
  writeFileSync(path.join(e2e, 'config.json'), `${JSON.stringify(resolved, null, 2)}\n`);
  return { id, dir, e2e, skillsDir, config: resolved };
}
