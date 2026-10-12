// Whether a run succeeded, by the checks agreed in the design: the steps done, the sample
// read and reviewed, the artefacts sound, under budget. Read from the project's files only;
// the same checks on a baseline project, side by side.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const STEPS = ['discover', 'access', 'cache', 'chrome', 'triage'];
export const SAMPLE = 'judge-10';
export const THRESHOLDS = { chromeShare: 0.8, misreadShare: 0.3, unresolvedPerPage: 2 };

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const share = (n, d) => (d ? Number((n / d).toFixed(2)) : 0);
const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

/** The facts the checks read, from one project. */
export function factsOf(project) {
  const m = path.join(project, 'migration');
  const state = read(path.join(m, 'state.json'));
  const table = read(path.join(m, 'pages', 'pages.json'));
  const fragments = read(path.join(m, 'website', 'fragments.json'))?.fragments ?? [];
  const partOf = new Map(fragments.map((f) => [f.id, f.part]));
  // Chrome is judged on the pages that are pages: still in, not parked by triage as a shell
  // (empty, broken, unread). A page rightly decided out or parked must not count against
  // it. Deciding the pages without a header out would pass the check: the share over every
  // page read, and the count decided out, say so beside the baseline's.
  const shell = (p) => (p.verdict?.reasons ?? []).some((r) => r.by === 'triage'
    && ['empty', 'broken', 'unread'].includes(r.code));
  const seen = (table?.pages ?? []).filter((p) => (
    existsSync(path.join(m, 'pages', p.id, 'visual-tree.json'))));
  const pages = seen.filter((p) => p.verdict?.status !== 'out' && !shell(p));
  const parts = (p) => new Set((read(path.join(m, 'pages', p.id, 'composition.json'))
    ?.fragments ?? []).map((f) => partOf.get(f.ref)));
  const sample = read(path.join(m, 'pages', 'selections', `${SAMPLE}.json`));
  const structures = (sample?.pages ?? []).map((id) => (
    read(path.join(m, 'pages', id, 'structure.candidates-system1.json'))));
  return {
    steps: Object.fromEntries((state?.steps ?? []).map((s) => [s.id, s.state])),
    read: pages.length, captured: seen.length,
    out: (table?.pages ?? []).filter((p) => p.verdict?.status === 'out' && p.cache).length,
    withHeader: pages.filter((p) => parts(p).has('header')).length,
    withFooter: pages.filter((p) => parts(p).has('footer')).length,
    headerOnAll: share(seen.filter((p) => parts(p).has('header')).length, seen.length),
    misread: pages.filter((p) => (p.verdict?.reasons ?? []).some((r) => r.code === 'misread'))
      .length,
    sample: sample?.pages.length ?? 0,
    sampleTriaged: (sample?.pages ?? []).filter((id) => (
      existsSync(path.join(m, 'pages', id, 'triage.json')))).length,
    structured: structures.filter(Boolean).length,
    unresolved: structures.filter(Boolean)
      .map((s) => walk(s.bands).filter((n) => n.unresolved).length),
    review: existsSync(path.join(m, 'views', `structure-${SAMPLE}.html`)),
    // Judgement, not checked: what the agent named and wrote, beside the baseline's.
    brand: read(path.join(m, 'website', 'brand.json'))?.summary ?? null,
    assetOrigins: read(path.join(m, 'migration.json'))?.source?.assetOrigins ?? [],
    overlays: (read(path.join(m, 'website', 'access.json'))?.overlays ?? [])
      .map((o) => `${o.action} ${o.selector}`),
  };
}


/** The checks on one project's facts; `cost` and `budget` for the budget check. */
export function checks(f, { cost, budget }) {
  const undone = STEPS.filter((s) => f.steps[s] !== 'done');
  const list = [
    { id: 'steps', pass: !undone.length,
      value: undone.length ? `not done: ${undone}` : 'all done' },
    { id: 'sample', pass: f.sample === 10 && f.structured === 10 && f.sampleTriaged === 10
      && f.review, value: `${f.structured}/${f.sample} structured, ${f.sampleTriaged} triaged,`
        + ` review ${f.review ? 'rendered' : 'missing'}` },
    { id: 'header', pass: share(f.withHeader, f.read) >= THRESHOLDS.chromeShare,
      value: share(f.withHeader, f.read), threshold: THRESHOLDS.chromeShare },
    { id: 'footer', pass: share(f.withFooter, f.read) >= THRESHOLDS.chromeShare,
      value: share(f.withFooter, f.read), threshold: THRESHOLDS.chromeShare },
    { id: 'report', pass: f.steps.report === 'done', value: f.steps.report ?? 'none' },
    { id: 'misread', pass: share(f.misread, f.read) <= THRESHOLDS.misreadShare,
      value: share(f.misread, f.read), threshold: THRESHOLDS.misreadShare },
    { id: 'unresolved', pass: f.unresolved.every((n) => n <= THRESHOLDS.unresolvedPerPage),
      value: Math.max(0, ...f.unresolved), threshold: THRESHOLDS.unresolvedPerPage },
  ];
  if (cost !== undefined) {
    list.push({ id: 'budget', pass: cost <= budget.usd, value: cost, threshold: budget.usd });
  }
  return { pass: list.every((c) => c.pass), checks: list };
}

/** The result of a run: its checks, and the baseline's beside them when there is one. */
export function result(project, { cost, budget, baseline, stopped }) {
  const own = factsOf(project);
  return {
    ...checks(own, { cost, budget }), stopped: stopped ?? null, cost, facts: own,
    ...(baseline ? { baseline: { facts: factsOf(baseline), ...checks(factsOf(baseline), {}) } }
      : {}),
  };
}
