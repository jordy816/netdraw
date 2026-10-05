// NetDraw MCP server (stdio, JSON-RPC 2.0, newline-delimited). Started by `NetDraw.exe --mcp`.
// Without "file": works on the drawing open in NetDraw (live, every change is one undo step).
// With "file": reads and writes that .netdraw file directly; NetDraw does not have to be open.
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { pipePath, onLines } = require('./pipe');

const APP = process.env.NETDRAW_APP || path.join(__dirname, '..');
const SRC = path.join(APP, 'src');
const VERSION = (() => { try { return require(path.join(APP, 'package.json')).version; } catch { return '0'; } })();
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

let apiModule = null;
const api = async () => (apiModule ||= await import(pathToFileURL(path.join(SRC, 'js', 'api.js')).href));

// ------------------------------------------------------------------------------------------------ tools
const FILE = { type: 'string', description: 'Path of a .netdraw file to work on directly. Leave out to work on the drawing open in NetDraw.' };
const TOOLS = [
  {
    name: 'get_style_guide',
    description: 'Icon keys, line styles, containers, text presets, colours, paper sizes and layout rules of NetDraw. Call this first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_drawing',
    description: 'Page size and every item (id, type, icon, names, positions, connections) of the drawing.',
    inputSchema: { type: 'object', properties: { file: FILE } },
  },
  {
    name: 'new_drawing',
    description: 'Start a new drawing on a paper size (default A3-landscape), optionally with a title and subtitle. With "file" a new file is created there.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Create this .netdraw file instead of a new drawing in the open NetDraw window.' },
        paper: { type: 'string', description: 'e.g. A4-landscape, A3-landscape, A2-landscape, A3-portrait, slide, wide' },
        title: { type: 'string' }, subtitle: { type: 'string' },
        discard_unsaved: { type: 'boolean', description: 'Allow replacing an open drawing that has unsaved changes.' },
      },
    },
  },
  {
    name: 'add_items',
    description: 'Add icons, containers, notes, texts and numbered markers in one call. Returns their ids in the same order. ' +
      'icon: {kind:"icon", glyph, x, y, name, sub, color?, badge?, vendor?, inactive?, style?} (vendor = brand like fortinet, cisco, cloudflare: vendor colour + logo badge); container: {kind:"container", preset?, x, y, w?, h?, title?, sub?, body?}; ' +
      'note: {kind:"note", x, y, w, h, title?, body}; text: {kind:"text", preset?, x, y, text, size?, color?, anchor?, wrap?}; marker: {kind:"marker", x, y, text, color?}. ' +
      'x/y of an icon is its disc centre; of a container its top-left corner; of a text its anchor on the baseline.',
    inputSchema: {
      type: 'object',
      required: ['items'],
      properties: { file: FILE, items: { type: 'array', items: { type: 'object' } } },
    },
  },
  {
    name: 'connect',
    description: 'Draw a line from one icon to another. It is routed automatically and stays attached when icons move.',
    inputSchema: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        file: FILE, from: { type: 'string', description: 'id of the start icon' }, to: { type: 'string', description: 'id of the end icon' },
        line_style: { type: 'string', description: 'Line style key from get_style_guide, e.g. wan, zia, zpa, inet, lan, vpn, deny. Default zia.' },
        route: { type: 'string', enum: ['curve', 'orthogonal', 'straight'] },
        label: { type: 'string', description: 'Text shown on the line, e.g. a protocol or port.' },
      },
    },
  },
  {
    name: 'update_items',
    description: 'Change items: [{id, props}]. Props are item fields, e.g. name, sub, x, y (moving an icon drags its lines along), color, title, body, text, label, badge, line_style. null removes a field.',
    inputSchema: {
      type: 'object',
      required: ['updates'],
      properties: { file: FILE, updates: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, props: { type: 'object' } }, required: ['id', 'props'] } } },
    },
  },
  {
    name: 'delete_items',
    description: 'Delete items by id. Lines attached to a deleted icon stay but come loose.',
    inputSchema: { type: 'object', required: ['ids'], properties: { file: FILE, ids: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'add_legend',
    description: 'Add a legend for every line style used, below the drawing (or at x, y).',
    inputSchema: { type: 'object', properties: { file: FILE, x: { type: 'number' }, y: { type: 'number' } } },
  },
  {
    name: 'render_preview',
    description: 'Picture of the drawing as PNG, to check the layout: lines crossing labels, text outside containers, overlaps.',
    inputSchema: { type: 'object', properties: { file: FILE, scale: { type: 'number', description: 'Default fits ~1600 px wide.' }, dark: { type: 'boolean', description: 'Dark colours instead of white.' } } },
  },
  {
    name: 'export',
    description: 'Export to PNG (scale 2 = screen/Word), PDF (vector, paper size) or SVG. The format follows the extension of "out".',
    inputSchema: { type: 'object', required: ['out'], properties: { file: FILE, out: { type: 'string' }, scale: { type: 'number' }, dark: { type: 'boolean', description: 'Export in dark colours (default white).' } } },
  },
  {
    name: 'save',
    description: 'Save the drawing open in NetDraw (to its file, or to "path"). Not needed with "file": file changes are written immediately.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Target .netdraw file (required if the drawing has no file yet).' } } },
  },
  {
    name: 'open_in_netdraw',
    description: 'Open a .netdraw file in the NetDraw window (starts NetDraw if it is not running).',
    inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' } } },
  },
];

const INSTRUCTIONS = 'NetDraw draws network and architecture diagrams in one consistent house style. Start with get_style_guide. ' +
  'Build with add_items (containers first, then icons), connect icons with connect, add numbered markers and notes to explain flows, ' +
  'then add_legend. Always look at render_preview and fix lines that cross labels or icons before you finish. Without "file" you work ' +
  'on the drawing open in NetDraw, live, and the user sees every step.';

// ------------------------------------------------------------------------------------------------ live (the open window)
function live(method, params) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(pipePath());
    const id = Math.random().toString(36).slice(2);
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; sock.destroy(); fn(v); } };
    sock.on('connect', () => sock.write(`${JSON.stringify({ id, method, params })}\n`));
    onLines(sock, (line) => {
      const m = JSON.parse(line);
      if (m.id !== id) return;
      if (m.error) finish(reject, new Error(m.error)); else finish(resolve, m.result);
    });
    sock.on('error', (e) => finish(reject, ['ENOENT', 'ECONNREFUSED'].includes(e.code)
      ? new Error('NetDraw is not open. Start NetDraw (or call open_in_netdraw), or pass "file" to work on a .netdraw file directly.') : e));
    setTimeout(() => finish(reject, new Error('NetDraw did not answer within 60 s')), 60000);
  });
}

// ------------------------------------------------------------------------------------------------ file mode
function runExport(file, out, scale, dark = false) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = [];
    if (path.basename(process.env.NETDRAW_ELECTRON || '').toLowerCase().startsWith('electron')) args.push(APP);
    args.push('--export', file, '--out', out, '--scale', String(scale));
    if (dark) args.push('--dark');
    if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu');
    const p = spawn(process.env.NETDRAW_ELECTRON || process.execPath, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (code) => (code === 0 && fs.existsSync(out) ? resolve(out) : reject(new Error(`export failed (${code}): ${err.split('\n').filter((l) => /export failed|Error/.test(l)).join(' ').slice(0, 400)}`))));
    p.on('error', reject);
  });
}

async function fileCall(method, a) {
  const A = await api();
  const file = path.resolve(a.file);
  if (method === 'new_drawing') {
    if (fs.existsSync(file) && !a.discard_unsaved) throw new Error(`${file} already exists (pass discard_unsaved: true to overwrite)`);
    const doc = A.newDrawing(a);
    fs.writeFileSync(file, JSON.stringify(doc, null, 1));
    return { file, page: A.summary(doc).page, ids: doc.items.map((i) => i.id) };
  }
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (method === 'render_preview' || method === 'export') {
    const doc = A.M.normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (method === 'export') return { written: await runExport(file, path.resolve(a.out), a.scale || 2, !!a.dark) };
    const scale = Math.max(0.2, Math.min(2, Number(a.scale) || Math.min(1, 1600 / doc.page.width)));
    const tmp = path.join(os.tmpdir(), `netdraw-preview-${process.pid}-${Date.now()}.png`);
    await runExport(file, tmp, scale, !!a.dark);
    const png = fs.readFileSync(tmp).toString('base64');
    fs.unlinkSync(tmp);
    return { png, width: Math.round(doc.page.width * scale), height: Math.round(doc.page.height * scale) };
  }
  const doc = A.M.normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  const r = A.call(doc, method, a);
  if (r.changed) fs.writeFileSync(file, JSON.stringify(r.doc, null, 1));
  return r.result;
}

function openInNetDraw(file) {
  return live('open', { file: path.resolve(file) }).catch(() => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = path.basename(process.env.NETDRAW_ELECTRON || '').toLowerCase().startsWith('electron') ? [APP, path.resolve(file)] : [path.resolve(file)];
    const p = spawn(process.env.NETDRAW_EXE || process.execPath, args, { env, detached: true, stdio: 'ignore', windowsHide: false });
    p.unref();
    return { opened: path.resolve(file), started: true };
  });
}

async function callTool(name, a = {}) {
  if (!TOOLS.find((t) => t.name === name)) throw new Error(`Unknown tool ${name}`);
  if (name === 'get_style_guide') return (await api()).styleGuide();
  if (name === 'open_in_netdraw') return openInNetDraw(a.file);
  if (name === 'save') return live('save', a);
  const { file, ...params } = a;
  if (file) return fileCall(name, a);
  return live(name, params);
}

function toContent(name, result) {
  if (result && result.png) {
    return [{ type: 'image', data: result.png, mimeType: 'image/png' }, { type: 'text', text: `Preview ${result.width} × ${result.height} px` }];
  }
  return [{ type: 'text', text: JSON.stringify(result, null, name === 'get_style_guide' ? 1 : 0) }];
}

// ------------------------------------------------------------------------------------------------ JSON-RPC over stdio
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const pending = new Set();

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;   // notification (initialized, cancelled, ...)
  try {
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return send({
        jsonrpc: '2.0', id, result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'netdraw', title: 'NetDraw', version: VERSION },
          instructions: INSTRUCTIONS,
        },
      });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      try {
        const result = await callTool(params?.name, params?.arguments || {});
        return send({ jsonrpc: '2.0', id, result: { content: toContent(params.name, result), isError: false } });
      } catch (e) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e.message || e) }], isError: true } });
      }
    }
    if (method === 'resources/list') return send({ jsonrpc: '2.0', id, result: { resources: [] } });
    if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: [] } });
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    return send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message || e) } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    const p = handle(msg).finally(() => pending.delete(p));
    pending.add(p);
  }
});
process.stdin.on('end', async () => { await Promise.allSettled([...pending]); process.exit(0); });
