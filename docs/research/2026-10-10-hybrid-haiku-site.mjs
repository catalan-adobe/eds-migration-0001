// One site: strips with a ruler, candidate bands from the visual tree, one guided question
// per candidate to a vision model, a sheet. Usage: SITE=<name> PROJECT=<path> node site.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const SITE = process.env.SITE, P = `${process.env.PROJECT}/migration`;
const MODEL = process.env.MODEL ?? 'claude-haiku-5-5', EFFORT = process.env.EFFORT ?? 'high', TAG = process.env.TAG ?? 'haiku-g2';
const PRICES = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };
const SELECTION = process.env.SELECTION ?? 'judge-10';
const base = 'https://ec-dev-ai-foundry-resource.services.ai.azure.com/anthropic/';
const sharp = createRequire(`${P}/.work/node_modules/x.js`)('sharp');
const OUT = `${process.cwd()}/${SITE}`; mkdirSync(OUT, { recursive: true });
if (!existsSync(`${OUT}/migration`)) { const { symlinkSync } = await import('node:fs'); symlinkSync(P, `${OUT}/migration`); }
const STRIP = 1200;
const sel = JSON.parse(readFileSync(`${P}/pages/selections/${SELECTION}.json`, 'utf8'));
const table = JSON.parse(readFileSync(`${P}/pages/pages.json`, 'utf8'));
const KINDS = ['section', 'block', 'default_content'], LAYOUTS = ['single', 'main-left', 'main-right', 'columns'];

function level(tree, body) {
  const inBody = (n) => n.bounds.y + n.bounds.height > body.top + 2 && n.bounds.y < body.bottom - 2;
  let node = tree;
  for (let i = 0; i < 12; i += 1) {
    const kids = (node.children ?? []).filter((k) => k.bounds.height > 0 && inBody(k));
    if (kids.length === 0) return [node];
    if (kids.length === 1) { node = kids[0]; continue; }
    const big = kids.filter((k) => k.bounds.height >= 0.95 * (body.bottom - body.top));
    if (big.length === 1 && kids.length <= 3) { node = big[0]; continue; }
    return kids;
  }
  return [node];
}
function bands(siblings, body) {
  const sorted = [...siblings].sort((a, b) => a.bounds.y - b.bounds.y);
  const out = [];
  for (const n of sorted) {
    const y0 = Math.max(body.top, n.bounds.y), y1 = Math.min(body.bottom, n.bounds.y + n.bounds.height);
    if (y1 - y0 < 4) continue;
    const last = out.at(-1);
    if (last && y0 < last.bottom - 8) { last.bottom = Math.max(last.bottom, y1); last.parts.push(n); continue; }
    out.push({ top: y0, bottom: y1, parts: [n] });
  }
  for (let i = 0; i < out.length; i += 1) { out[i].top = i === 0 ? body.top : out[i - 1].bottom; if (i === out.length - 1) out[i].bottom = body.bottom; }
  return out.map((b, i) => {
    const cols = b.parts.map((p) => ({ x: p.bounds.x, w: p.bounds.width })).sort((a, c) => a.x - c.x);
    const distinct = cols.filter((c, j) => !cols.slice(0, j).some((d) => Math.abs(d.x - c.x) < 40));
    return { id: `C${i + 1}`, top: b.top, bottom: b.bottom, columns: distinct.length, parts: distinct };
  });
}
const prompt = (W, H, cands) => `You are reading one rendered web page to migrate it to Adobe Edge Delivery Services (EDS), where an author writes a document: plain content (headings, paragraphs, lists, images, links, code samples, quotes) and blocks (components written as tables: hero, carousel, cards, columns, tabs, accordion, teaser, form, embed, table...), grouped in sections (horizontal slabs separated by a horizontal rule, often with their own background or layout).

This pass is the FIRST LEVEL ONLY. The page body (between site header and site footer) has already been cut into CANDIDATE BANDS from the page's own structure: each candidate is one or more sibling elements; where siblings sit side by side, the candidate is marked as having columns. Each candidate's top is drawn on the strips as a dashed blue line labelled with its id. Candidates never cut through an element, so you cannot split one; you may MERGE a candidate into the one before it when the two are one thing for an author (a title above its cards; a quote inside an article).

Candidates (page pixels):
${cands.map((c) => `- ${c.id}: y ${c.top}–${c.bottom}${c.columns > 1 ? ` — ${c.columns} columns side by side (${c.parts.map((p) => `${p.w} px at x ${p.x}`).join(', ')})` : ''}`).join('\n')}

For every candidate, in order, answer:
- mergeWithPrevious: true when it belongs with the candidate before it (never for the first).
- kind, for THIS CANDIDATE ALONE (not for the merged band): "section" (this candidate alone already holds several different things: a title and a block, a block and paragraphs), "block" (this candidate is one component: a hero, a carousel, a cards grid, an accordion, a teaser...), "default_content" (this candidate is plain authored content: a title, paragraphs, a list, an image in flow, a code sample, a breadcrumb).
  The kind of a merged band is derived afterwards: candidates of one kind make a band of that kind; candidates of different kinds make a section. So merging a title (default_content) into the cards below it (block) gives a section — say the kinds as you see them, merge as an author would group.
- layout: "single" (one column of content), "main-left" (main content left, a narrower side column right), "main-right" (the mirror), "columns" (two or more equal columns).
- label: three to six words saying what it shows (block name first for a block).
- confidence: 0..1.

Report in PAGE PIXELS; every strip has a red ruler on its left edge with the page y every 100 px. The strips are consecutive slices of one page, width ${W} px, height ${H} px.

Use only the strip images and the candidate list. Answer with JSON only, exactly this shape:
{"url": string,
 "bands": [{"id": "C1", "mergeWithPrevious": false, "kind": "section"|"block"|"default_content", "layout": "single"|"main-left"|"main-right"|"columns", "label": string, "confidence": number}],
 "notes": string}
notes: what you were unsure about, two sentences at most.`;
function validate(j, cands) {
  const errs = [];
  if (!Array.isArray(j.bands)) return ['bands missing'];
  if (j.bands.length !== cands.length) errs.push(`expected ${cands.length} answers, got ${j.bands.length}`);
  for (const [i, b] of j.bands.entries()) {
    if (b.id !== cands[i]?.id) errs.push(`answer ${i + 1} is ${b.id}, expected ${cands[i]?.id}`);
    if (!KINDS.includes(b.kind)) errs.push(`${b.id}: kind ${b.kind}`);
    if (!LAYOUTS.includes(b.layout)) errs.push(`${b.id}: layout ${b.layout}`);
    if (typeof b.mergeWithPrevious !== 'boolean') errs.push(`${b.id}: mergeWithPrevious`);
    if (i === 0 && b.mergeWithPrevious) errs.push('first band merges');
  }
  return errs;
}
function merged(cands, answers) {
  const out = [];
  for (const [i, a] of answers.entries()) {
    const c = cands[i];
    if (a.mergeWithPrevious && out.length) { const last = out.at(-1); last.bottom = c.bottom; last.members.push(c.id); last.kinds.push(a.kind); last.layouts.push(a.layout); last.labels.push(a.label); last.confidence = Math.min(last.confidence, a.confidence); }
    else out.push({ id: `B${out.length + 1}`, top: c.top, bottom: c.bottom, members: [c.id], kinds: [a.kind], layouts: [a.layout], labels: [a.label], confidence: a.confidence });
  }
  return out.map((b) => ({ ...b, kind: new Set(b.kinds).size === 1 ? b.kinds[0] : 'section', layout: b.layouts.find((l) => l !== 'single') ?? 'single', label: [...new Set(b.labels)].join(' + ') }));
}

async function prepare(id) {
  const page = table.pages.find((p) => p.id === id);
  const tree = JSON.parse(readFileSync(`${P}/pages/${id}/visual-tree.json`, 'utf8'));
  if (!tree.page.shot) return null;
  const structure = JSON.parse(readFileSync(`${P}/pages/${id}/structure.bands-system1.json`, 'utf8'));
  const body = structure.body;
  const cands = bands(level(tree.tree, body), body);
  const shot = `${P}/${tree.page.shot}`; const m = await sharp(shot).metadata();
  const dir = `${OUT}/${id}`; mkdirSync(dir, { recursive: true });
  const strips = [];
  for (let top = 0, n = 1; top < m.height; top += STRIP, n += 1) {
    const h = Math.min(STRIP, m.height - top); const svg = [];
    for (let y = Math.ceil(top / 100) * 100; y < top + h; y += 100) { const yy = y - top; svg.push(`<line x1="0" y1="${yy}" x2="${y % 500 === 0 ? 40 : 20}" y2="${yy}" stroke="#d00" stroke-width="2"/><text x="44" y="${yy + 5}" font-size="14" font-family="monospace" fill="#d00">${y}</text>`); }
    for (const c of cands.filter((c) => c.top >= top && c.top < top + h)) { const yy = c.top - top; svg.push(`<line x1="0" y1="${yy}" x2="${m.width}" y2="${yy}" stroke="#0a4fd1" stroke-width="3" stroke-dasharray="12,6"/><rect x="${m.width - 150}" y="${yy}" width="150" height="24" fill="#0a4fd1"/><text x="${m.width - 144}" y="${yy + 17}" font-size="15" font-weight="bold" font-family="sans-serif" fill="#fff">${c.id} starts · ${c.columns} col</text>`); }
    const file = `${dir}/cstrip-${n}.jpg`;
    await sharp(shot).extract({ left: 0, top, width: m.width, height: h }).composite([{ input: Buffer.from(`<svg width="${m.width}" height="${h}"><rect x="0" y="0" width="90" height="${h}" fill="rgba(255,255,255,0.75)"/>${svg.join('')}</svg>`), top: 0, left: 0 }]).jpeg({ quality: 85 }).toFile(file);
    strips.push({ file, top, bottom: top + h });
  }
  const info = { id, url: page.url, width: m.width, height: m.height, body, candidates: cands, strips, shot: tree.page.shot };
  writeFileSync(`${dir}/candidates.json`, JSON.stringify(info, null, 1));
  return info;
}
async function ask(info) {
  const content = [];
  for (const [i, s] of info.strips.entries()) { content.push({ type: 'text', text: `Strip ${i + 1} of ${info.strips.length}: page y ${s.top}–${s.bottom}` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(s.file).toString('base64') } }); }
  content.push({ type: 'text', text: `${prompt(info.width, info.height, info.candidates)}\n\nPage: ${info.url}` });
  const t0 = Date.now();
  const res = await fetch(`${base}v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.AZ_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: EFFORT }, messages: [{ role: 'user', content }] }) });
  const j = await res.json(); if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  const text = j.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'); const m = /\{[\s\S]*\}/.exec(text);
  let parsed = null, errors = ['no JSON']; if (m) { try { parsed = JSON.parse(m[0]); errors = validate(parsed, info.candidates); } catch (e) { errors = [`parse: ${e.message}`]; } }
  const [pi, po] = PRICES[MODEL]; const cost = (j.usage.input_tokens * pi + j.usage.output_tokens * po) / 1e6;
  const out = { id: info.id, url: info.url, model: MODEL, effort: EFFORT, ms: Date.now() - t0, usage: j.usage, cost, errors, answers: parsed, result: parsed && !errors.length ? { bands: merged(info.candidates, parsed.bands), notes: parsed.notes } : null, raw: parsed ? undefined : text.slice(0, 1500) };
  writeFileSync(`${OUT}/${info.id}/${TAG}.json`, JSON.stringify(out, null, 1));
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colour = { section: '#6a3fd1', block: '#e07b00', default_content: '#0a8f5a' };
function sheet(infos, runs, ledger) {
  const W = 560; const cards = [];
  for (const info of infos) {
    const run = runs.find((r) => r.id === info.id); const scale = W / info.width;
    const img = `<img src="migration/${info.shot}" style="width:${W}px">`;
    const grey = (top, bottom, label) => `<div style="position:absolute;left:0;top:${top * scale}px;width:${W}px;height:${(bottom - top) * scale}px;background:rgba(120,120,120,0.25)"><span style="position:absolute;left:2px;top:2px;font:11px sans-serif;color:#333">${label}</span></div>`;
    const chrome = grey(0, info.body.top, 'header') + grey(info.body.bottom, info.height, 'footer');
    const candLines = info.candidates.map((c) => `<div style="position:absolute;left:0;top:${c.top * scale}px;width:${W}px;border-top:2px dashed #0a4fd1"><span style="position:absolute;right:2px;top:0;font:10px sans-serif;color:#0a4fd1;background:#fff">${c.id}${c.columns > 1 ? ' · ' + c.columns + ' cols' : ''}</span></div>`).join('');
    let k = ''; const r = run?.result;
    if (r) for (const b of r.bands) k += `<div style="position:absolute;left:0;top:${b.top * scale}px;width:${W - 4}px;height:${(b.bottom - b.top) * scale}px;border:3px solid ${colour[b.kind]};box-sizing:border-box"><span style="position:absolute;left:2px;top:2px;background:${colour[b.kind]};color:#fff;font:11px/1.3 sans-serif;padding:1px 4px;">${esc(`${b.members.join('+')} · ${b.kind}${b.layout !== 'single' ? ' · ' + b.layout : ''} · ${b.label} ${Math.round(b.confidence * 100)}%`)}</span></div>`;
    const line = run?.error ? `ERROR ${esc(run.error)}` : run.errors.length ? `INVALID: ${esc(run.errors.join('; '))}` : `${r.bands.length} bands [${r.bands.map((b) => b.kind + (b.layout !== 'single' ? '/' + b.layout : '')).join(', ')}] · ${(run.ms / 1000).toFixed(1)} s · $${run.cost.toFixed(4)}`;
    cards.push(`<section style="margin:24px 0;border-top:1px solid #ddd;padding-top:12px"><h2 style="font:600 15px sans-serif;margin:0 0 4px"><a href="${esc(info.url)}" target="_blank">${esc(info.url)}</a></h2><p style="font:13px sans-serif;color:#444;margin:0 0 8px">${info.candidates.length} candidates · ${line}</p>
<div style="display:flex;gap:14px;align-items:flex-start"><div><div style="font:12px sans-serif;color:#666;margin-bottom:4px">tree candidates</div><div style="position:relative;width:${W}px">${img}${chrome}${candLines}</div></div><div><div style="font:12px sans-serif;color:#666;margin-bottom:4px">${MODEL} ${EFFORT}, guided, kind per candidate</div><div style="position:relative;width:${W}px">${img}${chrome}${k}</div><p style="font:11px sans-serif;color:#555;max-width:${W}px"><b>notes:</b> ${esc(r?.notes)}</p></div></div></section>`);
  }
  return `<!doctype html><meta charset="utf-8"><title>${SITE}: hybrid level 1</title><body style="margin:20px;font-family:sans-serif"><h1 style="font-size:20px">${esc(SITE)}, ${SELECTION} — first level, hybrid: tree candidates, ${MODEL} ${EFFORT}</h1><p style="font:13px sans-serif">${esc(JSON.stringify(ledger))}</p>${cards.join('')}</body>`;
}

const infos = (await Promise.all(sel.pages.map(prepare))).filter(Boolean);
const wall0 = Date.now(); const queue = [...infos]; const runs = [];
await Promise.all([1, 2, 3].map(async () => { while (queue.length) { const p = queue.shift(); try { runs.push(await ask(p)); } catch (e) { runs.push({ id: p.id, error: e.message }); } } }));
const ok = runs.filter((r) => !r.error); const sum = (f) => ok.reduce((n, d) => n + f(d), 0);
const kinds = {}, layouts = {}; let bandsN = 0, candsN = 0;
for (const r of ok) if (r.result) { bandsN += r.result.bands.length; for (const b of r.result.bands) { kinds[b.kind] = (kinds[b.kind] ?? 0) + 1; layouts[b.layout] = (layouts[b.layout] ?? 0) + 1; } }
for (const i of infos) candsN += i.candidates.length;
const ledger = { site: SITE, model: MODEL, effort: EFFORT, pages: ok.length, failed: runs.length - ok.length, invalid: ok.filter((r) => r.errors.length).length, candidates: candsN, bands: bandsN, kinds, layouts, wallMs: Date.now() - wall0, perPageMs: Math.round(sum((d) => d.ms) / ok.length), inputTokens: sum((d) => d.usage.input_tokens), outputTokens: sum((d) => d.usage.output_tokens), cost: Number(sum((d) => d.cost).toFixed(4)) };
writeFileSync(`${OUT}/ledger-${TAG}.json`, JSON.stringify(ledger, null, 1));
writeFileSync(`${OUT}/review-${TAG}.html`, sheet(infos, runs, ledger));
for (const r of runs.sort((a, b) => a.id.localeCompare(b.id))) console.log(r.id, r.error ? `ERROR ${r.error.slice(0, 100)}` : r.errors.length ? `INVALID ${r.errors.join('; ')}` : `${infos.find((i) => i.id === r.id).candidates.length} cands → ${r.result.bands.length} bands ${r.result.bands.map((b) => `${b.members.length > 1 ? b.members.length + 'x' : ''}${b.kind[0]}${b.layout !== 'single' ? '/' + b.layout.replace('main-', '') : ''}`).join(' ')}`);
console.log('LEDGER', JSON.stringify(ledger));
