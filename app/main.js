// Electron main process: window, native menu, file dialogs, PNG rendering and the command-line exporter.
//   NetDraw.exe [file.netdraw]
//   NetDraw.exe --export in.netdraw --out out.png [--scale 2] [--dark]     (also .svg, .pdf)
const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard, nativeImage, shell, nativeTheme, net: enet } = require('electron');
const { ClipboardItem } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const { pipePath, onLines } = require('./pipe');

const SRC = path.join(__dirname, '..', 'src');
const RECENT = () => path.join(app.getPath('userData'), 'recent.json');
const AUTOSAVE = () => path.join(app.getPath('userData'), 'autosave.json');
let win = null;
let dirty = false;
let forceClose = false;

// ------------------------------------------------------------------------------------------------ cli
function argValue(argv, k) {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
}

function fileArg(argv) {
  return argv.slice(1).find((a) => /\.(netdraw|json)$/i.test(a) && !a.startsWith('--') && fs.existsSync(a)) || null;
}

const cliExport = argValue(process.argv, '--export');
const mcpMode = process.argv.includes('--mcp');
// headless runs keep their own profile, so they never clash with an open NetDraw window
if (cliExport || mcpMode) app.setPath('userData', path.join(os.tmpdir(), 'netdraw-cli'));
const smokeOut = argValue(process.argv, '--smoke');   // test hook: open the editor, screenshot it, exit

// ------------------------------------------------------------------------------------------------ rendering
async function renderer() {
  return import(pathToFileURL(path.join(SRC, 'js', 'render.js')).href);
}

const dbgLog = (...a) => { if (process.env.NETDRAW_DEBUG) process.stderr.write(`[netdraw] ${a.join(' ')}\n`); };

async function renderPng(svg, width, height, scale) {
  const w = new BrowserWindow({
    show: false, width: Math.ceil(width), height: Math.ceil(height), useContentSize: true, frame: false,
    enableLargerThanScreen: true, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true },
  });
  try {
    dbgLog('load');
    await w.loadFile(path.join(SRC, 'export.html'));
    dbgLog('loaded');
    await w.webContents.executeJavaScript(
      `document.getElementById('c').innerHTML = ${JSON.stringify(svg)}; document.fonts.ready.then(() => true)`);
    dbgLog('svg set');
    const dbg = w.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: scale, mobile: false,
    });
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
    dbgLog('metrics set, capturing');
    const { data } = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    dbg.detach();
    return Buffer.from(data, 'base64');
  } finally {
    w.destroy();
  }
}

// Vector PDF at the page's physical size (print scale), fonts embedded by Chromium.
async function renderPdf(svg, wmm, hmm) {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true } });
  try {
    await w.loadFile(path.join(SRC, 'export.html'));
    const sized = svg.replace(/^<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, `<svg$1 width="${wmm}mm" height="${hmm}mm"`);
    const css = `@page{size:${wmm}mm ${hmm}mm;margin:0}html,body{margin:0;overflow:hidden}svg{display:block}`;
    await w.webContents.executeJavaScript(
      `document.getElementById('c').innerHTML = ${JSON.stringify(sized)};` +
      `const st = document.createElement('style'); st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st);` +
      'document.fonts.ready.then(() => true)');
    return await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { marginType: 'none' } });
  } finally {
    w.destroy();
  }
}

async function fontBase64(name) {
  return fs.readFileSync(path.join(SRC, 'fonts', `IBMPlexSans-${name}.ttf`)).toString('base64');
}

async function exportFile(inFile, outFile, scale) {
  dbgLog('import renderer');
  const R = await renderer();
  dbgLog('renderer imported');
  const { normalize } = await import(pathToFileURL(path.join(SRC, 'js', 'model.js')).href);
  const doc = normalize(JSON.parse(fs.readFileSync(inFile, 'utf8')));
  let svg = R.renderSVG(doc);
  if (process.argv.includes('--dark')) svg = R.darkSVG(svg);
  if (/\.pdf$/i.test(outFile)) {
    const k = doc.page.mmPerPx || 0.2;
    fs.writeFileSync(outFile, await renderPdf(svg, doc.page.width * k, doc.page.height * k));
  } else if (/\.svg$/i.test(outFile)) {
    const faces = {};
    for (const n of ['Regular', 'Medium', 'SemiBold', 'Bold']) faces[n] = await fontBase64(n);
    svg = svg.replace(/^(<svg[^>]*>)/, `$1\n<style>${R.fontFaceCSS((n) => `data:font/ttf;base64,${faces[n]}`)}</style>`);
    fs.writeFileSync(outFile, svg);
  } else {
    fs.writeFileSync(outFile, await renderPng(svg, doc.page.width, doc.page.height, scale));
  }
}

// ------------------------------------------------------------------------------------------------ file type (Windows)
// Per-user registration (HKCU, no admin rights): double-clicking a .netdraw file opens NetDraw.
function registerFileType() {
  if (process.platform !== 'win32') return 'File registration is only needed on Windows.';
  const { execFileSync } = require('child_process');
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const base = 'HKCU\\Software\\Classes';
  const keys = [
    [`${base}\\.netdraw`, 'NetDraw.Project'],
    [`${base}\\NetDraw.Project`, 'NetDraw diagram'],
    [`${base}\\NetDraw.Project\\DefaultIcon`, `"${exe}",0`],
    [`${base}\\NetDraw.Project\\shell\\open\\command`, `"${exe}" "%1"`],
  ];
  for (const [k, v] of keys) execFileSync('reg.exe', ['add', k, '/ve', '/d', v, '/f'], { windowsHide: true });
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NetDraw.lnk');
  const okLink = shell.writeShortcutLink(lnk, 'create', { target: exe, description: 'NetDraw diagram editor', icon: exe, iconIndex: 0 });
  return `Done. .netdraw files now open with NetDraw${okLink ? ', and NetDraw is in the Start menu' : ''}.\n\n${exe}`;
}

// ------------------------------------------------------------------------------------------------ automation
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

// The open window answers MCP requests on a private local pipe.
function startAutomationServer() {
  const where = pipePath();
  if (process.platform !== 'win32') { try { fs.unlinkSync(where); } catch { /* none */ } }
  const server = net.createServer((sock) => {
    onLines(sock, async (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      let reply;
      try { reply = { id: msg.id, ...(await handleAutomation(msg.method, msg.params || {})) }; } catch (e) { reply = { id: msg.id, error: String(e.message || e) }; }
      sock.write(`${JSON.stringify(reply)}\n`);
    });
    sock.on('error', () => {});
  });
  server.on('error', (e) => process.stderr.write(`automation pipe: ${e.message}\n`));
  server.listen(where, () => { if (process.platform !== 'win32') { try { fs.chmodSync(where, 0o600); } catch { /* ignore */ } } });
  app.on('will-quit', () => server.close());
}

async function handleAutomation(method, p) {
  if (!win) return { error: 'NetDraw window is not ready' };
  const js = (code) => win.webContents.executeJavaScript(code, true);
  if (method === 'ping') return { result: { version: app.getVersion(), file: await js('window.app.filePath') } };
  if (method === 'open') {
    if (!p.file || !fs.existsSync(p.file)) return { error: `File not found: ${p.file}` };
    await js(`window.app.openPath(${JSON.stringify(path.resolve(p.file))})`);
    return { result: { opened: p.file } };
  }
  if (method === 'render_preview' || method === 'export') {
    const snap = await js('window.app.api("snapshot")');
    const R = await renderer();
    const { normalize } = await import(pathToFileURL(path.join(SRC, 'js', 'model.js')).href);
    const doc = normalize(JSON.parse(snap.result.json));
    const svg = p.dark ? R.darkSVG(R.renderSVG(doc)) : R.renderSVG(doc);
    const k = doc.page.mmPerPx || 0.2;
    if (method === 'render_preview') {
      const scale = Math.max(0.2, Math.min(2, Number(p.scale) || Math.min(1, 1600 / doc.page.width)));
      return { result: { png: (await renderPng(svg, doc.page.width, doc.page.height, scale)).toString('base64'), width: Math.round(doc.page.width * scale), height: Math.round(doc.page.height * scale) } };
    }
    const out = path.resolve(p.out || '');
    if (!p.out) return { error: '"out" (target file) is required' };
    if (/\.pdf$/i.test(out)) fs.writeFileSync(out, await renderPdf(svg, doc.page.width * k, doc.page.height * k));
    else if (/\.svg$/i.test(out)) {
      const faces = {};
      for (const n of ['Regular', 'Medium', 'SemiBold', 'Bold']) faces[n] = await fontBase64(n);
      fs.writeFileSync(out, svg.replace(/^(<svg[^>]*>)/, `$1\n<style>${R.fontFaceCSS((n) => `data:font/ttf;base64,${faces[n]}`)}</style>`));
    } else fs.writeFileSync(out, await renderPng(svg, doc.page.width, doc.page.height, Number(p.scale) || 2));
    return { result: { written: out } };
  }
  const r = await js(`window.app.api(${JSON.stringify(method)}, ${JSON.stringify(p)})`);
  return r && r.error ? { error: r.error } : { result: r ? r.result : null };
}

// Claude Desktop config files that exist (or the default one), for "Connect to Claude".
function claudeDesktopConfigs() {
  const home = os.homedir();
  const out = [];
  if (process.platform === 'win32') {
    out.push(path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json'));
    const pk = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Packages');
    try {
      for (const d of fs.readdirSync(pk)) if (/^Claude_/i.test(d)) out.push(path.join(pk, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    } catch { /* no store install */ }
  } else if (process.platform === 'darwin') out.push(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  else out.push(path.join(home, '.config', 'Claude', 'claude_desktop_config.json'));
  const existing = out.filter((f) => fs.existsSync(path.dirname(f)));
  return existing.length ? existing : out.slice(0, 1);
}

function mcpInfo() {
  const entry = { command: exePath(), args: ['--mcp'] };
  return {
    exe: exePath(),
    desktop: JSON.stringify({ mcpServers: { netdraw: entry } }, null, 2),
    claudeCode: `claude mcp add --scope user netdraw -- "${exePath()}" --mcp`,
    configs: claudeDesktopConfigs(),
  };
}

function installClaudeDesktop() {
  const done = [];
  for (const f of claudeDesktopConfigs()) {
    let cfg = {};
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      try { cfg = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new Error(`${f} is not valid JSON; not changed.`); }
      fs.writeFileSync(`${f}.bak`, raw);
    } else fs.mkdirSync(path.dirname(f), { recursive: true });
    cfg.mcpServers = { ...(cfg.mcpServers || {}), netdraw: { command: exePath(), args: ['--mcp'] } };
    fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
    done.push(f);
  }
  return done;
}

// ------------------------------------------------------------------------------------------------ update check
// Asks GitHub for the latest release and compares it with this version. Nothing is downloaded or installed, and
// nothing about you or your drawings is sent. Uses the system's proxy and certificates.
const RELEASES_PAGE = 'https://github.com/jordy816/netdraw/releases/latest';

function newerVersion(latest, current) {
  const a = String(latest).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  const current = app.getVersion();
  if (process.env.NETDRAW_FAKE_LATEST) {   // test hook
    const latest = process.env.NETDRAW_FAKE_LATEST;
    return { current, latest, newer: newerVersion(latest, current), url: RELEASES_PAGE };
  }
  // GitHub redirects /releases/latest to /releases/tag/vX.Y.Z. That web link is not subject to the API's hourly
  // quota per IP address, which shared networks often exhaust. Only the redirect target is read.
  try {
    const target = await new Promise((resolve, reject) => {
      const req = enet.request({ method: 'HEAD', url: RELEASES_PAGE, redirect: 'manual' });
      const timer = setTimeout(() => { req.abort(); reject(new Error('timeout')); }, 8000);
      req.setHeader('User-Agent', `NetDraw/${current}`);
      req.on('redirect', (_status, _method, redirectUrl) => { clearTimeout(timer); resolve(redirectUrl); req.abort(); });
      req.on('response', (res) => { clearTimeout(timer); resolve(`status ${res.statusCode}`); });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
    const m = /\/releases\/tag\/v?(\d+(?:\.\d+)*)/.exec(target || '');
    if (!m) return { current, error: /^status/.test(target) ? `GitHub answered ${target.slice(7)}` : 'No release found' };
    return { current, latest: m[1], newer: newerVersion(m[1], current), url: target };
  } catch (e) {
    return { current, error: e.message === 'timeout' ? 'GitHub did not answer in time' : 'GitHub could not be reached' };
  }
}

// ------------------------------------------------------------------------------------------------ recent files
function recent() {
  try { return JSON.parse(fs.readFileSync(RECENT(), 'utf8')).filter((p) => fs.existsSync(p)); } catch { return []; }
}

function addRecent(p) {
  if (!p) return;
  const list = [p, ...recent().filter((x) => x !== p)].slice(0, 10);
  try { fs.writeFileSync(RECENT(), JSON.stringify(list)); } catch { /* ignore */ }
  app.addRecentDocument?.(p);
  buildMenu();
}

// ------------------------------------------------------------------------------------------------ window & menu
const send = (cmd) => win?.webContents.send('cmd', cmd);

function buildMenu() {
  const item = (label, cmd, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => send(cmd) });
  const rec = recent();
  const template = [
    {
      label: '&File',
      submenu: [
        item('&New…', 'new', 'Ctrl+N'), item('&Open…', 'open', 'Ctrl+O'),
        { label: 'Open &recent', submenu: rec.length ? rec.map((p) => ({ label: p, click: () => win?.webContents.send('cmd', 'openPath', p) })) : [{ label: '(empty)', enabled: false }] },
        { type: 'separator' },
        item('&Save', 'save', 'Ctrl+S'), item('Save &as…', 'saveAs', 'Ctrl+Shift+S'),
        { type: 'separator' },
        item('Export PNG for screen / Word (2×)…', 'exportPng:2', 'Ctrl+E'), item('Export PNG for print (300 dpi)…', 'exportPng:print', 'Ctrl+P'),
        item('Export PNG (1×)…', 'exportPng:1'), item('Export PDF (vector, paper size)…', 'exportPdf', 'Ctrl+Shift+P'),
        item('Export SVG…', 'exportSvg', 'Ctrl+Shift+E'), item('Export selection as PNG…', 'exportPngSel:2'),
        item('Copy as image', 'copyPng', 'Ctrl+Shift+C'), item('Export in dark colours (on / off)', 'darkExport'),
        { type: 'separator' },
        { label: 'E&xit', role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        item('&Undo', 'undo', 'Ctrl+Z'), item('&Redo', 'redo', 'Ctrl+Y'), { type: 'separator' },
        item('Cu&t', 'cut', 'Ctrl+X'), item('&Copy', 'copy', 'Ctrl+C'), item('&Paste', 'paste', 'Ctrl+V'),
        item('&Duplicate', 'duplicate', 'Ctrl+D'), item('Delete', 'delete', 'Delete'), { type: 'separator' },
        item('Select &all', 'selectAll', 'Ctrl+A'), item('Edit text', 'edit', 'F2'), item('&Find…', 'find', 'Ctrl+F'),
      ],
    },
    {
      label: '&Insert',
      submenu: [
        item('Legend of used line styles', 'legend'), item('Label on the selected line', 'addLabel', 'L'),
        item('Save selected line as a style…', 'saveflow'), item('Image / logo…', 'image'),
      ],
    },
    {
      label: '&Arrange',
      submenu: [
        item('Bring to front', 'front', 'Ctrl+Shift+]'), item('Bring forward', 'forward', 'Ctrl+]'),
        item('Send backward', 'backward', 'Ctrl+['), item('Send to back', 'back', 'Ctrl+Shift+['), { type: 'separator' },
        item('Group', 'group', 'Ctrl+G'), item('Ungroup', 'ungroup', 'Ctrl+Shift+G'), item('Lock / unlock', 'lock', 'Ctrl+L'),
        item('Unlock all', 'unlockall'), { type: 'separator' },
        item('Align left', 'align:left'), item('Align centres', 'align:hcenter'), item('Align right', 'align:right'),
        item('Align top', 'align:top'), item('Align middles', 'align:vcenter'), item('Align bottom', 'align:bottom'),
        item('Distribute horizontally', 'dist:h'), item('Distribute vertically', 'dist:v'), { type: 'separator' },
        item('Connect line ends to icons', 'autoattach'), item('Fit page to content', 'fitpage'),
      ],
    },
    {
      label: '&View',
      submenu: [
        item('Zoom in', 'zoomIn', 'Ctrl+='), item('Zoom out', 'zoomOut', 'Ctrl+-'), item('Fit to window', 'zoomFit', 'Ctrl+0'),
        item('Actual size', 'zoom100', 'Ctrl+1'), { type: 'separator' },
        item('Presentation mode', 'present', 'F5'), item('Full screen', 'fullscreen', 'F11'), { type: 'separator' }, item('Show grid', 'grid', 'G'), item('Show rulers (mm)', 'rulers', 'R'),
        item('Snap', 'snap'), { type: 'separator' },
        { label: 'Theme', submenu: [item('System', 'theme:system'), item('Light', 'theme:light'), item('Dark', 'theme:dark')] },
        item('Dark drawing preview (exports stay white)', 'darkPreview'),
        { label: 'Interface size', submenu: [item('100%', 'uiZoom:1'), item('115%', 'uiZoom:1.15'), item('130%', 'uiZoom:1.3'), item('150%', 'uiZoom:1.5')] },
        { type: 'separator' }, { label: 'Developer tools', accelerator: 'Ctrl+Shift+I', click: () => win?.webContents.toggleDevTools() },
      ],
    },
    {
      label: '&Help',
      submenu: [
        item('Keyboard and mouse', 'shortcuts'),
        item('Connect Claude / AI assistant (MCP)…', 'mcp'),
        item('Check for updates…', 'checkUpdate'),
        {
          label: 'Set up on this PC (Start menu, open .netdraw files)', click: () => {
            try { dialog.showMessageBox(win, { type: 'info', title: 'NetDraw', message: registerFileType() }); } catch (e) { dialog.showErrorBox('NetDraw', String(e.message || e)); }
          },
        },
        item('About NetDraw', 'about'),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(startFile) {
  win = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1000, minHeight: 640, backgroundColor: '#E9EDF2', show: false,
    title: 'NetDraw', icon: path.join(SRC, 'img', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.startFile = startFile;
  buildMenu();
  win.loadFile(path.join(SRC, 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  if (smokeOut) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const info = await win.webContents.executeJavaScript(
          'JSON.stringify({ items: window.app.doc.items.length, title: document.title, errors: window.__errors || [] })');
        const img = await win.webContents.capturePage();
        fs.writeFileSync(smokeOut, img.toPNG());
        process.stdout.write(`smoke ${info}\n`);
        app.exit(0);
      } catch (e) { process.stderr.write(`smoke failed: ${e.stack || e}\n`); app.exit(1); }
    }, 2500));
  }
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => {
    if (!dirty || forceClose) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Save', "Don't save", 'Cancel'], defaultId: 0, cancelId: 2,
      title: 'NetDraw', message: 'Save changes to this drawing before closing?',
    });
    if (r === 2) e.preventDefault();
    else if (r === 0) { e.preventDefault(); send('saveAndClose'); }
    else { try { fs.unlinkSync(AUTOSAVE()); } catch { /* none */ } }
  });
}

// ------------------------------------------------------------------------------------------------ ipc
function wireIpc() {
  ipcMain.handle('startupFile', () => win?.startFile || null);
  ipcMain.on('setTitle', (_e, t) => win?.setTitle(t));
  ipcMain.on('setDirty', (_e, d) => { dirty = !!d; });
  ipcMain.on('closeNow', () => { forceClose = true; win?.close(); });
  ipcMain.handle('readFile', (_e, p) => { const t = fs.readFileSync(p, 'utf8'); addRecent(p); return t; });
  ipcMain.handle('openDialog', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'NetDraw project', extensions: ['netdraw'] }, { name: 'All files', extensions: ['*'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    addRecent(p);
    return { path: p, text: fs.readFileSync(p, 'utf8') };
  });
  ipcMain.handle('saveFile', async (_e, { path: p, text, suggestedName }) => {
    let target = p;
    if (!target) {
      const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: [{ name: 'NetDraw project', extensions: ['netdraw'] }] });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    fs.writeFileSync(target, text, 'utf8');
    addRecent(target);
    return target;
  });
  ipcMain.handle('exportSvg', async (_e, { svg, suggestedName }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: [{ name: 'SVG image', extensions: ['svg'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, svg, 'utf8');
    return r.filePath;
  });
  ipcMain.handle('exportPng', async (_e, { svg, width, height, scale, suggestedName }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, await renderPng(svg, width, height, scale));
    return r.filePath;
  });
  ipcMain.handle('copyPng', async (_e, { svg, width, height, scale }) => {
    const png = await renderPng(svg, width, height, scale);
    if (typeof clipboard.writeImage === 'function') clipboard.writeImage(nativeImage.createFromBuffer(png));
    else await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    return true;
  });
  ipcMain.handle('pickImage', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  });
  // Electron 44 replaced the synchronous clipboard calls with an async, W3C-style API; support both.
  ipcMain.handle('readClipboard', async () => {
    if (typeof clipboard.readImage === 'function') {
      const img = clipboard.readImage();
      return { text: clipboard.readText(), image: img.isEmpty() ? null : img.toDataURL() };
    }
    let text = '', image = null;
    try { text = await clipboard.readText(); } catch { /* no text */ }
    try {
      for (const item of await clipboard.read()) {
        const t = item.types.find((x) => x.startsWith('image/'));
        if (!t) continue;
        const blob = await item.getType(t);
        image = `data:${t};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
        break;
      }
    } catch { /* no image */ }
    return { text, image };
  });
  ipcMain.on('writeClipboardText', (_e, t) => { const r = clipboard.writeText(t); if (r?.catch) r.catch(() => {}); });
  ipcMain.handle('confirmDiscard', async (_e, name) => {
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Save', "Don't save", 'Cancel'], defaultId: 0, cancelId: 2, title: 'NetDraw',
      message: `Save changes to ${name}?`,
    });
    return ['save', 'discard', 'cancel'][r.response];
  });
  ipcMain.handle('fontBase64', (_e, n) => fontBase64(n));
  ipcMain.handle('mcpInfo', () => mcpInfo());
  ipcMain.handle('checkUpdate', () => checkForUpdate());
  ipcMain.on('openReleasePage', (_e, url) => { if (/^https:\/\/github\.com\/jordy816\/netdraw\//.test(String(url))) shell.openExternal(url); });
  ipcMain.handle('mcpInstallDesktop', () => installClaudeDesktop());
  ipcMain.on('copyText', (_e, t) => { const r = clipboard.writeText(t); if (r?.catch) r.catch(() => {}); });
  ipcMain.on('version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.on('setTheme', (_e, t) => {
    nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system';
    win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0B0F17' : '#E9EDF2');
  });
  ipcMain.on('setPresenting', (_e, on) => {
    if (!win) return;
    win.setMenuBarVisibility(!on);
    if (!on && win.isFullScreen()) win.setFullScreen(false);
  });
  ipcMain.on('toggleFullScreen', () => win?.setFullScreen(!win.isFullScreen()));
  ipcMain.on('setUiZoom', (_e, f) => { const z = Number(f); if (z >= 0.5 && z <= 3) win?.webContents.setZoomFactor(z); });
  ipcMain.on('autosave', (_e, data) => {
    try { fs.writeFileSync(AUTOSAVE(), JSON.stringify({ ...data, time: Date.now() })); } catch { /* best effort */ }
  });
  ipcMain.on('clearAutosave', () => { try { fs.unlinkSync(AUTOSAVE()); } catch { /* none */ } });
  ipcMain.handle('recoverInfo', () => {
    try {
      const r = JSON.parse(fs.readFileSync(AUTOSAVE(), 'utf8'));
      return Date.now() - r.time < 30 * 864e5 ? r : null;
    } catch { return null; }
  });
  ipcMain.handle('listTemplates', () => {
    const dir = path.join(SRC, 'templates');
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.netdraw')).sort().map((f) => {
        const text = fs.readFileSync(path.join(dir, f), 'utf8');
        let name = f.replace(/^\d+-/, '').replace(/\.netdraw$/, '').replace(/-/g, ' ');
        try { name = JSON.parse(text).page.title || name; } catch { /* keep file name */ }
        return { name, text };
      });
    } catch { return []; }
  });
  ipcMain.handle('exportPdf', async (_e, { svg, wmm, hmm, suggestedName }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, await renderPdf(svg, wmm, hmm));
    return r.filePath;
  });
}

// ------------------------------------------------------------------------------------------------ start
if (mcpMode) {
  // MCP server over stdio. It runs in Node mode (reliable stdin/stdout on every platform) as a child of this process.
  const child = spawn(process.execPath, [path.join(__dirname, 'mcp.js')], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NETDRAW_EXE: exePath(), NETDRAW_ELECTRON: process.execPath, NETDRAW_APP: path.join(__dirname, '..') },
    windowsHide: true,
  });
  child.on('exit', (code) => app.exit(code ?? 0));
  child.on('error', (e) => { process.stderr.write(`netdraw mcp: ${e.message}\n`); app.exit(1); });
} else if (process.argv.includes('--setup')) {
  // scripted "Help > Set up on this PC"
  app.whenReady().then(() => {
    try { process.stdout.write(`${registerFileType()}\n`); app.exit(0); } catch (e) { process.stderr.write(`${e.message}\n`); app.exit(1); }
  });
} else if (cliExport) {
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    dbgLog('ready');
    const out = argValue(process.argv, '--out') || cliExport.replace(/\.(netdraw|json)$/i, '.png');
    const scale = Number(argValue(process.argv, '--scale') || 2);
    try {
      await exportFile(cliExport, out, scale);
      process.stdout.write(`exported ${out}\n`);
      app.exit(0);
    } catch (e) {
      process.stderr.write(`export failed: ${e.stack || e}\n`);
      app.exit(1);
    }
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send('openFile', path.resolve(f));
    }
  });
  app.whenReady().then(() => {
    wireIpc();
    const f = fileArg(process.argv);
    createWindow(f ? path.resolve(f) : null);
    startAutomationServer();
  });
  app.on('window-all-closed', () => app.quit());
}
