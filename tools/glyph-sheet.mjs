// Contact sheet of every icon (set A, and set B where it exists) for visual review: node tools/glyph-sheet.mjs out.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { GLYPH_GROUPS, GLYPH_LABEL, glyphMarkup } from '../src/js/glyphs.js';
import { PALETTE, GLYPH_COLOR } from '../src/js/presets.js';
import { fontFaceCSS } from '../src/js/render.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || '/tmp/glyphs.png';
const COLS = 10, CW = 120, RH = 112;
let y = 30;
const parts = [];
for (const [group, keys] of GLYPH_GROUPS) {
  parts.push(`<text x="20" y="${y}" font-size="15" font-weight="700" fill="#475569">${group.replace('&', '&amp;')}</text>`);
  y += 20;
  keys.forEach((k, i) => {
    const cx = 60 + (i % COLS) * CW, cy = y + 36 + Math.floor(i / COLS) * RH;
    const c = PALETTE[GLYPH_COLOR[k] || 'client'] || '#2563EB';
    parts.push(`<circle cx="${cx}" cy="${cy}" r="32" fill="${c}"/>${glyphMarkup('A', k, cx, cy, '#fff', c)}`);
    parts.push(`<text x="${cx}" y="${cy + 52}" font-size="12" font-weight="600" fill="#0F172A" text-anchor="middle">${GLYPH_LABEL[k].replace('&', '&amp;')}</text>`);
  });
  y += Math.ceil(keys.length / COLS) * RH + 14;
}
const W = 40 + COLS * CW, H = y;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="IBM Plex Sans"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join('')}</svg>`;
const fonts = fontFaceCSS((n) => pathToFileURL(path.join(ROOT, 'src/fonts', `IBMPlexSans-${n}.ttf`)).href);
const tmp = path.join(fs.mkdtempSync('/tmp/gs-'), 's.html');
fs.writeFileSync(tmp, `<html><head><style>${fonts}body{margin:0}</style></head><body>${svg}</body></html>`);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/home/vs-code/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' });
const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await pg.goto(pathToFileURL(tmp).href);
await pg.evaluate(() => document.fonts.ready);
await pg.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await b.close();
console.log('sheet', out, W, H);
