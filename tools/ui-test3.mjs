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

// 8b. resize an icon from a corner handle: disc grows, attached lines follow the edge
await win.evaluate(() => window.app.editor.fit());
const nodeR = await win.evaluate(() => {
  const n = window.app.doc.items.find((i) => i.type === 'node' && window.app.doc.items.some((c) => c.type === 'connector' && c.from?.id === i.id));
  window.app.editor.setSelection([n.id]);
  const c = window.app.doc.items.find((x) => x.type === 'connector' && x.from?.id === n.id);
  return { id: n.id, r: n.r, cid: c.id, d: c.d };
});
await win.waitForTimeout(100);
const se = await win.locator('#overlay .h-se').boundingBox();
await win.mouse.move(se.x + se.width / 2, se.y + se.height / 2); await win.mouse.down();
await win.mouse.move(se.x + 25, se.y + 25, { steps: 5 }); await win.mouse.up();
const grown = await win.evaluate(({ id, cid }) => ({ n: window.app.doc.items.find((i) => i.id === id), d: window.app.doc.items.find((i) => i.id === cid).d }), nodeR);
check('corner handle enlarges an icon', grown.n.r > nodeR.r && grown.n.glyphScale > 1, `r ${nodeR.r} -> ${grown.n.r}, glyph ×${grown.n.glyphScale}`);
check('attached line follows the bigger disc', grown.d !== nodeR.d);
await win.keyboard.press('Control+z');
const back = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).r, nodeR.id);
check('undo restores the size', back === nodeR.r);

// 8c. text: corner scales the font, side handle sets the wrap width
const tid = await win.evaluate(() => { const t = window.app.doc.items.find((i) => i.type === 'text' && i.size >= 20); window.app.editor.setSelection([t.id]); return { id: t.id, size: t.size }; });
await win.waitForTimeout(100);
const tse = await win.locator('#overlay .h-se').boundingBox();
await win.mouse.move(tse.x + 4, tse.y + 4); await win.mouse.down();
await win.mouse.move(tse.x + 60, tse.y + 30, { steps: 5 }); await win.mouse.up();
const ts = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).size, tid.id);
check('corner handle scales text', ts > tid.size, `${tid.size} -> ${ts}`);
const te = await win.locator('#overlay .h-e').boundingBox();
await win.mouse.move(te.x + 4, te.y + 4); await win.mouse.down();
await win.mouse.move(te.x - 120, te.y + 4, { steps: 5 }); await win.mouse.up();
const tw = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).wrap, tid.id);
check('side handle sets a wrap width', tw > 0, `wrap ${tw}`);

// 8e. dark export toggle: exports turn dark only when switched on
const light = await win.evaluate(() => window.app.exportDoc(false).svg.match(/<rect width="[\d.]+" height="[\d.]+" fill="([^"]+)"/)[1]);
await win.evaluate(() => window.app.command('darkExport'));
const dark = await win.evaluate(() => ({ bg: window.app.exportDoc(false).svg.match(/<rect width="[\d.]+" height="[\d.]+" fill="([^"]+)"/)[1], model: window.app.doc.page.background, on: window.app.darkExport }));
check('exports are white by default', light === '#fff', light);
check('"Export in dark" converts the export, not the drawing', dark.on && dark.bg === '#080808' && dark.model === '#fff', JSON.stringify(dark));
await win.evaluate(() => window.app.command('darkExport'));
check('dark export can be switched off again', await win.evaluate(() => !window.app.darkExport));

// 8f. presentation mode: tools hidden, view-only, Esc leaves
await win.keyboard.press('Escape');
const beforeDoc = await win.evaluate(() => JSON.stringify(window.app.doc));
await win.keyboard.press('F5');
await win.waitForTimeout(300);
const pres = await win.evaluate(() => ({
  cls: document.body.classList.contains('present'),
  toolbar: getComputedStyle(document.querySelector('#toolbar')).display,
  palette: getComputedStyle(document.querySelector('#palette')).display,
  props: getComputedStyle(document.querySelector('#props')).display,
  ruler: getComputedStyle(document.querySelector('#ruler-x')).display,
  bar: getComputedStyle(document.querySelector('#presentbar')).display,
  vw: document.querySelector('#viewport').getBoundingClientRect().width, ww: window.innerWidth,
}));
check('presentation mode hides the tools', pres.cls && pres.toolbar === 'none' && pres.palette === 'none' && pres.props === 'none' && pres.ruler === 'none' && pres.bar === 'flex', JSON.stringify(pres));
check('drawing uses the whole window', Math.abs(pres.vw - pres.ww) < 2, `${pres.vw} of ${pres.ww}`);
await win.screenshot({ path: path.join(outDir, 'ui3-present.png') });
const pnode = await win.evaluate(() => { const n = window.app.doc.items.find((i) => i.type === 'node'); return window.app.editor.toScreen(n.x, n.y); });
const pan0 = await win.evaluate(() => window.app.editor.panX);
await win.mouse.move(pnode.x, pnode.y); await win.mouse.down();
await win.mouse.move(pnode.x + 80, pnode.y + 40, { steps: 5 }); await win.mouse.up();
await win.mouse.dblclick(pnode.x + 80, pnode.y + 40);
await win.keyboard.press('Delete');
const pstate = await win.evaluate(() => ({ sel: window.app.editor.sel.size, pan: window.app.editor.panX, doc: JSON.stringify(window.app.doc), inline: !document.querySelector('#inline-edit').hidden }));
check('presentation mode is view-only (drag pans, nothing changes)', pstate.sel === 0 && pstate.pan !== pan0 && pstate.doc === beforeDoc && !pstate.inline, `sel ${pstate.sel}, pan ${pan0} -> ${pstate.pan}`);
await win.keyboard.press('Escape');
await win.waitForTimeout(200);
const back2 = await win.evaluate(() => ({ cls: document.body.classList.contains('present'), toolbar: getComputedStyle(document.querySelector('#toolbar')).display }));
check('Esc returns to editing', !back2.cls && back2.toolbar !== 'none', JSON.stringify(back2));

// 8d. connect-an-assistant dialog
await win.evaluate(() => { window.app.command('mcp'); });
await win.waitForSelector('.modal pre.code');
const mcpText = await win.locator('.modal pre.code').first().textContent();
check('MCP dialog shows the Claude Code command', /claude mcp add .*netdraw.*--mcp/.test(mcpText), mcpText);
await win.screenshot({ path: path.join(outDir, 'ui3-mcp.png') });
await win.locator('.modal .btn.primary').last().click();

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
