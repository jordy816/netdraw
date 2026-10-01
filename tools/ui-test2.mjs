// Second UI pass: containers, connector editing, resize, align/distribute, export through the app.
// usage: xvfb-run -a node tools/ui-test2.mjs <project.netdraw> <outdir>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [proj, outDir = '/tmp'] = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

const app = await electron.launch({ executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'), args: [ROOT, '--no-sandbox', '--disable-gpu', proj], env });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(String(e)));
await win.setViewportSize({ width: 1600, height: 1000 });
await win.waitForSelector('#page svg');
await win.waitForTimeout(600);
const S = (x, y) => win.evaluate(([a, b]) => window.app.editor.toScreen(a, b), [x, y]);
const get = (id) => win.evaluate((i) => window.app.doc.items.find((x) => x.id === i), id);

// 1. drag a container by its title: contents come along
const zone = await win.evaluate(() => window.app.doc.items.find((i) => i.type === 'zone' && i.title === 'SITE'));
const inside = await win.evaluate((z) => window.app.doc.items.find((i) => i.type === 'node' && i.x > z.x && i.x < z.x + z.w && i.y > z.y && i.y < z.y + z.h), zone);
let p = await S(zone.x + 30, zone.y + 14);
await win.mouse.move(p.x, p.y); await win.mouse.down();
await win.mouse.move(p.x + 60, p.y + 40, { steps: 6 }); await win.mouse.up();
const z2 = await get(zone.id), n2 = await get(inside.id);
const dz = [z2.x - zone.x, z2.y - zone.y], dn = [n2.x - inside.x, n2.y - inside.y];
check('container drag moves its contents', dz[0] !== 0 && dz[0] === dn[0] && dz[1] === dn[1], `zone ${dz} node ${dn}`);
await win.keyboard.press('Control+z');

// 2. drag inside a container interior = marquee, not a move
p = await S(zone.x + zone.w / 2, zone.y + zone.h / 2);
const q = await S(zone.x + zone.w - 30, zone.y + zone.h - 30);
await win.mouse.move(p.x - 200, p.y - 120); await win.mouse.down();
await win.mouse.move(q.x, q.y, { steps: 6 }); await win.mouse.up();
const z3 = await get(zone.id);
const sel = await win.evaluate(() => window.app.editor.sel.size);
check('drag inside a container selects instead of moving', z3.x === zone.x && sel > 0, `${sel} selected`);
await win.keyboard.press('Escape');

// 3. resize a container from its SE handle
await win.evaluate((id) => window.app.editor.setSelection([id]), zone.id);
await win.waitForTimeout(100);
const h = await win.locator('#overlay .h-se').boundingBox();
await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await win.mouse.down();
await win.mouse.move(h.x + 60, h.y + 30, { steps: 5 }); await win.mouse.up();
const z4 = await get(zone.id);
check('resize handle changes size', z4.w > zone.w && z4.h > zone.h && z4.w % 10 === 0, `${zone.w}x${zone.h} -> ${z4.w}x${z4.h}`);
await win.keyboard.press('Control+z');

// 4. select a connector, drag its end onto another icon
const conn = await win.evaluate(() => window.app.doc.items.find((i) => i.type === 'connector' && i.to && i.from));
await win.evaluate((id) => window.app.editor.setSelection([id]), conn.id);
await win.evaluate(() => window.app.editor.setZoom(1));
await win.waitForTimeout(150);
await win.screenshot({ path: path.join(outDir, 'ui-3-connector.png') });
await win.evaluate(() => window.app.editor.fit());
await win.waitForTimeout(100);
const target = await win.evaluate((c) => window.app.doc.items.find((i) => i.type === 'node' && i.id !== c.to.id && i.id !== c.from.id && i.glyph === 'globe'), conn);
const ends = await win.locator('#overlay .h-end').all();
const eb = await ends[ends.length - 1].boundingBox();
const tp = await S(target.x - 10, target.y + 5);
await win.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2); await win.mouse.down();
await win.mouse.move(tp.x, tp.y, { steps: 10 }); await win.mouse.up();
const c2 = await get(conn.id);
check('dragging an end onto an icon re-attaches it', c2.to?.id === target.id, c2.to?.id);
await win.keyboard.press('Control+z');

// 5. double-click a connector adds a bend
const c3before = (await get(conn.id)).d;
const mid = await win.evaluate((id) => { const g = document.querySelector(`#page g[data-id="${id}"] path.hit`); const L = g.getTotalLength(); const pt = g.getPointAtLength(L * 0.3); return window.app.editor.toScreen(pt.x, pt.y); }, conn.id);
await win.mouse.dblclick(mid.x, mid.y);
const c3 = await get(conn.id);
check('double-click adds a bend', c3.d.length > c3before.length);
await win.keyboard.press('Control+z');

// 6. align + distribute three icons
const three = await win.evaluate(() => window.app.doc.items.filter((i) => i.type === 'node').slice(0, 3).map((n) => n.id));
await win.evaluate((ids) => window.app.editor.setSelection(ids), three);
await win.evaluate(() => window.app.command('align:top'));
const ys = await win.evaluate((ids) => ids.map((id) => { const n = window.app.doc.items.find((i) => i.id === id); return n.y - n.r; }), three);
check('align top lines up the discs', ys.every((y) => y === ys[0]), ys.join(','));
await win.evaluate(() => window.app.command('dist:h'));
const xs = await win.evaluate((ids) => ids.map((id) => window.app.doc.items.find((i) => i.id === id).x).sort((a, b) => a - b), three);
check('distribute horizontally evens the gaps', Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.02, xs.join(','));
await win.evaluate(() => { window.app.undo(); window.app.undo(); });

// 7. connect-mode + orthogonal routing
await win.keyboard.press('Escape');
await win.evaluate(() => { window.app.command('routeStyle:orthogonal'); window.app.command('mode:connect'); window.app.editor.fit(); });
const two = await win.evaluate(() => { const ns = window.app.doc.items.filter((i) => i.type === 'node'); const a = ns[0]; return [a, ns.find((n) => Math.abs(n.x - a.x) > 300 && Math.abs(n.y - a.y) > 100)]; });
const a = await S(two[0].x, two[0].y), b = await S(two[1].x, two[1].y);
await win.mouse.move(a.x, a.y); await win.mouse.down();
await win.mouse.move(b.x, b.y, { steps: 10 }); await win.mouse.up();
const made = await win.evaluate(() => window.app.doc.items.find((i) => i.id === [...window.app.editor.sel][0]));
check('connect mode draws an orthogonal connector', made?.type === 'connector' && /Q/.test(made.d) && made.from && made.to, made?.d);
await win.screenshot({ path: path.join(outDir, 'ui-4-ortho.png') });

// 8. Escape during a drag puts things back
await win.keyboard.press('Escape'); await win.keyboard.press('Escape');
await win.evaluate(() => window.app.editor.fit());
const nn = await win.evaluate(() => window.app.doc.items.find((i) => i.type === 'node'));
const pn = await S(nn.x, nn.y);
const undoDepth = await win.evaluate(() => window.app.undoStack.length);
await win.mouse.move(pn.x, pn.y); await win.mouse.down();
await win.mouse.move(pn.x + 50, pn.y + 50, { steps: 5 });
await win.keyboard.press('Escape');
await win.mouse.up();
const back = await get(nn.id);
check('Escape cancels a drag', back.x === nn.x && back.y === nn.y && (await win.evaluate(() => window.app.undoStack.length)) === undoDepth);

// 9. Ctrl+drag a container copies it with its contents and leaves the original intact
const z = await win.evaluate(() => window.app.doc.items.find((i) => i.type === 'zone' && i.title === 'AZURE'));
const countIn = (zz) => win.evaluate((b) => window.app.doc.items.filter((i) => i.type === 'node' && i.x > b.x && i.x < b.x + b.w && i.y > b.y && i.y < b.y + b.h).length, zz);
const before = await countIn(z);
const n0 = await win.evaluate(() => window.app.doc.items.length);
const pz = await S(z.x + 40, z.y + 14);
await win.evaluate((id) => window.app.editor.setSelection([id]), z.id);
await win.keyboard.down('Control');
await win.mouse.move(pz.x, pz.y); await win.mouse.down();
await win.mouse.move(pz.x + 20, pz.y + 260, { steps: 8 }); await win.mouse.up();
await win.keyboard.up('Control');
const after = await countIn(z);
const n1 = await win.evaluate(() => window.app.doc.items.length);
check('Ctrl+drag copies a container with contents', after === before && n1 > n0 + before, `inside ${before}->${after}, items ${n0}->${n1}`);
await win.keyboard.press('Control+z');
check('one undo removes the copy', (await win.evaluate(() => window.app.doc.items.length)) === n0);

check('no page errors', errors.length === 0, errors.join(' | '));
await win.evaluate(() => window.netdrawHost?.setDirty(false));
await app.close();
process.exit(results.every(Boolean) ? 0 : 1);
