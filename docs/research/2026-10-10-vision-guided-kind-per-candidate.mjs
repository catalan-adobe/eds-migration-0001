import { readFileSync, writeFileSync } from 'node:fs';
const base = 'https://ec-dev-ai-foundry-resource.services.ai.azure.com/anthropic/';
const MODEL = process.env.MODEL ?? 'claude-sonnet-5-5';
const EFFORT = process.env.EFFORT ?? 'low';
const TAG = process.env.TAG ?? 'sonnet-g1';
const PRICES = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const index = JSON.parse(readFileSync('index.json', 'utf8')).filter((p) => !ONLY || ONLY.includes(p.id));
const KINDS = ['section', 'block', 'default_content'];
const LAYOUTS = ['single', 'main-left', 'main-right', 'columns'];
const prompt = (W, H, cands) => `You are reading one rendered web page to migrate it to Adobe Edge Delivery Services (EDS), where an author writes a document: plain content (headings, paragraphs, lists, images, links) and blocks (components written as tables: hero, carousel, cards, columns, tabs, accordion, teaser, form, embed, table...), grouped in sections (horizontal slabs separated by a horizontal rule, often with their own background or layout).

This pass is the FIRST LEVEL ONLY. The page body (between site header and site footer) has already been cut into CANDIDATE BANDS from the page's own structure: each candidate is one or more sibling elements; where siblings sit side by side, the candidate is marked as having columns. Each candidate's top is drawn on the strips as a dashed blue line labelled with its id. Candidates never cut through an element, so you cannot split one; you may MERGE a candidate into the one before it when the two are one thing for an author (a title above its cards; a quote inside an article).

Candidates (page pixels):
${cands.map((c) => `- ${c.id}: y ${c.top}–${c.bottom}${c.columns > 1 ? ` — ${c.columns} columns side by side (${c.parts.map((p) => `${p.w} px at x ${p.x}`).join(', ')})` : ''}`).join('\n')}

For every candidate, in order, answer:
- mergeWithPrevious: true when it belongs with the candidate before it (never for the first).
- kind, for THIS CANDIDATE ALONE (not for the merged band): "section" (this candidate alone already holds several different things: a title and a block, a block and paragraphs), "block" (this candidate is one component: a hero, a carousel, a cards grid, an accordion, a teaser...), "default_content" (this candidate is plain authored content: a title, paragraphs, a list, an image in flow, a breadcrumb).
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

// The bands after merging: ranges from the candidates; the kind derived — one kind
// throughout keeps it, mixed kinds make a section; the layout the widest named; labels joined.
export function merged(cands, answers) {
  const out = [];
  for (const [i, a] of answers.entries()) {
    const c = cands[i];
    if (a.mergeWithPrevious && out.length) {
      const last = out.at(-1); last.bottom = c.bottom; last.members.push(c.id); last.kinds.push(a.kind); last.layouts.push(a.layout); last.labels.push(a.label); last.confidence = Math.min(last.confidence, a.confidence);
    } else out.push({ id: `B${out.length + 1}`, top: c.top, bottom: c.bottom, members: [c.id], kinds: [a.kind], layouts: [a.layout], labels: [a.label], confidence: a.confidence });
  }
  return out.map((b) => ({ ...b, kind: new Set(b.kinds).size === 1 ? b.kinds[0] : 'section', layout: b.layouts.find((l) => l !== 'single') ?? 'single', label: [...new Set(b.labels)].join(' + ') }));
}

async function decompose(page) {
  const cpage = JSON.parse(readFileSync(`${page.id}/cpage.json`, 'utf8'));
  const { candidates } = JSON.parse(readFileSync(`${page.id}/candidates.json`, 'utf8'));
  const content = [];
  for (const [i, s] of cpage.strips.entries()) {
    content.push({ type: 'text', text: `Strip ${i + 1} of ${cpage.strips.length}: page y ${s.top}–${s.bottom}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(s.file).toString('base64') } });
  }
  content.push({ type: 'text', text: `${prompt(page.width, page.height, candidates)}\n\nPage: ${page.url}` });
  const t0 = Date.now();
  const res = await fetch(`${base}v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.AZ_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: EFFORT }, messages: [{ role: 'user', content }] }) });
  const j = await res.json();
  if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  const text = j.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const m = /\{[\s\S]*\}/.exec(text);
  let parsed = null, errors = ['no JSON'];
  if (m) { try { parsed = JSON.parse(m[0]); errors = validate(parsed, candidates); } catch (e) { errors = [`parse: ${e.message}`]; } }
  const [pi, po] = PRICES[MODEL];
  const cost = (j.usage.input_tokens * pi + j.usage.output_tokens * po) / 1e6;
  const bands = parsed && !errors.length ? merged(candidates, parsed.bands) : null;
  const out = { id: page.id, url: page.url, model: MODEL, effort: EFFORT, level: 1, guided: true, retry: Boolean(ONLY), ms: Date.now() - t0, usage: j.usage, cost, errors, answers: parsed, result: bands ? { bands, notes: parsed.notes } : null, raw: parsed ? undefined : text.slice(0, 2000) };
  writeFileSync(`${page.id}/${TAG}.json`, JSON.stringify(out, null, 1));
  return out;
}

const wall0 = Date.now();
const queue = [...index]; const done = [];
await Promise.all([1, 2, 3].map(async () => { while (queue.length) { const p = queue.shift(); try { done.push(await decompose(p)); } catch (e) { done.push({ id: p.id, error: e.message }); } } }));
for (const d of done.sort((a, b) => a.id.localeCompare(b.id))) {
  if (d.error) { console.log(d.id, 'ERROR', d.error.slice(0, 120)); continue; }
  const r = d.result;
  console.log(d.id, `${d.ms} ms`, `in ${d.usage.input_tokens} out ${d.usage.output_tokens}`, `$${d.cost.toFixed(4)}`, d.errors.length ? `INVALID ${d.errors.join('; ')}` : `bands ${r.bands.length} ${r.bands.map((b) => `${b.members.join('+')}:${b.kind[0]}${b.layout === 'single' ? '' : '/' + b.layout}`).join(' ')}`);
}
const ok = done.filter((d) => !d.error);
const sum = (f) => ok.reduce((n, d) => n + f(d), 0);
const ledger = { model: MODEL, effort: EFFORT, level: 1, guided: true, pages: ok.length, failed: done.length - ok.length, wallMs: Date.now() - wall0, perPageMs: Math.round(sum((d) => d.ms) / ok.length), inputTokens: sum((d) => d.usage.input_tokens), outputTokens: sum((d) => d.usage.output_tokens), cost: Number(sum((d) => d.cost).toFixed(4)), invalid: ok.filter((d) => d.errors.length).length };
if (!ONLY) writeFileSync(`ledger-${TAG}.json`, JSON.stringify(ledger, null, 1));
console.log('LEDGER', JSON.stringify(ledger));
