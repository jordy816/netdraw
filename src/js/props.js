// Properties panel: a form generated from a per-type schema. Edits apply live; one undo step per field edit.
import * as M from './model.js';
import { SWATCHES, DASHES, makeBadge, nodeStyleOf, NODE_STYLES, PAPER_SIZES, paperPx, describePage, MM_PER_PX } from './presets.js';
import { GLYPH_CATALOG, glyphMarkup } from './glyphs.js';
import { esc } from './render.js';

const F = (key, label, kind, opts = {}) => ({ key, label, kind, ...opts });
const S = (title, open = true) => ({ section: title, open });

const WEIGHTS = [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold']];

const SCHEMA = {
  node: [
    S('Label'), F('name', 'Name', 'text'), F('sub', 'Details (one line each)', 'textarea'),
    S('Icon'), F('glyph', 'Icon', 'glyph'), F('color', 'Colour', 'color'),
    F('inactive', 'Inactive (dashed outline)', 'check'), F('badge.text', 'Badge', 'text', { placeholder: 'e.g. AD' }),
    F('r', 'Disc radius', 'number', { step: 1, min: 6 }),
    F('glyphSet', 'Icon style', 'select', { options: [['A', 'Compact (overview)'], ['B', 'Large (flow)']] }),
    F('glyphScale', 'Icon scale', 'number', { step: 0.05, min: 0.2, placeholder: '1' }),
    F('image', 'Own logo in disc', 'image'),
    S('Text style', false), F('nameSize', 'Name size', 'number', { step: 0.5 }), F('nameWeight', 'Name weight', 'select', { options: WEIGHTS, num: true }),
    F('nameColor', 'Name colour', 'color'), F('nameDy', 'Name distance', 'number'), F('subSize', 'Details size', 'number', { step: 0.5 }),
    F('subColor', 'Details colour', 'color'), F('subDy', 'Details distance', 'number'), F('subLh', 'Line height', 'number'),
    S('Position', false), F('x', 'X (centre)', 'number'), F('y', 'Y (centre)', 'number'),
  ],
  zone: [
    S('Container'), F('title', 'Title', 'text'), F('sub', 'Subtitle', 'text'), F('body', 'Text (wraps)', 'textarea'),
    F('fill', 'Fill', 'color'), F('stroke', 'Border', 'color', { none: true }),
    F('strokeWidth', 'Border width', 'number', { step: 0.1 }), F('dash', 'Border style', 'dash'), F('rx', 'Corner radius', 'number'),
    S('Title style', false), F('titleAlign', 'Title position', 'select', { options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] }),
    F('titleSize', 'Title size', 'number', { step: 0.5 }), F('titleWeight', 'Title weight', 'select', { options: WEIGHTS, num: true }),
    F('titleColor', 'Title colour', 'color'), F('titleDx', 'Title inset X', 'number'), F('titleDy', 'Title baseline Y', 'number'),
    F('subSize', 'Subtitle size', 'number', { step: 0.5 }), F('subColor', 'Subtitle colour', 'color'), F('subDy', 'Subtitle baseline Y', 'number'),
    F('bodySize', 'Text size', 'number', { step: 0.5, placeholder: '14' }), F('bodyColor', 'Text colour', 'color'),
    F('bodyDy', 'Text start Y', 'number', { placeholder: '56' }), F('bodyLh', 'Text line height', 'number', { placeholder: '20' }),
    S('Geometry', false), F('x', 'X', 'number'), F('y', 'Y', 'number'), F('w', 'Width', 'number'), F('h', 'Height', 'number'),
  ],
  connector: [
    S('Line'), F('color', 'Colour', 'color'), F('width', 'Width', 'number', { step: 0.1, min: 0.5 }), F('dash', 'Style', 'dash'),
    F('arrowEnd', 'Arrow at end', 'check'), F('arrowStart', 'Arrow at start', 'check'),
    F('arrowSize', 'Arrow size', 'number', { step: 0.1, min: 1 }),
    S('Label on the line'), F('label', 'Label', 'text', { placeholder: 'e.g. IPsec, 443/TCP' }), F('labelSize', 'Size', 'number', { step: 0.5, placeholder: '12.5' }),
    F('labelColor', 'Colour', 'color', { none: true }), F('labelPos', 'Position (0–1)', 'number', { step: 0.05, min: 0, max: 1, placeholder: '0.5' }),
    S('Route'), F(null, '', 'route'),
    S('Path data', false), F('d', 'SVG path', 'textarea', { mono: true }),
  ],
  text: [
    S('Text'), F('text', 'Text', 'textarea'), F('size', 'Size', 'number', { step: 0.5 }), F('weight', 'Weight', 'select', { options: WEIGHTS, num: true }),
    F('color', 'Colour', 'color'), F('anchor', 'Anchor', 'select', { options: [['start', 'Left'], ['middle', 'Centre'], ['end', 'Right']] }),
    F('italic', 'Italic', 'check'), F('wrap', 'Wrap width (px)', 'number', { step: 10, placeholder: 'no wrapping' }),
    F('rotate', 'Rotation (deg)', 'number', { step: 90 }), F('lineHeight', 'Line height', 'number', { placeholder: 'auto' }),
    S('Position', false), F('x', 'X (anchor)', 'number'), F('y', 'Y (baseline)', 'number'),
  ],
  badge: [
    S('Marker'), F('text', 'Text', 'text'), F('fill', 'Fill', 'color'), F('textColor', 'Text colour', 'color'), F('r', 'Radius', 'number'),
    F('size', 'Text size', 'number', { step: 0.5 }), F('stroke', 'Ring', 'color', { none: true }), F('strokeWidth', 'Ring width', 'number', { step: 0.1 }),
    F('textDy', 'Text baseline offset', 'number', { step: 0.1 }),
    S('Position', false), F('x', 'X', 'number'), F('y', 'Y', 'number'),
  ],
  path: [
    S('Shape'), F('fill', 'Fill', 'color', { none: true }), F('stroke', 'Outline', 'color', { none: true }),
    F('strokeWidth', 'Outline width', 'number', { step: 0.1 }), F('dash', 'Outline style', 'dash'),
    S('Path data', false), F('d', 'SVG path', 'textarea', { mono: true }),
  ],
  circle: [
    S('Circle'), F('fill', 'Fill', 'color', { none: true }), F('stroke', 'Outline', 'color', { none: true }),
    F('strokeWidth', 'Outline width', 'number', { step: 0.1 }), F('dash', 'Outline style', 'dash'), F('r', 'Radius', 'number'),
    S('Position', false), F('x', 'X', 'number'), F('y', 'Y', 'number'),
  ],
  image: [
    S('Image'), F('href', 'Image', 'image'), F('opacity', 'Opacity', 'number', { step: 0.05, min: 0, max: 1 }),
    F('keepAspect', 'Keep aspect ratio', 'check', { def: true }),
    S('Geometry'), F('x', 'X', 'number'), F('y', 'Y', 'number'), F('w', 'Width', 'number'), F('h', 'Height', 'number'),
  ],
  page: [
    S('Page'), F('title', 'Title', 'text'), F(null, 'Paper', 'paper'),
    F('width', 'Width (px)', 'number', { step: 10 }), F('height', 'Height (px)', 'number', { step: 10 }),
    F('background', 'Background', 'color'), F('grid', 'Grid size', 'number', { step: 1, min: 1 }),
    S('Print scale', false), F('mmPerPx', 'mm per pixel', 'number', { step: 0.01, min: 0.01, placeholder: String(MM_PER_PX) }),
    F('fontFamily', 'Font family', 'text'),
  ],
};

const TYPE_LABEL = {
  node: 'Icon', zone: 'Container', connector: 'Connector', text: 'Text', badge: 'Marker', path: 'Shape', circle: 'Circle', image: 'Image',
};

function getv(o, key) {
  if (!key) return undefined;
  return key.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}

export class Props {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.pending = null;
    this.openSections = new Map();
  }

  get ed() { return this.app.editor; }

  render() {
    const items = this.ed.selectedItems();
    const page = !items.length;
    const types = [...new Set(items.map((i) => i.type))];
    const type = page ? 'page' : types.length === 1 ? types[0] : null;
    const html = [];
    if (page) html.push('<h2>Document</h2>');
    else html.push(`<h2>${type ? TYPE_LABEL[type] : 'Mixed selection'}${items.length > 1 ? ` <span class="count">× ${items.length}</span>` : ''}</h2>`);
    if (type) {
      let open = true;
      let sec = null;
      for (const f of SCHEMA[type]) {
        if (f.section) {
          if (sec) html.push('</div></details>');
          const k = `${type}:${f.section}`;
          open = this.openSections.has(k) ? this.openSections.get(k) : f.open;
          html.push(`<details data-sec="${k}"${open ? ' open' : ''}><summary>${f.section}</summary><div class="fields">`);
          sec = f.section;
          continue;
        }
        html.push(this.field(f, page ? [this.app.doc.page] : items, type));
      }
      if (sec) html.push('</div></details>');
    }
    if (items.length > 1) html.push(this.alignBlock());
    if (!page) html.push(this.arrangeBlock(items));
    else html.push(this.docInfo());
    this.root.innerHTML = html.join('');
    this.wire(page ? [this.app.doc.page] : items, type);
  }

  // ---------------------------------------------------------------------------------------------- fields
  field(f, objs, type) {
    const vals = objs.map((o) => getv(o, f.key));
    const same = vals.every((v) => v === vals[0]);
    const v = same ? vals[0] : undefined;
    const id = `f-${(f.key || f.kind).replace(/\./g, '-')}`;
    const lab = f.label ? `<label for="${id}">${f.label}</label>` : '';
    const ph = !same ? 'mixed' : f.placeholder || '';
    switch (f.kind) {
      case 'text':
        return `<div class="row">${lab}<input id="${id}" data-k="${f.key}" type="text" value="${esc(v ?? '')}" placeholder="${esc(ph)}"></div>`;
      case 'textarea':
        return `<div class="row col">${lab}<textarea id="${id}" data-k="${f.key}" rows="${f.mono ? 5 : 3}" class="${f.mono ? 'mono' : ''}" placeholder="${esc(ph)}">${esc(v ?? '')}</textarea></div>`;
      case 'number':
        return `<div class="row">${lab}<input id="${id}" data-k="${f.key}" data-num="1" type="number" step="${f.step ?? 1}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} value="${v ?? ''}" placeholder="${esc(ph)}"></div>`;
      case 'check': {
        const on = same && (v ?? f.def ?? false);
        return `<div class="row check"><label><input data-k="${f.key}" data-check="1" type="checkbox"${on ? ' checked' : ''}> ${f.label}</label></div>`;
      }
      case 'select':
        return `<div class="row">${lab}<select id="${id}" data-k="${f.key}"${f.num ? ' data-num="1"' : ''}>${!same ? '<option value="" selected>mixed</option>' : ''}` +
          f.options.map(([val, l]) => `<option value="${val}"${same && String(v) === String(val) ? ' selected' : ''}>${l}</option>`).join('') + '</select></div>';
      case 'dash': {
        const known = DASHES.some(([d]) => d === (v || ''));
        return `<div class="row">${lab}<select id="${id}" data-k="${f.key}" data-dash="1">` +
          (!same ? '<option value="__mixed" selected>mixed</option>' : '') +
          DASHES.map(([d, l]) => `<option value="${d}"${same && (v || '') === d ? ' selected' : ''}>${l}</option>`).join('') +
          (same && !known ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : '') + '</select></div>';
      }
      case 'color': {
        const val = v ?? '';
        const isNone = val === 'none' || val === '';
        const hex = /^#[0-9a-f]{6}$/i.test(val) ? val : /^#[0-9a-f]{3}$/i.test(val) ? `#${[...val.slice(1)].map((c) => c + c).join('')}` : '#ffffff';
        return `<div class="row color">${lab}<div class="colorbox">` +
          `<input type="color" data-k="${f.key}" data-color="1" value="${hex}"${isNone && f.none ? ' class="isnone"' : ''}>` +
          `<input type="text" data-k="${f.key}" data-hex="1" value="${esc(same ? val : '')}" placeholder="${!same ? 'mixed' : f.none ? 'none' : ''}" spellcheck="false">` +
          `</div><div class="swatches">${SWATCHES.map((c) => `<button class="sw" data-k="${f.key}" data-sw="${c}" style="background:${c}" title="${c}"></button>`).join('')}` +
          `${f.none ? `<button class="sw none" data-k="${f.key}" data-sw="none" title="None"></button>` : ''}</div></div>`;
      }
      case 'glyph': {
        const n = objs[0];
        return `<div class="row col">${lab}<div class="glyphs">${GLYPH_CATALOG.map(([g, l]) =>
          `<button class="gl${same && v === g ? ' on' : ''}" data-glyph="${g}" title="${l}"><svg viewBox="-24 -24 48 48" width="34" height="34">` +
          `<circle r="22" fill="${n.inactive ? '#fff' : n.color}"${n.inactive ? ` stroke="${n.color}" stroke-width="2" stroke-dasharray="5 4"` : ''}/>` +
          `<g transform="scale(0.62)">${glyphMarkup(n.glyphSet, g, 0, 0, n.inactive ? n.color : '#fff', n.inactive ? '#fff' : n.color)}</g></svg></button>`).join('')}</div></div>`;
      }
      case 'image': {
        const has = !!v;
        return `<div class="row">${lab}<div class="btns"><button class="btn" data-img="${f.key}">${has ? 'Replace…' : 'Choose…'}</button>` +
          `${has && f.key === 'image' ? `<button class="btn" data-imgclear="${f.key}">Remove</button>` : ''}</div></div>`;
      }
      case 'paper': {
        const pg = objs[0];
        const info = describePage(pg);
        const k = pg.mmPerPx || MM_PER_PX;
        const cur = info.exact?.key || '';
        return `<div class="row">${lab}<select data-paper="1"><option value=""${cur ? '' : ' selected'}>Custom size</option>` +
          PAPER_SIZES.map((p) => `<option value="${p.key}"${p.key === cur ? ' selected' : ''}>${p.label}</option>`).join('') + '</select></div>' +
          `<p class="hint paper">${Math.round(info.wmm)} × ${Math.round(info.hmm)} mm at 1 px = ${k} mm` +
          `${info.exact?.mm ? '' : info.fits ? ` · fits on ${info.fits.label}` : ' · larger than A0'}. ` +
          `PNG 2× = ${pg.width * 2} × ${pg.height * 2} px.</p>`;
      }
      case 'route':
        return `<div class="row col"><div class="btns wrap">` +
          '<button class="btn" data-act="route:curve">Curve</button><button class="btn" data-act="route:orthogonal">Orthogonal</button>' +
          '<button class="btn" data-act="route:straight">Straight</button><button class="btn" data-act="reverse">Reverse</button>' +
          '<button class="btn" data-act="detach">Detach ends</button><button class="btn" data-act="saveflow">Save as line style…</button></div>' +
          `<p class="hint">${this.attachInfo(objs)}Drag the round end handles onto an icon to connect. Double-click the line to add a bend; Alt+click a square to remove it.</p></div>`;
      default: return '';
    }
  }

  attachInfo(objs) {
    if (objs.length !== 1) return '';
    const c = objs[0];
    const nm = (a) => {
      const n = a && M.byId(this.app.doc, a.id);
      return n ? `<b>${esc(n.name || n.glyph)}</b>` : '<i>free</i>';
    };
    return `From ${nm(c.from)} to ${nm(c.to)}. `;
  }

  alignBlock() {
    const b = (act, title, svg) => `<button class="ibtn" data-act="${act}" title="${title}">${svg}</button>`;
    const ic = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="${d}"/></svg>`;
    return '<details open><summary>Align &amp; distribute</summary><div class="fields"><div class="btns">' +
      b('align:left', 'Align left', ic('M4 3v18M8 7h10M8 13h6M8 17h8')) +
      b('align:hcenter', 'Align centres horizontally', ic('M12 3v18M6 7h12M8 12h8M5 17h14')) +
      b('align:right', 'Align right', ic('M20 3v18M6 7h10M10 13h6M8 17h8')) +
      b('align:top', 'Align top', ic('M3 4h18M7 8v10M13 8v6M17 8v8')) +
      b('align:vcenter', 'Align middles vertically', ic('M3 12h18M7 6v12M12 8v8M17 5v14')) +
      b('align:bottom', 'Align bottom', ic('M3 20h18M7 6v10M13 10v6M17 8v8')) +
      b('dist:h', 'Distribute horizontally', ic('M4 4v16M20 4v16M10 8h4v8h-4z')) +
      b('dist:v', 'Distribute vertically', ic('M4 4h16M4 20h16M8 10v4h8v-4z')) +
      '</div></div></details>';
  }

  arrangeBlock(items) {
    const grouped = items.some((i) => i.group);
    const locked = items.some((i) => i.locked);
    return '<details open><summary>Arrange</summary><div class="fields"><div class="btns wrap">' +
      '<button class="btn" data-act="front">To front</button><button class="btn" data-act="back">To back</button>' +
      '<button class="btn" data-act="forward">Forward</button><button class="btn" data-act="backward">Backward</button>' +
      (items.length > 1 ? '<button class="btn" data-act="group">Group</button>' : '') +
      (grouped ? '<button class="btn" data-act="ungroup">Ungroup</button>' : '') +
      `<button class="btn" data-act="lock">${locked ? 'Unlock' : 'Lock'}</button>` +
      '<button class="btn" data-act="duplicate">Duplicate</button><button class="btn danger" data-act="delete">Delete</button>' +
      '</div></div></details>';
  }

  docInfo() {
    const d = this.app.doc;
    const count = (t) => d.items.filter((i) => i.type === t).length;
    return `<details open><summary>Contents</summary><div class="fields"><p class="hint">${count('node')} icons · ${count('connector')} connectors · ` +
      `${count('zone')} containers · ${count('text')} texts · ${count('badge')} markers</p>` +
      '<div class="btns wrap"><button class="btn" data-act="autoattach">Connect line ends to icons</button>' +
      '<button class="btn" data-act="unlockall">Unlock all</button><button class="btn" data-act="fitpage">Fit page to content</button></div></div></details>';
  }

  // ---------------------------------------------------------------------------------------------- wiring
  wire(objs, type) {
    const root = this.root;
    root.querySelectorAll('details[data-sec]').forEach((d) => d.addEventListener('toggle', () => this.openSections.set(d.dataset.sec, d.open)));
    const apply = (key, val, opts = {}) => this.apply(objs, type, key, val, opts);
    root.querySelectorAll('input[data-k], textarea[data-k], select[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const read = () => {
        if (el.dataset.check) return el.checked;
        if (el.dataset.num) return el.value === '' ? undefined : Number(el.value);
        return el.value;
      };
      const live = el.tagName === 'SELECT' || el.dataset.check || el.dataset.color ? 'change' : 'input';
      el.addEventListener(live, () => {
        if (el.dataset.dash && el.value === '__mixed') return;
        if (el.dataset.hex && el.value && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(el.value) && el.value !== 'none') return;
        apply(k, read(), { live: true });
        if (el.dataset.color) { const t = el.parentElement.querySelector('[data-hex]'); if (t) t.value = el.value; }
        if (el.dataset.hex && /^#[0-9a-f]{6}$/i.test(el.value)) { const c = el.parentElement.querySelector('[data-color]'); if (c) c.value = el.value; }
      });
      if (el.dataset.color) el.addEventListener('input', () => apply(k, el.value, { live: true }));
      el.addEventListener('change', () => this.flush());
      el.addEventListener('blur', () => this.flush());
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && el.tagName === 'INPUT') { this.flush(); el.blur(); }
        if (e.key === 'Escape') el.blur();
      });
    });
    root.querySelectorAll('[data-sw]').forEach((b) => b.addEventListener('click', () => {
      apply(b.dataset.k, b.dataset.sw); this.flush(); this.render();
    }));
    root.querySelectorAll('[data-glyph]').forEach((b) => b.addEventListener('click', () => {
      apply('glyph', b.dataset.glyph); this.flush(); this.render();
    }));
    root.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', async () => {
      const url = await this.app.host.pickImage();
      if (url) { apply(b.dataset.img, url); this.flush(); this.render(); }
    }));
    root.querySelectorAll('[data-imgclear]').forEach((b) => b.addEventListener('click', () => {
      apply(b.dataset.imgclear, undefined); this.flush(); this.render();
    }));
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.app.command(b.dataset.act)));
    root.querySelectorAll('[data-paper]').forEach((sel) => sel.addEventListener('change', () => {
      const p = PAPER_SIZES.find((x) => x.key === sel.value);
      if (!p) return;
      const pg = this.app.doc.page;
      const [w, h] = paperPx(p, pg.mmPerPx || MM_PER_PX);
      const before = this.app.snapshot();
      pg.width = w; pg.height = h;
      this.app.record(before);
      this.app.editor.renderAll();
      this.app.editor.fit();
      this.render();
    }));
  }

  apply(objs, type, key, val, { live } = {}) {
    const OPTIONAL = ['rotate', 'lineHeight', 'glyphScale', 'opacity', 'image', 'dash', 'wrap', 'labelSize', 'labelPos',
      'bodySize', 'bodyDy', 'bodyLh', 'mmPerPx'];
    if (val === undefined && !OPTIONAL.includes(key)) return;   // a cleared required number: ignore
    if (!this.pending) this.pending = this.app.snapshot();
    const ids = [];
    const moved = new Map();
    for (const o of objs) {
      if (type === 'node' && (key === 'x' || key === 'y') && typeof val === 'number' && o[key] !== val) {
        moved.set(o.id, { dx: key === 'x' ? val - o.x : 0, dy: key === 'y' ? val - o.y : 0 });
      }
      if (key === 'badge.text') {
        if (!val) delete o.badge;
        else if (o.badge) o.badge.text = val;
        else o.badge = makeBadge(nodeStyleOf(o), o.r, val);
      } else if (key === 'r' && type === 'node') {
        const k = NODE_STYLES[nodeStyleOf(o)].badge.k;
        o.r = val;
        if (o.badge && k) { o.badge.dx = val * k[0]; o.badge.dy = val * k[1]; }
      } else if (val === undefined || (val === '' && ['dash', 'rotate', 'lineHeight', 'glyphScale', 'opacity', 'label', 'body', 'labelColor'].includes(key))) delete o[key];
      else o[key] = val;
      if (type === 'node' && key === 'glyph' && val === 'nodc') { o.inactive = true; }
      if (o.id) ids.push(o.id);
    }
    if (moved.size) ids.push(...M.followNodes(this.app.doc, moved, new Map()));
    if (key === 'd') this.pendingD = objs.filter((o) => o.type === 'connector');
    if (type === 'page') {
      this.app.editor.renderAll();
      this.app.updateTitle();
      if (key === 'width' || key === 'height' || key === 'mmPerPx') {
        const hint = this.root.querySelector('.hint.paper');
        const info = describePage(this.app.doc.page);
        if (hint) hint.textContent = `${Math.round(info.wmm)} × ${Math.round(info.hmm)} mm${info.fits ? ` · fits on ${info.fits.label}` : ''}.`;
      }
    } else this.ed.renderItems(ids);
    this.app.markDirty();
    if (!live) this.flush();
  }

  flush() {
    if (this.pendingD) {
      for (const c of this.pendingD) M.refreshAttachments(this.app.doc, c);
      this.pendingD = null;
    }
    if (!this.pending) return;
    const before = this.pending;
    this.pending = null;
    if (before !== this.app.snapshot()) this.app.record(before);
  }
}
