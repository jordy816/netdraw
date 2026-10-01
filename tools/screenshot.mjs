// README screenshot: open a drawing in the real app and capture the window. usage: xvfb-run -a node tools/screenshot.mjs file.netdraw out.png [dark]
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [file, out, dark] = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-shot-'));
const app = await electron.launch({ executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'), args: [ROOT, '--no-sandbox', '--disable-gpu', `--user-data-dir=${ud}`, file], env });
const win = await app.firstWindow();
await win.setViewportSize({ width: 1600, height: 960 });
await win.waitForSelector('#page svg');
await win.evaluate((d) => { window.app.command(d ? 'theme:dark' : 'theme:light'); window.app.editor.fit(); }, !!dark);
const node = await win.evaluate(() => window.app.doc.items.find((i) => i.type === 'node' && i.glyph === 'gear')?.id);
if (node) await win.evaluate((id) => window.app.editor.setSelection([id]), node);
await win.waitForTimeout(600);
await win.screenshot({ path: out });
await app.close();
fs.rmSync(ud, { recursive: true, force: true });
console.log('screenshot', out);
