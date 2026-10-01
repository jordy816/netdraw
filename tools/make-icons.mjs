// Render the app and file icons to PNG and pack them into .ico files (build/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'build');
const CHROME = process.env.CHROME || '/home/vs-code/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

const APP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<rect x="8" y="8" width="240" height="240" rx="56" fill="#0F172A"/>
<path d="M78 176 C138 176 118 80 178 80" fill="none" stroke="#2DD4BF" stroke-width="16" stroke-linecap="round"/>
<circle cx="74" cy="176" r="40" fill="#2563EB"/>
<rect x="56" y="162" width="36" height="24" rx="4" fill="none" stroke="#fff" stroke-width="7"/>
<path d="M74 186 V196 M64 197 H84" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
<circle cx="182" cy="80" r="40" fill="#D97706"/>
<path d="M160 93 H202 A11 11 0 0 0 204 72 A14 14 0 0 0 179 66 A11 11 0 0 0 162 75 A9 9 0 0 0 160 93 Z" fill="#fff"/>
</svg>`;

const FILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<path d="M48 12 H168 L216 60 V244 H48 Z" fill="#fff" stroke="#94A3B8" stroke-width="8" stroke-linejoin="round"/>
<path d="M168 12 V60 H216" fill="#E2E8F0" stroke="#94A3B8" stroke-width="8" stroke-linejoin="round"/>
<path d="M96 184 C140 184 126 116 168 116" fill="none" stroke="#0F766E" stroke-width="12" stroke-linecap="round"/>
<circle cx="92" cy="184" r="28" fill="#2563EB"/><circle cx="170" cy="116" r="28" fill="#D97706"/>
</svg>`;

const SIZES = [16, 24, 32, 48, 64, 128, 256];

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
for (const [name, svg] of [['icon', APP], ['file', FILE]]) {
  const pngs = [];
  for (const size of SIZES) {
    const pg = await browser.newPage({ viewport: { width: size, height: size } });
    await pg.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    const buf = await pg.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    pngs.push({ size, buf });
    await pg.close();
  }
  fs.writeFileSync(path.join(OUT, `${name}.ico`), ico(pngs));
  fs.writeFileSync(path.join(OUT, `${name}.png`), pngs[pngs.length - 1].buf);
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
}
await browser.close();
console.log('icons written to', OUT);
