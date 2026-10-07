// Build a .vsdx from a .netdraw without Electron (development and tests).
//   node tools/vsdx-build.mjs in.netdraw out.vsdx [--font "IBM Plex Sans"] [--dark] [--no-images]
// Embedded SVG images (the Microsoft icons) are rasterised with Playwright's Chromium when it is installed.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildVsdx } from '../src/js/vsdx.js';
import { normalize } from '../src/js/model.js';

const require = createRequire(import.meta.url);
const { zip } = require('../app/zip.js');

export async function chromiumRasterizer() {
  const { chromium } = await import('playwright-core');
  const exe = process.env.NETDRAW_CHROME || '/home/vs-code/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ deviceScaleFactor: 4 });
  const rasterize = async (href, w, h, scale, bg) => {
    await page.setViewportSize({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)) });
    await page.setContent(`<html><body style="margin:0;background:${bg || 'transparent'}"><img src="${href.replace(/"/g, '&quot;')}" style="display:block;width:100vw;height:100vh;object-fit:contain"></body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    return page.screenshot({ omitBackground: !bg, type: 'png', scale: 'device' });
  };
  return { rasterize, close: () => browser.close() };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [inFile, outFile] = process.argv.slice(2);
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const doc = normalize(JSON.parse(fs.readFileSync(inFile, 'utf8')));
  let ras = null;
  if (!process.argv.includes('--no-images')) { try { ras = await chromiumRasterizer(); } catch (e) { console.error(`no rasteriser: ${e.message}`); } }
  const r = await buildVsdx(doc, { font: arg('--font') || undefined, dark: process.argv.includes('--dark'), rasterize: ras?.rasterize });
  if (ras) await ras.close();
  fs.writeFileSync(outFile, zip(r.files));
  console.log(`${outFile}: ${fs.statSync(outFile).size} bytes`, JSON.stringify(r.stats), r.warnings.join(' | '));
}
