// End-to-end UI test: launches the desktop app (under xvfb on Linux) and exercises the editor.
// usage: xvfb-run -a node tools/ui-test.mjs <project.netdraw> <outdir>
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [proj, outDir = '/tmp'] = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const results = [];
const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

const app = await electron.launch({
  executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'),
  args: [ROOT, '--no-sandbox', '--disable-gpu', ...(proj ? [proj] : [])], env,
});
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(String(e)));
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await win.setViewportSize({ width: 1600, height: 1000 });
await win.waitForSelector('#page svg');
await win.waitForTimeout(800);
const count = () => win.evaluate(() => window.app.doc.items.length);
const n0 = await count();
check('project loaded', n0 > 0 || !proj, `${n0} items`);
await win.screenshot({ path: path.join(outDir, 'ui-1-open.png') });

// 1. drag a palette icon (firewall) onto the canvas
const vp = await win.locator('#viewport').boundingBox();
const tile = win.locator('#palette .tile[title="Firewall"]').first();
const tb = await tile.boundingBox();
await win.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await win.mouse.down();
await win.mouse.move(vp.x + 300, vp.y + 300, { steps: 8 });
await win.mouse.move(vp.x + 320, vp.y + 320, { steps: 4 });
await win.mouse.up();
const n1 = await count();
check('palette drag adds an icon', n1 === n0 + 1, `${n0} -> ${n1}`);

// 2. move an attached node and check its connector follows
const info = await win.evaluate(() => {
  const d = window.app.doc;
  const c = d.items.find((i) => i.type === 'connector' && i.from && i.to);
  if (!c) return null;
  const n = d.items.find((i) => i.id === c.from.id);
  return { cid: c.id, nid: n.id, d: c.d, x: n.x, y: n.y };
});
if (info) {
  const pt = await win.evaluate(({ x, y }) => window.app.editor.toScreen(x, y), info);
  await win.mouse.move(pt.x, pt.y);
  await win.mouse.down();
  await win.mouse.move(pt.x + 40, pt.y + 30, { steps: 6 });
  await win.mouse.up();
  const after = await win.evaluate(({ cid, nid }) => {
    const d = window.app.doc;
    return { d: d.items.find((i) => i.id === cid).d, n: d.items.find((i) => i.id === nid) };
  }, info);
  check('node moved', after.n.x !== info.x || after.n.y !== info.y, `${info.x},${info.y} -> ${after.n.x},${after.n.y}`);
  check('attached connector followed', after.d !== info.d);
  await win.keyboard.press('Control+z');
  const undone = await win.evaluate(({ cid, nid }) => {
    const d = window.app.doc;
    return { d: d.items.find((i) => i.id === cid).d, n: d.items.find((i) => i.id === nid) };
  }, info);
  check('undo restores node and connector', undone.n.x === info.x && undone.n.y === info.y && undone.d === info.d);
  await win.keyboard.press('Control+y');
  const redone = await win.evaluate(({ nid }) => window.app.doc.items.find((i) => i.id === nid).x, info);
  check('redo re-applies', redone === after.n.x);
  await win.keyboard.press('Control+z');
}

// 3. draw a connector between two nodes via a port
const pair = await win.evaluate(() => {
  const ns = window.app.doc.items.filter((i) => i.type === 'node');
  return ns.length >= 2 ? [ns[0], ns[1]].map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r })) : null;
});
if (pair) {
  const [a, b] = pair;
  const c0 = await count();
  const pa = await win.evaluate(({ x, y }) => window.app.editor.toScreen(x, y), a);
  await win.mouse.move(pa.x, pa.y);
  await win.waitForTimeout(100);
  const port = await win.evaluate(({ x, y, r }) => window.app.editor.toScreen(x + r, y), a);
  await win.mouse.move(port.x, port.y);
  await win.waitForTimeout(100);
  await win.mouse.down();
  const pb = await win.evaluate(({ x, y }) => window.app.editor.toScreen(x, y), b);
  await win.mouse.move(pb.x, pb.y, { steps: 10 });
  await win.mouse.up();
  const made = await win.evaluate(() => { const s = [...window.app.editor.sel]; return window.app.doc.items.find((i) => i.id === s[0]); });
  check('port drag creates a connector', (await count()) === c0 + 1 && made?.type === 'connector', made ? made.d : 'none');
  check('new connector attached both ends', !!(made?.from && made?.to));
  await win.keyboard.press('Control+z');
}

// 4. inline edit of a node name
const nn = await win.evaluate(() => { const n = window.app.doc.items.find((i) => i.type === 'node'); return { id: n.id, x: n.x, y: n.y, name: n.name }; });
const pn = await win.evaluate(({ x, y }) => window.app.editor.toScreen(x, y), nn);
await win.mouse.dblclick(pn.x, pn.y);
await win.waitForTimeout(150);
await win.keyboard.type('Renamed');
await win.keyboard.press('Control+Enter');
const renamed = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).name, nn.id);
check('inline edit renames', renamed === 'Renamed', renamed);
await win.keyboard.press('Control+z');

// 5. properties panel edit (colour) on a selected node
await win.mouse.click(pn.x, pn.y);
await win.waitForTimeout(100);
const hex = win.locator('#props input[data-hex][data-k="color"]');
await hex.fill('#B91C1C');
await hex.press('Enter');
const col = await win.evaluate((id) => window.app.doc.items.find((i) => i.id === id).color, nn.id);
check('properties panel sets colour', col === '#B91C1C', col);
await win.screenshot({ path: path.join(outDir, 'ui-2-selected.png') });
await win.keyboard.press('Control+z');

// 6. marquee select
await win.mouse.click(vp.x + 5, vp.y + 5);
await win.keyboard.press('Escape');
await win.evaluate(() => window.app.editor.fit());
await win.mouse.move(vp.x + 8, vp.y + 8);
await win.mouse.down();
await win.mouse.move(vp.x + vp.width - 8, vp.y + vp.height - 8, { steps: 6 });
await win.mouse.up();
const selN = await win.evaluate(() => window.app.editor.sel.size);
check('marquee selects items', selN > 5, `${selN}`);
await win.keyboard.press('Escape');

// 7. copy / paste / delete
await win.mouse.click(pn.x, pn.y);
const c1 = await count();
await win.keyboard.press('Control+c');
await win.keyboard.press('Control+v');
await win.waitForTimeout(200);
check('copy + paste adds a copy', (await count()) === c1 + 1);
await win.keyboard.press('Delete');
check('delete removes it', (await count()) === c1);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(path.join(outDir, 'ui-results.json'), JSON.stringify(results));
await win.evaluate(() => window.netdrawHost?.setDirty(false));
await app.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
