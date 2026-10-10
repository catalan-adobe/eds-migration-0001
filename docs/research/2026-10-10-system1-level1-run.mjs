// System 1 (Clef) on the hybrid's candidates: per candidate, "what is it" (choice) and "does
// it belong with the previous one" (yes/no), scored against Haiku 5.5's answers.
// VARIANT=text|image|both  SITES=wknd,aemlive,...  node --env-file=<clef env> run.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const LIB = '/Users/catalan/repos/adobe-skills/.worktrees/eds-content-pipeline/plugins/web/skills/migration-pipeline/scripts/lib';
const { askQuestions, deployment } = await import(`${LIB}/system1.mjs`);
const { bandState, layout: layoutWords, background: bgWords, contentLeaves, inBand, token } = await import(`${LIB}/band-state.mjs`);
const { columnsOf } = await import(`${LIB}/band-analysis.mjs`);
const HOME = process.env.HOME;
const SITES = {
  wknd: { lab: `${HOME}/repos/ai/migration-tests/_lab/haiku-wknd`, project: `${HOME}/repos/ai/migration-tests/bench-level2/wknd` },
  aemlive: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/aemlive`, project: `${HOME}/repos/ai/migration-tests/bench-level2/aemlive` },
  nasa: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/nasa`, project: `${HOME}/repos/ai/migration-tests/bench-level2/nasa` },
  mdn: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/mdn`, project: `${HOME}/repos/ai/migration-tests/bench-level2/mdn` },
  mit: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/mit`, project: `${HOME}/repos/ai/migration-tests/bench-level2/mit` },
  govuk: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/govuk`, project: `${HOME}/repos/ai/migration-tests/bench-level2/govuk` },
  synopsys: { lab: `${HOME}/repos/ai/migration-tests/_lab/hybrid/synopsys`, project: `${HOME}/repos/ai/migration-tests/eds-projects/test-content-pipeline-0001/eds-mig-20260914-14` },
};
const VARIANT = process.env.VARIANT ?? 'both';
const PAIRIMG = process.env.PAIRIMG !== '0';
const WORDING = process.env.WORDING ?? 'w1';
const TAG = `${VARIANT}-${WORDING}${process.env.IMGW ? '-' + process.env.IMGW : ''}${PAIRIMG ? '' : '-nopair'}`;
const THRESHOLD = Number(process.env.THRESHOLD ?? 0.75);
const IMGW = Number(process.env.IMGW ?? 1280);
const only = process.env.SITES ? process.env.SITES.split(',') : Object.keys(SITES);
const dep = deployment();

const IMG1 = VARIANT !== 'text' ? ' Image 1 shows `band`.' : '';
const IMG2 = VARIANT !== 'text' && PAIRIMG ? ' Image 2 shows `previous` above `band`.' : '';
const MERGE = 'Do `previous` and `band` form one part of the page for an author? Yes when `previous` is a heading or a short introduction for `band`, when `band` continues what `previous` shows (more items of the same list or grid), or when the two are the pieces of one component. No when `band` starts a different part under a heading of its own, or on a different background.' + IMG2;
const CRITERIA = {
  default_content: 'Plain document content only: headings, paragraphs, lists, links or buttons, a breadcrumb, a small image in the flow of the text — one after another as in an article',
  block: 'One component and nothing else: a large image or video with at most a title, a short text and a button (a hero); a short call-to-action banner on its own background (a heading, a line, a button); a slideshow; a row or grid of alike cards or tiles; tabs; an accordion of collapsed questions; a form; a table; an embedded video or frame',
  section: 'Several different things together: a heading or paragraphs above or beside a component, two components one above the other, or a main column of running text beside a narrower side column',
};
const argmax = (answers, ids) => ids.map((id) => [id, answers[id].noul]).sort((a, b) => b[1] - a[1])[0];
export const WORDINGS = {
  // A: one choice, the counted state
  wA: {
    questions: (hasPrev) => ({ kind: { type: 'choice', instructions: 'What is `band` as a whole, for an author writing this page as a document? Judge from `band.picture`, `band.text`, `band.layout`, `band.headings`, `band.content`.' + IMG1, criteria: CRITERIA }, ...(hasPrev ? { merge: { type: 'noul', instructions: MERGE } } : {}) }),
    decide: (a) => ({ kind: a.kind.choice, confidence: a.kind.confidence, probabilities: a.kind.probabilities }),
  },
  // B: three yes/no, the most probable wins
  wB: {
    questions: (hasPrev) => ({
      is_default: { type: 'noul', instructions: `Is \`band\` ${CRITERIA.default_content}?` + IMG1 },
      is_block: { type: 'noul', instructions: `Is \`band\` ${CRITERIA.block}?` + IMG1 },
      is_section: { type: 'noul', instructions: `Does \`band\` hold ${CRITERIA.section.slice(0, 1).toLowerCase()}${CRITERIA.section.slice(1)}?` + IMG1 },
      title_above: { type: 'noul', instructions: 'Does `band` start with a heading (alone or with a short introduction) that sits above and introduces a component below it — a row or grid of cards, a list of items, a slideshow, a form?' + IMG1 },
      ...(hasPrev ? { merge: { type: 'noul', instructions: MERGE } } : {}) }),
    decide: (a) => { const [id, p] = argmax(a, ['is_default', 'is_block', 'is_section']); let kind = { is_default: 'default_content', is_block: 'block', is_section: 'section' }[id]; if (kind === 'block' && a.title_above.noul >= 0.6) kind = 'section'; return { kind, confidence: p, probabilities: { default_content: a.is_default.noul, block: a.is_block.noul, section: a.is_section.noul, title_above: a.title_above.noul } }; },
  },
  // C: concrete features, composed by rules
  wC: {
    questions: (hasPrev) => ({
      component: { type: 'noul', instructions: 'Does `band` contain a component — a large image or video used as a banner, a slideshow, a row or grid of alike cards or tiles, tabs, an accordion of collapsed questions, a form, a table, an embedded video or frame?' + IMG1 },
      prose: { type: 'noul', instructions: 'Does `band` contain running document text — paragraphs, a list, a quote, a code sample — or a heading that introduces content below it (not a title that is part of a banner or a card)?' + IMG1 },
      side: { type: 'noul', instructions: 'Does `band` show a main column of content with a separate side column beside it (a sidebar, a navigation, a list of related items)?' + IMG1 },
      ...(hasPrev ? { merge: { type: 'noul', instructions: MERGE } } : {}) }),
    decide: (a, f) => {
      const comp = a.component.noul >= 0.5, prose = a.prose.noul >= 0.5, side = a.side.noul >= 0.5 || (f.cols.length === 2 && Math.max(...f.cols.map((c) => c.x1 - c.x0)) > 1.6 * Math.min(...f.cols.map((c) => c.x1 - c.x0)));
      const kind = side ? 'section' : comp && prose ? 'section' : comp ? 'block' : 'default_content';
      return { kind, probabilities: { component: a.component.noul, prose: a.prose.noul, side: a.side.noul } };
    },
  },
};

const pages = [];
for (const site of only) {
  const { lab, project } = SITES[site];
  const sel = JSON.parse(readFileSync(`${project}/migration/pages/selections/judge-10.json`, 'utf8'));
  for (const id of sel.pages) {
    const cfile = `${lab}/${id}/candidates.json`, hfile = `${lab}/${id}/haiku-g2.json`;
    if (!existsSync(cfile) || !existsSync(hfile)) continue;
    const c = JSON.parse(readFileSync(cfile, 'utf8')); const h = JSON.parse(readFileSync(hfile, 'utf8'));
    if (!h.answers?.bands) continue;
    const capture = JSON.parse(readFileSync(`${project}/migration/pages/${id}/band-capture.json`, 'utf8'));
    pages.push({ site, id, project, url: h.url, candidates: c.candidates, body: c.body, haiku: h.answers.bands, capture, shot: `${project}/migration/pages/${id}/shots/page.jpg` });
  }
}

const sharpOf = {};
const sharpFor = (project) => (sharpOf[project] ??= createRequire(`${project}/migration/.work/node_modules/x.js`)('sharp'));
async function crop(page, top, bottom) {
  const sharp = sharpFor(page.project);
  const buf = await sharp(page.shot).extract({ left: 0, top: Math.max(0, top), width: page.capture.W, height: Math.max(8, Math.min(bottom, page.capture.H) - Math.max(0, top)) })
    .resize({ width: IMGW, height: Math.round(IMGW * 0.6), fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const covering = (bgs, c) => bgs.filter((b) => b.y <= c.top + 2 && b.y + b.h >= c.bottom - 2 && b.bg.startsWith('color:')).sort((a, b) => a.h - b.h)[0]?.bg ?? null;
function toBand(c, capture) {
  const columns = c.parts.map((p) => ({ x0: p.x, x1: p.x + p.w }));
  return { y: c.top, h: c.bottom - c.top, bg: covering(capture.bgs ?? [], c), cols: columns.length, columns: columns.length ? columns : [{ x0: 0, x1: capture.W }] };
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const count = (n) => WORDS[n] ?? 'many';
// Facts a reader needs and a System 1 model cannot count: columns from the leaves, images
// by size and likeness, headings, text amount, inputs and embeds.
function facts(c, capture) {
  const W = capture.W, h = c.bottom - c.top;
  const inside = inBand(contentLeaves(capture.leaves), { y: c.top, h });
  const cols = columnsOf(inside.filter((l) => !l.m || l.w >= 40), c.top, c.bottom, W, capture.analysis?.gutter ?? 24);
  const images = inside.filter((l) => l.m && l.e !== 'svg' && l.w >= 100 && l.h >= 80);
  const big = images.filter((l) => l.w >= 0.6 * W || (l.w * l.h) >= 0.35 * W * h);
  const groups = new Map(); for (const im of images) { const k = `${Math.round(im.w / 20)}x${Math.round(im.h / 20)}`; groups.set(k, [...(groups.get(k) ?? []), im]); }
  const alike = [...groups.values()].filter((g) => g.length >= 3 && new Set(g.map((im) => Math.round(im.x / 30))).size >= 2).sort((a, b) => b.length - a.length)[0];
  const headings = inside.filter((l) => /^H[1-6]$/.test(l.e));
  const texts = inside.filter((l) => l.t && !/^H[1-6]$/.test(l.e) && !['A', 'BUTTON'].includes(l.e));
  const chars = texts.reduce((n, l) => n + (l.t?.length ?? 0), 0);
  const long = texts.filter((l) => (l.t?.length ?? 0) >= 80).length;
  const links = inside.filter((l) => ['A', 'BUTTON'].includes(l.e)).length;
  const inputs = inside.filter((l) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(l.e)).length;
  const embeds = inside.filter((l) => l.e === 'IFRAME' || l.e === 'VIDEO').length;
  const picture = big.length ? (images.length === big.length ? `${count(big.length)} large image${big.length > 1 ? 's' : ''} covering most of the band` : `${count(big.length)} large image and ${count(images.length - big.length)} smaller`)
    : alike ? `${count(alike.length)} alike images of one size in a row or grid` : images.length ? `${count(images.length)} image${images.length > 1 ? 's' : ''}` : 'no image';
  const text = chars === 0 ? 'no text' : long === 0 ? 'short texts only (titles, labels, captions)' : long < 3 ? 'a few lines of text' : `paragraphs of running text (${count(Math.min(long, 8))}${long > 8 ? '+' : ''})`;
  // Layout from the page's structure: sibling parts side by side (the tree), or a rail the
  // dump set aside that overlaps this band. A narrow part beside a wide one is a side column.
  const parts = (c.parts ?? []).filter((p) => p.w >= 120);
  const rails = (capture.analysis?.rails ?? []).filter((r) => Math.min(r.y1, c.bottom) - Math.max(r.y0, c.top) >= 0.3 * Math.min(h, r.y1 - r.y0));
  let layoutKind = 'single';
  const boxes = parts.length >= 2 ? parts.map((p) => ({ x: p.x, w: p.w })) : cols.length >= 2 ? cols.map((k) => ({ x: k.x0, w: k.x1 - k.x0 })) : [];
  if (boxes.length >= 2) {
    const sorted = [...boxes].sort((p, q) => q.w - p.w);
    if (sorted[0].w > 1.6 * sorted[1].w) {
      const byX = [...boxes].sort((p, q) => p.x - q.x);
      layoutKind = byX[0] === sorted[0] ? 'main-left' : byX.at(-1) === sorted[0] ? 'main-right' : 'main-centre';
    } else layoutKind = 'columns';
  }
  if (layoutKind === 'single' && rails.length) layoutKind = rails.every((r) => r.side === 'right') ? 'main-left' : rails.every((r) => r.side === 'left') ? 'main-right' : 'main-centre';
  const railLeaves = rails;
  const imageOnly = images.length >= 1 && chars === 0 && headings.length === 0 && links <= 1 && inputs === 0;
  const fullBleed = big.some((im) => im.w >= 0.9 * W);
  const loneHeading = headings.length === 1 && chars === 0 && images.length === 0 && links <= 1;
  if (['main-left', 'main-right', 'main-centre'].includes(layoutKind) && h < 300) layoutKind = 'single';
  return { cols, picture, text, headings: headings.length, links, inputs, embeds, alike: alike?.length ?? 0, big: big.length, long, inside, layoutKind, railLeaves: railLeaves.length, imageOnly, fullBleed, loneHeading };
}
function stateOf(c, capture) {
  const f = facts(c, capture); const H = capture.H;
  const band = { y: c.top, h: c.bottom - c.top, bg: covering(capture.bgs ?? [], c), cols: f.cols.length, columns: f.cols };
  const base = bandState(band, capture.leaves, H);
  const layoutText = { 'main-left': 'a main column with a narrower side column on the right', 'main-right': 'a narrower side column on the left of the main column', 'main-centre': 'a main column with narrower side columns on both sides', columns: base.layout.includes('column') && base.layout !== 'one column' ? base.layout : 'equal columns side by side', single: base.layout }[f.layoutKind];
  return { at: base.at, height: base.height, background: base.background, layout: layoutText, picture: f.picture, text: f.text,
    headings: `${count(f.headings)} heading${f.headings === 1 ? '' : 's'}`, links: `${count(f.links)} link${f.links === 1 ? '' : 's'} or button${f.links === 1 ? '' : 's'}`,
    ...(f.inputs ? { inputs: `${count(f.inputs)} input field${f.inputs > 1 ? 's' : ''}` } : {}), ...(f.embeds ? { embeds: `${count(f.embeds)} embedded video or frame` } : {}),
    content: base.content, _facts: f };
}

async function askCandidate(page, i) {
  const c = page.candidates[i], prev = page.candidates[i - 1];
  const w = WORDINGS[WORDING];
  const sb = stateOf(c, page.capture), sp = prev ? stateOf(prev, page.capture) : null;
  const strip = ({ _facts, ...rest }) => rest;
  const state = { band: strip(sb) }; if (prev) state.previous = strip(sp);
  const questions = w.questions(Boolean(prev));
  const images = [];
  if (VARIANT !== 'text') { images.push(await crop(page, c.top, c.bottom)); if (prev && PAIRIMG) images.push(await crop(page, prev.top, c.bottom)); }
  const noContent = ({ content, ...rest }) => rest;
  const stateSent = VARIANT === 'image' ? { band: { at: state.band.at, layout: state.band.layout }, ...(prev ? { previous: { at: state.previous.at, layout: state.previous.layout } } : {}) }
    : VARIANT === 'facts' ? { band: noContent(state.band), ...(prev ? { previous: noContent(state.previous) } : {}) } : state;
  const t0 = Date.now();
  const { answers, usage } = await askQuestions(dep, { state: stateSent, questions, images });
  const ref0 = page.haiku[i]; const ref = { ...ref0, kind: ['main-left', 'main-right', 'main-centre'].includes(ref0.layout) ? 'section' : ref0.kind, rawKind: ref0.kind };
  const judged = w.decide(answers, sb._facts);
  const f = sb._facts;
  const decided = { ...judged, judged: judged.kind, layout: f.layoutKind };
  if (['main-left', 'main-right', 'main-centre'].includes(f.layoutKind)) decided.kind = 'section';
  if (f.loneHeading) decided.kind = 'default_content';
  if (f.imageOnly) decided.kind = f.fullBleed ? 'block' : 'default_content';
  if (f.inside.length === 0) decided.kind = judged.kind, decided.empty = true;
  else if (f.layoutKind === 'columns' && judged.kind === 'default_content') decided.kind = 'block';
  return { id: c.id, kind: decided.kind, confidence: decided.confidence ?? null, probabilities: decided.probabilities ?? null, answers: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.noul ?? a.choice])), merge: prev ? answers.merge.noul : null,
    refKind: ref.kind, refRawKind: ref.rawKind, refLayout: ref0.layout, judgedKind: decided.judged, layoutKind: f.layoutKind, refMerge: prev ? ref.mergeWithPrevious : null, kindOk: decided.kind === ref.rawKind || f.inside.length === 0, kindOkNorm: decided.kind === ref.kind || f.inside.length === 0, mergeOk: prev ? ((f.inside.length === 0 ? 1 : answers.merge.noul) >= THRESHOLD) === ref.mergeWithPrevious : null, empty: f.inside.length === 0,
    ms: Date.now() - t0, tokens: usage.inputTokens ?? null, state: stateSent };
}

mkdirSync(`out`, { recursive: true });
const wall0 = Date.now(); const results = []; const queue = pages.flatMap((p) => p.candidates.map((_, i) => [p, i]));
await Promise.all([1, 2, 3, 4].map(async () => { while (queue.length) { const [p, i] = queue.shift(); try { results.push({ site: p.site, page: p.id, url: p.url, ...(await askCandidate(p, i)) }); } catch (e) { results.push({ site: p.site, page: p.id, id: p.candidates[i].id, error: e.message }); } } }));
writeFileSync(`out/${TAG}.json`, JSON.stringify({ variant: VARIANT, wording: WORDING, model: dep.model, results }, null, 1));
const ok = results.filter((r) => !r.error);
const by = (f) => { const m = {}; for (const r of ok) { const k = f(r); (m[k] ??= []).push(r); } return m; };
const score = (rs) => { const k = rs.filter((r) => r.kindOk).length, m = rs.filter((r) => r.mergeOk !== null), mo = m.filter((r) => r.mergeOk).length; return `kind ${k}/${rs.length} (${Math.round(100 * k / rs.length)} %) · merge ${mo}/${m.length} (${m.length ? Math.round(100 * mo / m.length) : 0} %)`; };
console.log(`== ${TAG}: ${ok.length} candidates, ${results.length - ok.length} errors, wall ${((Date.now() - wall0) / 1000).toFixed(0)} s, ${Math.round(ok.reduce((n, r) => n + r.ms, 0) / ok.length)} ms/req, tokens/req ${Math.round(ok.reduce((n, r) => n + (r.tokens ?? 0), 0) / ok.length)}`);
for (const [site, rs] of Object.entries(by((r) => r.site))) console.log(site.padEnd(9), score(rs));
console.log('all      ', score(ok));
for (const t of [0.5, 0.6, 0.7, 0.8]) { const m = ok.filter((r) => r.merge !== null); const good = m.filter((r) => ((r.empty ? 1 : r.merge) >= t) === r.refMerge).length; console.log(`  merge at threshold ${t}: ${good}/${m.length} (${Math.round(100 * good / m.length)} %)`); }
const lay = ok.filter((r) => r.layoutKind === r.refLayout || (r.layoutKind === 'main-centre' && r.refLayout.startsWith('main'))).length; const raw = ok.filter((r) => r.judgedKind === r.refRawKind).length;
const norm = ok.filter((r) => r.kindOkNorm).length;
console.log(`kind vs Haiku's raw kind is the score above; vs the side-layout-normalised kind ${norm}/${ok.length}; layout (code) agrees with Haiku's on ${lay}/${ok.length}`);
const conf = {}; for (const r of ok) { conf[r.refKind] ??= {}; conf[r.refKind][r.kind] = (conf[r.refKind][r.kind] ?? 0) + 1; }
console.log('confusion (rows = Haiku, cols = Clef):', JSON.stringify(conf));
const errs = results.filter((r) => r.error); if (errs.length) console.log('errors:', errs.slice(0, 3).map((e) => e.error.slice(0, 120)));
