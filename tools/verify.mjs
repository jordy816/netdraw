// Pixel-compare a NetDraw project with an original drawing (SVG or PNG), rendered by the same Chromium.
// usage: node tools/verify.mjs <project.netdraw> <original.svg|.png> [--scale 2] [--diff out.png] [--shot out.png]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { renderSVG, fontFaceCSS } from '../src/js/render.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME ||
  '/home/vs-code/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [projPath, origPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const scale = Number(opt('--scale', '2'));

const fonts = fontFaceCSS((n) => pathToFileURL(path.join(ROOT, 'src/fonts', `IBMPlexSans-${n}.ttf`)).href);
const page = (svg) => `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}` +
  `html,body{margin:0;background:#fff}</style></head><body>${svg}</body></html>`;

async function shoot(browser, svg, W, H) {
  const tmp = path.join(fs.mkdtempSync('/tmp/ndv-'), 'p.html');
  fs.writeFileSync(tmp, page(svg));
  const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  await pg.goto(pathToFileURL(tmp).href);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(300);
  const buf = await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  await pg.close();
  return PNG.sync.read(buf);
}

function crop(png, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) png.data.copy(out.data, y * w * 4, y * png.width * 4, y * png.width * 4 + w * 4);
  return out;
}

const doc = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const W = doc.page.width, H = doc.page.height;
const browser = await chromium.launch({ executablePath: CHROME });
const mine = await shoot(browser, renderSVG(doc), W, H);
let ref;
if (origPath.endsWith('.svg')) ref = await shoot(browser, fs.readFileSync(origPath, 'utf8'), W, H);
else ref = crop(PNG.sync.read(fs.readFileSync(origPath)), mine.width, mine.height);
await browser.close();

const diff = new PNG({ width: mine.width, height: mine.height });
const nAA = pixelmatch(mine.data, ref.data, diff.data, mine.width, mine.height, { threshold: 0 });
let exact = 0;
for (let i = 0; i < mine.data.length; i += 4) {
  if (mine.data[i] !== ref.data[i] || mine.data[i + 1] !== ref.data[i + 1] || mine.data[i + 2] !== ref.data[i + 2]) exact++;
}
if (opt('--diff')) fs.writeFileSync(opt('--diff'), PNG.sync.write(diff));
if (opt('--shot')) fs.writeFileSync(opt('--shot'), PNG.sync.write(mine));
console.log(`${path.basename(projPath)} vs ${path.basename(origPath)}: ${mine.width}x${mine.height}, ` +
  `differing pixels exact=${exact} pixelmatch=${nAA}`);
process.exit(exact === 0 ? 0 : 1);
