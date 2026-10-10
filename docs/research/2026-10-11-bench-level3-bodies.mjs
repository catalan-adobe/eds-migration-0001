// Per site, three pages: the full shot with the body's edges drawn (red), top 2000 px.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const B = process.env.B;
const sharp = createRequire(`${B}/wkndadv/migration/.work/node_modules/x.js`)('sharp');
const sites = process.argv.slice(2);
const tiles = [];
for (const s of sites) {
  const M = `${B}/${s}/migration`;
  const t = JSON.parse(fs.readFileSync(`${M}/pages/pages.json`));
  const ids = t.pages.filter((p) => fs.existsSync(`${M}/pages/${p.id}/composition.json`)
    && fs.existsSync(`${M}/pages/${p.id}/shots/page.jpg`)).map((p) => p.id);
  for (const id of [ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)]) {
    const comp = JSON.parse(fs.readFileSync(`${M}/pages/${id}/composition.json`));
    const shot = `${M}/pages/${id}/shots/page.jpg`;
    const meta = await sharp(shot).metadata();
    const frs = comp.fragments ?? [];
    const top = Math.max(0, ...frs.filter((f) => f.bounds.y < 600).map((f) => f.bounds.y + f.bounds.height));
    const bottom = Math.min(meta.height, ...frs.filter((f) => f.bounds.y > 600).map((f) => f.bounds.y));
    const H = Math.min(meta.height, 3000); const W = meta.width;
    const svg = `<svg width="${W}" height="${H}"><rect x="0" y="${top}" width="${W}" height="${Math.max(0, Math.min(bottom, H) - top)}" fill="none" stroke="red" stroke-width="10"/>${bottom < H ? '' : ''}<text x="20" y="${H - 20}" font-size="60" fill="red">${s} ${top}-${bottom}/${meta.height}</text></svg>`;
    const img = await sharp(shot).extract({ left: 0, top: 0, width: W, height: H })
      .composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    tiles.push(await sharp(img).resize(300, 700, { fit: 'contain', background: '#fff' }).toBuffer());
  }
}
const cols = 6; const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 300 * cols, height: 700 * rows, channels: 3, background: '#999' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * 300, top: Math.floor(i / cols) * 700 })))
  .jpeg({ quality: 75 }).toFile(`${B}/${process.env.OUT}`);
