// UI pass for v1.1 features: dark mode, paper sizes, rulers, new-drawing dialog, legend, line labels, notes, find.
// usage: xvfb-run -a node tools/ui-test3.mjs <outdir>
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || '/tmp';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-ud-'));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

const launch = () => electron.launch({
  executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'),
  args: [ROOT, '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`], env,
});
let app = await launch();
let win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(String(e)));
await win.setViewportSize({ width: 1600, height: 1000 });
await win.waitForSelector('#page svg');
await win.waitForTimeout(500);

// 1. default page is A3 landscape and the panel says so
const page = await win.evaluate(() => window.app.doc.page);
check('new drawing is A3 landscape', page.width === 2100 && page.height === 1485, `${page.width}x${page.height}`);
const hint = await win.locator('#props .hint.paper').textContent();
check('paper hint shows millimetres', /420 × 297 mm/.test(hint), hint.trim());
check('rulers are visible', await win.locator('#ruler-x').isVisible());

// 2. paper preset A4 portrait
await win.locator('#props select[data-paper]').selectOption('A4-portrait');
const p2 = await win.evaluate(() => window.app.doc.page);
check('paper select resizes the page', p2.width === 1050 && p2.height === 1485, `${p2.width}x${p2.height}`);
await win.keyboard.press('Control+z');

// 3. new-drawing dialog with templates
await win.evaluate(() => { window.app.dirty = false; });
await win.keyboard.press('Control+n');
await win.waitForSelector('.modal .tpl');
const nTpl = await win.locator('.modal .tpl').count();
check('new dialog lists blank + templates', nTpl >= 6, `${nTpl} cards`);
await win.screenshot({ path: path.join(outDir, 'ui3-new-dialog.png') });
await win.locator('.modal .tpl').nth(3).click();
await win.locator('.modal .btn.primary').click();
await win.waitForTimeout(400);
const tplItems = await win.evaluate(() => window.app.doc.items.length);
check('template opens', tplItems > 30, `${tplItems} items`);

// 4. dark mode: UI dark, drawing preview inverted, export model untouched
await win.evaluate(() => window.app.command('theme:dark'));
await win.waitForTimeout(200);
const theme = await win.evaluate(() => ({ t: document.documentElement.dataset.theme, prev: document.querySelector('#stage').classList.contains('dark-preview'), bg: window.app.doc.page.background }));
check('dark theme applied with dark drawing preview', theme.t === 'dark' && theme.prev, JSON.stringify(theme));
check('document background stays white for export', theme.bg === '#fff');
await win.screenshot({ path: path.join(outDir, 'ui3-dark.png') });
await win.evaluate(() => window.app.command('darkPreview'));
const prev2 = await win.evaluate(() => document.querySelector('#stage').classList.contains('dark-preview'));
check('dark drawing preview can be switched off', prev2 === false);
await win.evaluate(() => window.app.command('darkPreview'));

// 5. label on a line
const cid = await win.evaluate(() => { const c = window.app.doc.items.find((i) => i.type === 'connector' && i.from && i.to); window.app.editor.setSelection([c.id]); return c.id; });
await win.evaluate(() => window.app.command('addLabel'));
await win.keyboard.type('443/TCP');
await win.keyboard.press('Enter');
const lab = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).label, cid);
check('line label added inline', lab === '443/TCP', lab);
const svgHas = await win.evaluate((id) => document.querySelector(`#page g[data-id="${id}"] text`)?.textContent, cid);
check('label rendered on the line', svgHas === '443/TCP');

// 6. note container wraps text
await win.evaluate(() => window.app.createFromSpec({ kind: 'zone', key: 'note' }, { x: 600, y: 600 }));
const lines = await win.evaluate(() => { const z = window.app.doc.items[window.app.doc.items.findIndex((i) => i.type === 'zone' && i.body)]; return document.querySelectorAll(`#page g[data-id="${z.id}"] tspan`).length; });
check('note text wraps over several lines', lines >= 2, `${lines} lines`);

// 7. legend of used lines
const before = await win.evaluate(() => window.app.doc.items.length);
await win.evaluate(() => window.app.insertLegend());
const added = await win.evaluate(() => window.app.editor.selectedItems());
check('legend inserted as a group', added.length >= 4 && new Set(added.map((i) => i.group)).size === 1, `${added.length} items`);
check('legend labels are generic names', added.filter((i) => i.type === 'text').every((t) => !/zscaler|zia|zpa/i.test(t.text)), added.filter((i) => i.type === 'text').map((t) => t.text).join(' | '));
void before;

// 8. find
await win.keyboard.press('Control+f');
await win.waitForSelector('.modal input');
await win.keyboard.type('Policy');
await win.keyboard.press('Enter');
await win.waitForTimeout(200);
const found = await win.evaluate(() => window.app.editor.selectedItems().map((i) => i.name || i.text));
check('find selects matching items', found.some((t) => /Policy/.test(t)), found.join(','));

// 9. autosave + recovery after a crash-like exit
await win.evaluate(() => { window.app.markDirty(); window.app.autosave(); });
await win.waitForTimeout(300);
check('autosave file written', fs.existsSync(path.join(userData, 'autosave.json')));
await app.evaluate(({ app: a }) => a.exit(0));
app = await launch();
win = await app.firstWindow();
await win.waitForSelector('.modal', { timeout: 15000 }).catch(() => null);
const title = await win.locator('.modal h3').textContent().catch(() => '');
check('recovery offered on next start', /Recover/.test(title), title);
await win.locator('.modal .btn.primary').click();
await win.waitForTimeout(300);
const rec = await win.evaluate(() => ({ n: window.app.doc.items.length, dirty: window.app.dirty }));
check('recovered drawing is loaded and marked unsaved', rec.n > 30 && rec.dirty, JSON.stringify(rec));

// 10. light mode screenshot with rulers for review
await win.evaluate(() => window.app.command('theme:light'));
await win.waitForTimeout(200);
await win.screenshot({ path: path.join(outDir, 'ui3-light.png') });

check('no page errors', errors.length === 0, errors.join(' | '));
await win.evaluate(() => { window.netdrawHost?.setDirty(false); window.netdrawHost?.clearAutosave(); });
await app.close();
fs.rmSync(userData, { recursive: true, force: true });
process.exit(results.every(Boolean) ? 0 : 1);
