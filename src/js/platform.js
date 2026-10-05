// Host bridge. In the desktop app the preload script exposes window.netdrawHost (file dialogs, PNG rendering,
// clipboard). In a plain browser (development, tests) the same calls fall back to web APIs.
import { renderSVG, fontFaceCSS } from './render.js';

const E = typeof window !== 'undefined' ? window.netdrawHost : null;

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

const readAsDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
});

async function fontBase64(name) {
  const buf = await (await fetch(`fonts/IBMPlexSans-${name}.ttf`)).arrayBuffer();
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function canvasPng(svg, w, h, scale) {
  for (const n of ['Regular', 'Medium', 'SemiBold', 'Bold']) if (!FONT_CACHE[n]) FONT_CACHE[n] = await fontBase64(n);
  const withFonts = svg.replace(/^<svg([^>]*)>/, (m) => `${m}<style>${fontFaceCSS((n) => `data:font/ttf;base64,${FONT_CACHE[n]}`)}</style>`);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
const FONT_CACHE = {};

export const host = E ? {
  desktop: true,
  ...E,
  fontBase64: (n) => E.fontBase64(n),
} : {
  desktop: false,
  onCommand() {}, onOpenFile() {}, setTitle(t) { document.title = t; }, setDirty() {},
  async startupFile() { return null; },
  async openDialog() {
    const f = await pickFile('.netdraw,.json');
    return f ? { path: null, name: f.name, text: await f.text() } : null;
  },
  async readFile() { throw new Error('Not available in the browser'); },
  async saveFile({ text, suggestedName }) {
    download(suggestedName || 'diagram.netdraw', new Blob([text], { type: 'application/json' }));
    return null;
  },
  async exportSvg({ svg, suggestedName }) { download(suggestedName, new Blob([svg], { type: 'image/svg+xml' })); return suggestedName; },
  async exportPng({ svg, width, height, scale, suggestedName }) {
    download(suggestedName, await canvasPng(svg, width, height, scale)); return suggestedName;
  },
  async copyPng({ svg, width, height, scale }) {
    const blob = await canvasPng(svg, width, height, scale);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  },
  async pickImage() { const f = await pickFile('image/*'); return f ? readAsDataURL(f) : null; },
  async readClipboard() {
    try { return { text: await navigator.clipboard.readText() }; } catch { return {}; }
  },
  async writeClipboardText(t) { try { await navigator.clipboard.writeText(t); } catch { /* ignore */ } },
  async confirmDiscard() { return window.confirm('Discard unsaved changes?') ? 'discard' : 'cancel'; },
  async recent() { return []; },
  pathForFile() { return null; },
  fontBase64,
  version: 'web',
  toggleFullScreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); },
  async listTemplates() {
    try {
      const idx = await (await fetch('templates/index.json')).json();
      return Promise.all(idx.map(async (f) => ({ name: f.name, text: await (await fetch(`templates/${f.file}`)).text() })));
    } catch { return []; }
  },
  async exportPdf() { window.print(); return null; },
};

export { readAsDataURL, renderSVG };
