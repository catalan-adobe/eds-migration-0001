// Per site: what structure produced on judge-10 — pages, questions, depth, unresolved,
// node kinds, cost, and each page's tree in letters.
import fs from 'node:fs';
const B = process.env.B;
const walk = (ns, d = 1) => ns.flatMap((n) => [[n, d], ...walk(n.children ?? [], d + 1)]);
const letter = (k) => (k === 'default_content' ? 'd' : k[0]);
const tr = (n) => letter(n.kind) + (n.children ? `[${n.children.map(tr).join(' ')}]` : n.unresolved ? '?' : '');
for (const s of process.argv.slice(2)) {
  const M = `${B}/${s}/migration`;
  const sel = JSON.parse(fs.readFileSync(`${M}/pages/selections/judge-10.json`));
  const table = JSON.parse(fs.readFileSync(`${M}/pages/pages.json`));
  let pages = 0; let asked = 0; let tok = 0; let un = 0; let max = 0; const kinds = {}; const lines = [];
  for (const id of sel.pages) {
    const f = `${M}/pages/${id}/structure.candidates-system1.json`;
    if (!fs.existsSync(f)) continue;
    const st = JSON.parse(fs.readFileSync(f));
    pages += 1; tok += st.usage.inputTokens; asked += st.candidates.filter((c) => c.probabilities).length;
    for (const [n, d] of walk(st.bands)) {
      kinds[letter(n.kind)] = (kinds[letter(n.kind)] ?? 0) + 1;
      if (n.unresolved) un += 1;
      max = Math.max(max, d);
    }
    const url = table.pages.find((p) => p.id === id).url.replace(/^https?:\/\/[^/]+/, '');
    lines.push(`    ${url.slice(0, 48).padEnd(48)} ${st.bands.map(tr).join(' ').slice(0, 90)}`);
  }
  console.log(`${s.padEnd(12)} pages ${pages} asked ${asked} depth≤${max} unresolved ${un}`
    + ` ${JSON.stringify(kinds)} $/page ${((tok / pages) * 0.24e-6).toFixed(4)}`);
  if (process.env.TREES) lines.forEach((l) => console.log(l));
}
