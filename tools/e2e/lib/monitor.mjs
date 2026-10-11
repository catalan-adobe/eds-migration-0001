// What the monitor reads, every minute, without touching anything: the agent's session
// transcript (turns, tool calls, errors, cost per model, last activity), the project's
// state and runs, and the workflow runs the session started. And when to stop the agent.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const jsonl = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return []; } // a line being written
});
const files = (dir, test) => (existsSync(dir)
  ? readdirSync(dir).filter(test).map((f) => path.join(dir, f)) : []);

/** The session transcripts in a directory, read: activity, tools, cost per model. */
export function readSessions(dir) {
  const out = { files: [], turns: 0, toolCalls: {}, toolErrors: 0, cost: {}, tokens: 0,
    lastAt: null };
  for (const file of files(dir, (f) => f.endsWith('.jsonl'))) {
    out.files.push(file);
    for (const e of jsonl(file)) {
      if (e.timestamp && (!out.lastAt || e.timestamp > out.lastAt)) out.lastAt = e.timestamp;
      const m = e.type === 'message' ? e.message : null;
      if (m?.role === 'assistant') {
        out.turns += 1;
        const model = `${m.provider ?? '?'}/${m.model ?? '?'}`;
        out.cost[model] = (out.cost[model] ?? 0) + (m.usage?.cost?.total ?? 0);
        out.tokens += m.usage?.totalTokens ?? 0;
        for (const c of m.content ?? []) {
          if (c.type === 'toolCall') out.toolCalls[c.name] = (out.toolCalls[c.name] ?? 0) + 1;
        }
      }
      if (m?.role === 'toolResult' && m.isError) out.toolErrors += 1;
    }
  }
  return out;
}

/** The project's step states (as last written) and its runs, latest last. */
export function readProject(project) {
  const m = path.join(project, 'migration');
  const stateFile = path.join(m, 'state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  const runs = files(path.join(m, 'runs'), (f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(f, 'utf8')))
    .map((r) => ({ id: r.id, step: r.step, state: r.state, done: r.done ?? null,
      failed: (r.failed ?? []).length }));
  return {
    steps: Object.fromEntries((state?.steps ?? []).map((s) => [s.id, s.state])),
    progress: Object.fromEntries((state?.steps ?? []).filter((s) => s.progress)
      .map((s) => [s.id, s.progress])),
    runs,
  };
}

/** The workflow runs a set of sessions started: name, status, cost. */
export function readWorkflows(project, sessionFiles, home = os.homedir()) {
  const root = path.join(home, '.pi', 'workflows', 'projects');
  const base = path.basename(project);
  const dirs = files(root, (d) => d.startsWith(`${base}-`)).map((d) => path.join(d, 'runs'));
  const own = new Set(sessionFiles);
  return dirs.flatMap((d) => files(d, (f) => f.endsWith('.json')))
    .map((f) => JSON.parse(readFileSync(f, 'utf8')).index ?? {})
    .filter((r) => own.has(r.parentSessionFile))
    .map((r) => ({ id: r.runId, name: r.workflowName, status: r.status,
      cost: r.tokenUsage?.cost ?? 0, tokens: r.tokenUsage?.total ?? 0, ms: r.durationMs ?? null }));
}

/** One line of the monitor log. */
export function snapshot({ project, sessionsDir, startedAt, now = new Date() }) {
  const sessions = readSessions(sessionsDir);
  const proj = readProject(project);
  const workflows = readWorkflows(project, sessions.files);
  const cost = Object.values(sessions.cost).reduce((a, b) => a + b, 0)
    + workflows.reduce((a, w) => a + w.cost, 0);
  return {
    at: now.toISOString(), minutes: Math.round((now - new Date(startedAt)) / 60000),
    cost: Number(cost.toFixed(4)), costByModel: sessions.cost, turns: sessions.turns,
    toolCalls: sessions.toolCalls, toolErrors: sessions.toolErrors, lastAt: sessions.lastAt,
    steps: proj.steps, progress: proj.progress, runs: proj.runs.length,
    // a detached worker's progress: the pages its latest run has done
    runDone: proj.runs.at(-1) ? `${proj.runs.at(-1).id}:${proj.runs.at(-1).done}` : null,
    workflows: workflows.map(({ id, status, cost: c }) => ({ id, status, cost: c })),
  };
}

/**
 * Whether to stop the agent: over budget, over time, or stalled — nothing new in the
 * transcript, the steps or the project's runs for `stallMinutes`. Null to go on.
 */
export function verdict(snap, history, budget) {
  if (snap.cost > budget.usd) return `budget: $${snap.cost} > $${budget.usd}`;
  if (snap.minutes > budget.hours * 60) return `time: ${snap.minutes} min > ${budget.hours} h`;
  const stall = budget.stallMinutes ?? 20;
  const sig = (s) => JSON.stringify([s.lastAt, s.steps, s.progress, s.runs, s.runDone]);
  const recent = history.filter((h) => h.minutes >= snap.minutes - stall);
  const span = snap.minutes - (recent[0]?.minutes ?? snap.minutes);
  if (span >= stall && recent.every((h) => sig(h) === sig(snap))) {
    return `stall: nothing new for ${span} min`;
  }
  return null;
}
