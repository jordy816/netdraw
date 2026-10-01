// Left panel: icons, containers, connector styles, text, markers, shapes and the user's own library.
import { GLYPH_GROUPS, GLYPH_LABEL, glyphMarkup } from './glyphs.js';
import {
  PALETTE, GLYPH_COLOR, NODE_STYLES, ZONE_PRESETS, FLOW_PRESETS, TEXT_PRESETS, BADGE_PRESETS,
} from './presets.js';
import { renderItem, esc, markerDefs } from './render.js';
import * as M from './model.js';

const LIB_KEY = 'netdraw.library.v1';
const FLOW_KEY = 'netdraw.flows.v1';

export class Palette {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.nodeStyle = 'overview';
    this.filter = '';
    try { this.nodeStyle = localStorage.getItem('netdraw.nodeStyle') || 'overview'; } catch { /* storage unavailable */ }
  }

  get ed() { return this.app.editor; }

  library() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch { return []; }
  }

  saveLibrary(lib) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); } catch { this.app.toast('Could not save the library'); }
  }

  customFlows() {
    try { return JSON.parse(localStorage.getItem(FLOW_KEY) || '[]'); } catch { return []; }
  }

  saveCustomFlows(list) {
    try { localStorage.setItem(FLOW_KEY, JSON.stringify(list)); } catch { this.app.toast('Could not save the line style'); }
  }

  allFlows() { return [...FLOW_PRESETS, ...this.customFlows()]; }

  render() {
    const st = NODE_STYLES[this.nodeStyle];
    const q = this.filter.toLowerCase();
    const groups = GLYPH_GROUPS.map(([name, keys]) => [name, keys.filter((g) => !q || GLYPH_LABEL[g].toLowerCase().includes(q) || g.includes(q) || name.toLowerCase().includes(q))])
      .filter(([, keys]) => keys.length);
    const tile = (spec, inner, title) =>
      `<button class="tile" data-spec='${esc(JSON.stringify(spec)).replace(/'/g, '&#39;')}' title="${esc(title)}">${inner}<span>${esc(title)}</span></button>`;
    const disc = (g) => {
      const c = PALETTE[GLYPH_COLOR[g] || 'client'];
      const inactive = g === 'nodc';
      return `<svg viewBox="-26 -26 52 52" width="40" height="40"><circle r="${st.r === 34 ? 24 : 23}" fill="${inactive ? '#fff' : c}"` +
        `${inactive ? ` stroke="${c}" stroke-width="2" stroke-dasharray="5 4"` : ''}/>` +
        `<g transform="scale(0.66)">${glyphMarkup(st.glyphSet, g, 0, 0, inactive ? c : '#fff', inactive ? '#fff' : c)}</g></svg>`;
    };
    const lib = this.library();
    const html = [];
    html.push('<div class="pal-search"><input id="pal-q" type="search" placeholder="Search icons…" value="' + esc(this.filter) + '"></div>');
    html.push('<details open><summary>Icons</summary><div class="seg" id="pal-style">' +
      Object.entries(NODE_STYLES).map(([k, s]) => `<button data-style="${k}" class="${k === this.nodeStyle ? 'on' : ''}">${s.label}</button>`).join('') +
      '</div>' + groups.map(([name, keys]) => `<div class="pal-group">${esc(name)}</div><div class="tiles icons">` +
        keys.map((g) => tile({ kind: 'node', glyph: g }, disc(g), GLYPH_LABEL[g])).join('') + '</div>').join('') +
      (groups.length ? '' : '<p class="hint">No icons match.</p>') + '</details>');
    if (!q) {
      html.push('<details open><summary>Containers</summary><div class="tiles zones">' +
        ZONE_PRESETS.map((p) => tile({ kind: 'zone', key: p.key },
          `<svg viewBox="0 0 48 32" width="48" height="32"><rect x="1.5" y="1.5" width="45" height="29" rx="${p.z.rx === 18 || p.key === 'pill' ? 14 : 5}" fill="${p.z.fill}" stroke="${p.z.stroke === 'none' ? p.z.fill : p.z.stroke}" stroke-width="1.5"${p.z.dash ? ' stroke-dasharray="4 3"' : ''}/>` +
          `${p.z.title ? `<rect x="${p.z.titleAlign === 'right' ? 26 : p.z.titleAlign === 'center' ? 14 : 6}" y="${p.key === 'pill' ? 14 : 6}" width="16" height="3" rx="1.5" fill="${p.z.titleColor || '#475569'}"/>` : ''}</svg>`, p.label)).join('') +
        '</div></details>');
      html.push('<details open><summary>Connectors</summary><div class="seg" id="pal-route">' +
        [['curve', 'Curve'], ['orthogonal', 'Orthogonal'], ['straight', 'Straight']].map(([k, l]) =>
          `<button data-route="${k}" class="${this.ed.routeStyle === k ? 'on' : ''}">${l}</button>`).join('') +
        '</div><div class="flows">' +
        this.allFlows().map((f) => `<div class="flowwrap"><button class="flow${this.ed.flow.key === f.key ? ' on' : ''}" data-flow="${esc(f.key)}" data-spec='${esc(JSON.stringify({ kind: 'flow', key: f.key }))}' title="Click to draw with this style, drag to drop a loose line">` +
          `<svg viewBox="0 0 54 12" width="54" height="12"><defs><marker id="pm-${esc(f.key)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${f.color}"/></marker></defs>` +
          `<line x1="${f.arrowStart ? 7 : 3}" y1="6" x2="${f.arrowEnd ? 47 : 51}" y2="6" stroke="${f.color}" stroke-width="${Math.min(f.width, 3)}" stroke-linecap="round"${f.dash ? ` stroke-dasharray="${f.dash}"` : ''}${f.arrowEnd ? ` marker-end="url(#pm-${esc(f.key)})"` : ''}${f.arrowStart ? ` marker-start="url(#pm-${esc(f.key)})"` : ''}/></svg>` +
          `<span>${esc(f.label)}</span></button>${f.custom ? `<button class="libdel" data-flowdel="${esc(f.key)}" title="Remove this line style">×</button>` : ''}</div>`).join('') +
        '</div><p class="hint">Pick a style, then drag from an icon\'s blue dot to another icon. Press <kbd>C</kbd> to draw from anywhere on an icon.</p></details>');
      html.push('<details open><summary>Text</summary><div class="list">' +
        TEXT_PRESETS.map((p) => `<button class="litem" data-spec='${esc(JSON.stringify({ kind: 'text', key: p.key }))}'>` +
          `<span style="font-size:${Math.min(p.t.size, 18)}px;font-weight:${p.t.weight};color:${p.t.color};${p.t.italic ? 'font-style:italic' : ''}">${esc(p.label)}</span></button>`).join('') +
        '</div></details>');
      html.push('<details open><summary>Markers &amp; shapes</summary><div class="tiles small">' +
        BADGE_PRESETS.map((p) => tile({ kind: 'badge', key: p.key },
          `<svg viewBox="-16 -16 32 32" width="30" height="30"><circle r="13" fill="${p.b.fill}" stroke="#fff" stroke-width="2"/><text y="${p.b.text === '?' ? 5 : 4.5}" text-anchor="middle" font-size="${p.b.text === '?' ? 15 : 13}" font-weight="700" fill="#fff">${p.b.text}</text></svg>`, p.label)).join('') +
        tile({ kind: 'cloud' }, '<svg viewBox="-160 -90 320 155" width="48" height="26"><path d="M-150 55 H140 A55 55 0 0 0 150 -45 A75 75 0 0 0 -20 -80 A60 60 0 0 0 -120 -35 A45 45 0 0 0 -150 55 Z" fill="#F0FDFA" stroke="#0F766E" stroke-width="10"/></svg>', 'WAN cloud') +
        tile({ kind: 'legend' }, '<svg viewBox="0 0 48 16" width="44" height="16"><line x1="2" y1="8" x2="20" y2="8" stroke="#0284C7" stroke-width="3" stroke-linecap="round"/><rect x="25" y="6" width="20" height="4" rx="2" fill="#94A3B8"/></svg>', 'Legend entry') +
        tile({ kind: 'autolegend' }, '<svg viewBox="0 0 48 30" width="44" height="28"><line x1="2" y1="6" x2="16" y2="6" stroke="#0F766E" stroke-width="3" stroke-linecap="round"/><rect x="21" y="4" width="22" height="4" rx="2" fill="#94A3B8"/><line x1="2" y1="15" x2="16" y2="15" stroke="#0284C7" stroke-width="3" stroke-linecap="round"/><rect x="21" y="13" width="16" height="4" rx="2" fill="#94A3B8"/><line x1="2" y1="24" x2="16" y2="24" stroke="#D97706" stroke-width="3" stroke-dasharray="4 3" stroke-linecap="round"/><rect x="21" y="22" width="19" height="4" rx="2" fill="#94A3B8"/></svg>', 'Legend of used lines') +
        tile({ kind: 'circle' }, '<svg viewBox="-16 -16 32 32" width="30" height="30"><circle r="13" fill="#fff" stroke="#64748B" stroke-width="2.5" stroke-dasharray="5 4"/></svg>', 'Circle') +
        tile({ kind: 'image' }, '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="#475569" stroke-width="2"><rect x="4" y="6" width="24" height="20" rx="3"/><circle cx="12" cy="13" r="2.5"/><path d="M6 24 L14 17 L19 21 L23 18 L28 23"/></svg>', 'Image / logo…') +
        '</div></details>');
    }
    html.push(`<details ${lib.length ? 'open' : ''}><summary>My library</summary><div class="tiles lib">` +
      lib.map((e, i) => [e, i]).filter(([e]) => !q || e.name.toLowerCase().includes(q)).map(([e, i]) => `<div class="libwrap">${tile({ kind: 'lib', index: i }, this.libPreview(e), e.name)}<button class="libdel" data-libdel="${i}" title="Remove from library">×</button></div>`).join('') +
      '</div><div class="btns"><button class="btn" id="lib-add">Add selection to library</button></div>' +
      '<p class="hint">Keep your own logos and building blocks here. Paste an image with <kbd>Ctrl</kbd>+<kbd>V</kbd> or drop a file on the canvas.</p></details>');
    this.root.innerHTML = html.join('');
    this.wire();
  }

  libPreview(e) {
    const doc = { items: e.items };
    const b = e.box;
    const pad = 6;
    return `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" width="48" height="36" font-family="IBM Plex Sans, sans-serif">` +
      `<defs>${markerDefs(doc)}</defs>${e.items.map(renderItem).join('')}</svg>`;
  }

  wire() {
    const r = this.root;
    const q = r.querySelector('#pal-q');
    q.addEventListener('input', () => {
      this.filter = q.value;
      const pos = q.selectionStart;
      this.render();
      const nq = this.root.querySelector('#pal-q');
      nq.focus(); nq.setSelectionRange(pos, pos);
    });
    q.addEventListener('keydown', (e) => e.stopPropagation());
    r.querySelectorAll('#pal-style [data-style]').forEach((b) => b.addEventListener('click', () => {
      this.nodeStyle = b.dataset.style;
      try { localStorage.setItem('netdraw.nodeStyle', this.nodeStyle); } catch { /* ignore */ }
      this.render();
    }));
    r.querySelectorAll('#pal-route [data-route]').forEach((b) => b.addEventListener('click', () => {
      this.ed.routeStyle = b.dataset.route; this.render(); this.app.syncToolbar();
    }));
    r.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => {
      if (this.app.paletteDragged) return;
      this.ed.flow = this.allFlows().find((f) => f.key === b.dataset.flow) || FLOW_PRESETS[1];
      const sel = this.ed.selectedItems().filter((i) => i.type === 'connector');
      if (sel.length) this.app.applyFlow(sel, this.ed.flow);
      this.render();
    }));
    r.querySelectorAll('[data-spec]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        this.app.startPaletteDrag(JSON.parse(b.dataset.spec), e, b);
      });
    });
    r.querySelectorAll('[data-flowdel]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveCustomFlows(this.customFlows().filter((f) => f.key !== b.dataset.flowdel));
      if (this.ed.flow.key === b.dataset.flowdel) this.ed.flow = FLOW_PRESETS[1];
      this.render();
    }));
    r.querySelectorAll('[data-libdel]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const lib = this.library();
      lib.splice(Number(b.dataset.libdel), 1);
      this.saveLibrary(lib);
      this.render();
    }));
    r.querySelector('#lib-add').addEventListener('click', async () => {
      const items = this.ed.selectedItems();
      if (!items.length) return this.app.toast('Select something first');
      const name = await this.app.askText('Name for this library item', items.find((i) => i.name)?.name || 'My item');
      if (!name) return;
      const copy = M.clone(items);
      for (const c of copy) { if (c.type === 'connector') { delete c.from; delete c.to; } }
      const box = M.union(copy.map(M.snapBox)) || { x: 0, y: 0, w: 1, h: 1 };
      const lib = this.library();
      lib.push({ name, items: copy, box });
      this.saveLibrary(lib);
      this.render();
      this.app.toast(`Added "${name}" to your library`);
    });
  }
}
