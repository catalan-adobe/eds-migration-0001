// Per project: the judge-10 structures — pages, questions, depth, unresolved, kinds, cost,
// the method's wording — and the review's age.
import fs from 'node:fs';
const walk = (ns, d = 1) => ns.flatMap((n) => [[n, d], ...walk(n.children ?? [], d + 1)]);
const letter = (k) => (k === 'default_content' ? 'd' : k[0]);
for (const proj of process.argv.slice(2)) {
  const M = `${proj}/migration`;
  const sel = JSON.parse(fs.readFileSync(`${M}/pages/selections/judge-10.json`));
  let pages = 0; let asked = 0; let tok = 0; let un = 0; let max = 0; const kinds = {};
  const wordings = new Set();
  for (const id of sel.pages) {
    const f = `${M}/pages/${id}/structure.candidates-system1.json`;
    if (!fs.existsSync(f)) continue;
    const st = JSON.parse(fs.readFileSync(f));
    pages += 1; tok += st.usage.inputTokens; wordings.add(st.method.wording);
    asked += st.candidates.filter((c) => c.probabilities).length;
    for (const [n, d] of walk(st.bands)) {
      kinds[letter(n.kind)] = (kinds[letter(n.kind)] ?? 0) + 1;
      if (n.unresolved) un += 1;
      max = Math.max(max, d);
    }
  }
  const review = fs.statSync(`${M}/views/structure-judge-10.html`).mtime.toISOString().slice(5, 16);
  const name = proj.split('/').at(-1);
  console.log(`${name.padEnd(20)} ${pages}/10 asked ${String(asked).padStart(3)} depth≤${max}`
    + ` unresolved ${un} ${JSON.stringify(kinds).padEnd(36)} $${((tok / pages) * 0.24e-6).toFixed(4)}`
    + ` wording ${[...wordings].join(',')} review ${review}`);
}
