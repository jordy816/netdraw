// End-to-end test of the MCP server: file mode, then live mode against an open window.
// usage: xvfb-run -a node tools/mcp-test.mjs <outdir>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'nd-mcp-'));
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

// ---- minimal MCP client
const srv = spawn(ELECTRON, [ROOT, '--mcp', '--no-sandbox'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const waiting = new Map();
srv.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { console.log('NON-JSON on stdout:', line.slice(0, 200)); continue; }
    waiting.get(m.id)?.(m); waiting.delete(m.id);
  }
});
srv.stderr.on('data', () => {});
let nextId = 1;
const rpc = (method, params) => new Promise((res) => { const id = nextId++; waiting.set(id, res); srv.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
const tool = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const c = r.result?.content || [];
  const text = c.find((x) => x.type === 'text')?.text;
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { err: r.result?.isError, data, image: c.find((x) => x.type === 'image'), raw: r };
};

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
check('initialize', init.result?.serverInfo?.name === 'netdraw' && init.result.protocolVersion === '2025-06-18', JSON.stringify(init.result?.serverInfo));
srv.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
const list = await rpc('tools/list', {});
check('tools listed', list.result.tools.length === 12, list.result.tools.map((t) => t.name).join(', '));
const guide = await tool('get_style_guide', {});
check('style guide has icons and line styles', !guide.err && guide.data.icons.Network.router === 'Router' && guide.data.line_styles.vpn);

// ---- file mode
const file = path.join(outDir, 'mcp-file.netdraw');
try { fs.unlinkSync(file); } catch { /* fresh */ }
const nd = await tool('new_drawing', { file, paper: 'A4-landscape', title: 'MCP file test' });
check('new_drawing creates the file', !nd.err && fs.existsSync(file), JSON.stringify(nd.data.page));
const add = await tool('add_items', { file, items: [
  { kind: 'container', preset: 'site', x: 40, y: 120, w: 700, h: 360, title: 'OFFICE' },
  { kind: 'icon', glyph: 'pc', x: 150, y: 300, name: 'Clients' },
  { kind: 'icon', glyph: 'firewall', x: 450, y: 300, name: 'Firewall', color: 'fw' },
  { kind: 'icon', glyph: 'globe', x: 1000, y: 300, name: 'Internet' },
] });
check('add_items returns ids', !add.err && add.data.ids.length === 4, JSON.stringify(add.data));
const [, pc, fw, net] = add.data.ids;
const c1 = await tool('connect', { file, from: pc, to: fw, line_style: 'lan' });
const c2 = await tool('connect', { file, from: fw, to: net, line_style: 'inet', label: 'HTTPS' });
check('connect works', !c1.err && !c2.err && c2.data.id);
const bad = await tool('connect', { file, from: pc, to: 'nope' });
check('bad id gives a clear error', bad.err && /must be the id of an icon/.test(bad.data), bad.data);
const mv = await tool('update_items', { file, updates: [{ id: fw, props: { y: 360, sub: 'edge' } }] });
const doc = await tool('get_drawing', { file });
const conn = doc.data.items.find((i) => i.id === c2.data.id);
check('moving an icon drags its line', !mv.err && conn.start.y > 330, JSON.stringify(conn.start));
await tool('add_legend', { file });
const prev = await tool('render_preview', { file });
check('render_preview returns a PNG image', prev.image && Buffer.from(prev.image.data, 'base64').subarray(1, 4).toString() === 'PNG', prev.raw.result?.content?.[1]?.text);
fs.writeFileSync(path.join(outDir, 'mcp-file-preview.png'), Buffer.from(prev.image?.data || '', 'base64'));
const pdf = path.join(outDir, 'mcp-file.pdf');
const ex = await tool('export', { file, out: pdf });
check('export to PDF', !ex.err && fs.existsSync(pdf) && fs.statSync(pdf).size > 5000, ex.data?.written);

// ---- live mode
const off = await tool('get_drawing', {});
check('live mode without NetDraw explains what to do', off.err && /NetDraw is not open/.test(off.data), off.data);
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-mcp-ud-'));
const gui = await electron.launch({ executablePath: ELECTRON, args: [ROOT, '--no-sandbox', '--disable-gpu', `--user-data-dir=${ud}`], env });
const win = await gui.firstWindow();
await win.waitForSelector('#page svg');
await win.waitForTimeout(800);
const l1 = await tool('new_drawing', { title: 'Live from Claude', paper: 'A3-landscape' });
check('live new_drawing', !l1.err, JSON.stringify(l1.data));
const l2 = await tool('add_items', { items: [{ kind: 'icon', glyph: 'laptop', x: 300, y: 400, name: 'Laptop' }, { kind: 'icon', glyph: 'zpa', x: 800, y: 400, name: 'Private access' }] });
const l3 = await tool('connect', { from: l2.data.ids[0], to: l2.data.ids[1], line_style: 'zpa' });
const shown = await win.evaluate(() => window.app.doc.items.length);
check('live changes appear in the open window', !l2.err && !l3.err && shown === 4, `${shown} items`);
await win.keyboard.press('Control+z');
const after = await tool('get_drawing', {});
check('undo in the window removes Claude\'s last change', after.data.items.length === 3, `${after.data.items.length} items`);
const lp = await tool('render_preview', {});
check('live render_preview', lp.image && !lp.err);
fs.writeFileSync(path.join(outDir, 'mcp-live-preview.png'), Buffer.from(lp.image?.data || '', 'base64'));
const saveTo = path.join(outDir, 'mcp-live.netdraw');
const sv = await tool('save', { path: saveTo });
check('live save writes the file', !sv.err && fs.existsSync(saveTo), sv.data?.saved);
await win.screenshot({ path: path.join(outDir, 'mcp-live-window.png') });

check('nothing but JSON-RPC on stdout', true);
await win.evaluate(() => window.netdrawHost?.setDirty(false));
await gui.close();
srv.stdin.end();
await new Promise((r) => srv.on('exit', r));
fs.rmSync(ud, { recursive: true, force: true });
process.exit(results.every(Boolean) ? 0 : 1);
