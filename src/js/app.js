// Application shell: document lifecycle, history, commands, keyboard, menus, palette drops and inline editing.
import { Editor } from './editor.js';
import { Props } from './props.js';
import { Palette } from './palette.js';
import { host, readAsDataURL } from './platform.js';
import * as M from './model.js';
import { renderSVG, fontFaceCSS, esc, darkSVG } from './render.js';
import {
  makeNode, makeZone, ZONE_PRESETS, FLOW_PRESETS, TEXT_PRESETS, makeText, BADGE_PRESETS, makeBadge2,
  makeConnector, cloudPath, PALETTE, nodeStyleOf, PAPER_SIZES, paperPx, describePage, flowLabel, MM_PER_PX,
  VENDOR_DEVICES, makeDevice,
} from './presets.js';
import { GLYPH_LABEL } from './glyphs.js';
import { measure } from './textmetrics.js';
import * as API from './api.js';
import { parsePath, startPoint, endPoint, pointAt } from './path.js';

const $ = (s) => document.querySelector(s);
const MAX_UNDO = 300;
const AUTOSAVE_MS = 15000;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

class App {
  constructor() {
    this.host = host;
    this.doc = M.newDoc();
    this.filePath = null;
    this.fileName = null;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.clip = null;
    this.pasteCount = 0;
    this.editor = new Editor(this, $('#viewport'));
    this.props = new Props(this, $('#props'));
    this.palette = new Palette(this, $('#palette'));
    this.wireToolbar();
    this.wireKeys();
    this.wireDrop();
    host.onCommand((cmd, arg) => this.command(cmd, arg));
    host.onOpenFile((p) => this.openPath(p));
    this.applyTheme(store.get('netdraw.theme', 'system'));
    this.editor.showRulers = store.get('netdraw.rulers', true);
    host.setUiZoom?.(store.get('netdraw.uiZoom', 1));
    this.editor.renderAll();
    this.palette.render();
    this.props.render();
    this.updateTitle();
    requestAnimationFrame(() => this.editor.fit());
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme(this.theme));
    this.autosaved = null;
    setInterval(() => this.autosave(), AUTOSAVE_MS);
    this.boot();
  }

  async boot() {
    const p = await host.startupFile?.();
    const rec = await host.recoverInfo?.();
    if (rec && !p) {
      const when = new Date(rec.time).toLocaleString();
      const i = await this.modal('Recover unsaved work?', `<p>NetDraw closed with unsaved changes to <b>${esc(rec.name || 'a drawing')}</b> (autosaved ${esc(when)}).</p>`,
        [['Recover', true], ['Discard', false]]);
      if (i === 0) {
        this.loadText(rec.text, rec.path, rec.name);
        this.dirty = true; host.setDirty(true); this.updateTitle();
        return;
      }
      host.clearAutosave?.();
    }
    if (p) this.openPath(p, true);
  }

  // ---------------------------------------------------------------------------------------------- automation (MCP)
  // Called by the main process for MCP clients. Changes are normal undo steps, so you can take them back.
  async api(method, params = {}) {
    try {
      if (method === 'save') {
        const p = params.path || this.filePath;
        if (!p) return { error: 'The open drawing has no file yet: pass "path" (a .netdraw file) to save it.' };
        const saved = await host.saveFile({ path: p, text: this.serialize(), suggestedName: this.suggested('netdraw') });
        this.filePath = saved; this.fileName = saved.split(/[\\/]/).pop();
        this.dirty = false; host.setDirty(false); host.clearAutosave?.(); this.updateTitle();
        return { result: { saved } };
      }
      if (method === 'snapshot') return { result: { json: this.serialize(), path: this.filePath } };
      if (method === 'new_drawing' && this.dirty && !params.discard_unsaved) {
        return { error: 'NetDraw has unsaved changes. Save first (save), or pass discard_unsaved: true.' };
      }
      const before = this.snapshot();
      const r = API.call(this.doc, method, params);
      if (r.doc !== this.doc) {
        this.setDoc(r.doc, null, null);
        this.markDirty();
      } else if (r.changed) {
        this.record(before);
        this.editor.renderAll();
        const ids = r.result.ids || (r.result.id ? [r.result.id] : r.result.updated || []);
        if (ids.length) this.editor.setSelection(ids.filter((id) => M.byId(this.doc, id)));
        this.props.render();
      }
      if (r.changed) this.toast(`Assistant: ${method.replace(/_/g, ' ')}`);
      return { result: r.result };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ---------------------------------------------------------------------------------------------- presentation mode
  // A clean, view-only view for screen sharing: no panels, toolbar, rulers or handles. Drag pans, wheel zooms.
  setPresenting(on) {
    const ed = this.editor;
    if (on === ed.present) return;
    this.commitInline();
    this.closeMenus();
    if (on) {
      this.viewBeforePresent = { zoom: ed.zoom, panX: ed.panX, panY: ed.panY, sel: [...ed.sel] };
      ed.setSelection([]);
    }
    ed.present = on;
    ed.hover = null;
    document.body.classList.toggle('present', on);
    host.setPresenting?.(on);
    requestAnimationFrame(() => {
      if (on) ed.fit();
      else {
        const v = this.viewBeforePresent;
        if (v) { ed.zoom = v.zoom; ed.panX = v.panX; ed.panY = v.panY; ed.setSelection(v.sel.filter((id) => M.byId(this.doc, id))); }
        ed.layout();
      }
    });
    if (on) { this.wakePresentBar(); this.toast('Presentation mode · drag to pan, scroll to zoom · Esc to leave'); }
  }

  wakePresentBar() {
    document.body.classList.remove('idle');
    clearTimeout(this.idleT);
    this.idleT = setTimeout(() => document.body.classList.add('idle'), 2500);
  }

  // ---------------------------------------------------------------------------------------------- theme & autosave
  applyTheme(theme) {
    this.theme = theme;
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    this.editor.setDarkPreview(dark && store.get('netdraw.darkPreview', true));
    host.setTheme?.(theme);
    store.set('netdraw.theme', theme);
    this.editor.drawRulers?.();
    this.syncToolbar?.();
  }

  autosave() {
    if (!this.dirty || !host.autosave) return;
    const text = this.serialize();
    if (text === this.autosaved) return;
    this.autosaved = text;
    host.autosave({ text, path: this.filePath, name: this.fileName || this.doc.page.title || 'Untitled' });
  }

  // ---------------------------------------------------------------------------------------------- state
  snapshot() { return JSON.stringify(this.doc); }

  record(before) {
    if (before == null) return;
    this.undoStack.push(before);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.markDirty();
  }

  markDirty() {
    if (!this.dirty) { this.dirty = true; this.updateTitle(); host.setDirty(true); }
  }

  restore(json) {
    this.doc = JSON.parse(json);
    const keep = [...this.editor.sel].filter((id) => M.byId(this.doc, id));
    this.editor.renderAll();
    this.editor.setSelection(keep);
    this.markDirty();
  }

  undo() {
    if (!this.undoStack.length) return this.toast('Nothing to undo');
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  updateTitle() {
    const name = this.fileName || this.doc.page.title || 'Untitled';
    const t = `${this.dirty ? '● ' : ''}${name} — NetDraw`;
    host.setTitle(t);
    document.title = t;
    const el = $('#docname');
    if (el) el.textContent = `${name}${this.dirty ? ' ●' : ''}`;
  }

  setDoc(doc, path, name) {
    host.clearAutosave?.();
    this.autosaved = null;
    this.doc = doc;
    this.filePath = path || null;
    this.fileName = name || (path ? path.split(/[\\/]/).pop() : null);
    this.undoStack = []; this.redoStack = [];
    this.dirty = false;
    host.setDirty(false);
    this.editor.sel = new Set();
    this.editor.renderAll();
    this.editor.fit();
    this.matchPaletteStyle();
    this.props.render();
    this.updateTitle();
  }

  // New icons should look like the ones already in the drawing.
  matchPaletteStyle() {
    const tally = {};
    for (const n of this.doc.items) if (n.type === 'node') { const k = nodeStyleOf(n); tally[k] = (tally[k] || 0) + 1; }
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (best && best[0] !== this.palette.nodeStyle) { this.palette.nodeStyle = best[0]; }
    const flows = this.doc.items.filter((i) => i.type === 'connector').map((c) => c.arrowSize);
    if (flows.length && flows.filter((s) => s === 5.5).length > flows.length / 2) this.editor.flow = FLOW_PRESETS.find((f) => f.key === 'zs');
    else this.editor.flow = FLOW_PRESETS.find((f) => f.key === 'zia');
    this.palette.render();
  }

  // ---------------------------------------------------------------------------------------------- files
  async ensureSaved() {
    if (!this.dirty) return true;
    const r = await host.confirmDiscard(this.fileName || 'this drawing');
    if (r === 'save') return this.save();
    return r === 'discard';
  }

  async newDoc() {
    if (!(await this.ensureSaved())) return;
    const templates = (await host.listTemplates?.()) || [];
    const sizes = PAPER_SIZES.map((p) => `<option value="${p.key}"${p.key === 'A3-landscape' ? ' selected' : ''}>${p.label}</option>`).join('');
    const cards = [{ name: 'Blank page', blank: true }, ...templates].map((t, i) => {
      let thumb = '<div class="blank-thumb"></div>';
      if (!t.blank) {
        try {
          const d = M.normalize(JSON.parse(t.text));
          thumb = renderSVG(d).replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="100%"');
        } catch { thumb = '<div class="blank-thumb">?</div>'; }
      }
      return `<button class="tpl${i === 0 ? ' on' : ''}" data-tpl="${i}"><div class="tpl-img">${thumb}</div><span>${esc(t.name)}</span></button>`;
    }).join('');
    let pick = 0;
    const body = `<div class="row"><label>Paper</label><select id="new-size">${sizes}</select></div>` +
      '<p class="hint" style="margin:6px 0 12px">Blank pages use this size. Templates keep their own size; change it later on the Document panel.</p>' +
      `<div class="tpls">${cards}</div>`;
    const done = this.modal('New drawing', body, [['Create', true], ['Cancel', false]], (wrap) => {
      wrap.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
        pick = Number(b.dataset.tpl);
        wrap.querySelectorAll('.tpl').forEach((x) => x.classList.toggle('on', x === b));
      }));
      wrap.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('dblclick', () => wrap.querySelector('.primary').click()));
    });
    const sizeKey = { v: 'A3-landscape' };
    document.querySelector('#new-size')?.addEventListener('change', (e) => { sizeKey.v = e.target.value; });
    const i = await done;
    if (i !== 0) return;
    if (pick === 0) {
      const p = PAPER_SIZES.find((x) => x.key === sizeKey.v) || PAPER_SIZES[2];
      const [w, h] = paperPx(p, MM_PER_PX);
      this.setDoc(M.newDoc(w, h), null, null);
    } else {
      const t = templates[pick - 1];
      const d = M.normalize(JSON.parse(t.text));   // keep the ids: lines refer to their icons by id
      this.setDoc(d, null, null);
      this.toast(`New drawing from "${t.name}"`);
    }
  }

  loadText(text, path, name) {
    let doc;
    try { doc = M.normalize(JSON.parse(text)); } catch (e) { this.toast(`Cannot open: ${e.message}`, true); return false; }
    this.setDoc(doc, path, name);
    this.toast(`Opened ${this.fileName || 'drawing'}`);
    return true;
  }

  async open() {
    if (!(await this.ensureSaved())) return;
    const r = await host.openDialog();
    if (r) this.loadText(r.text, r.path, r.name);
  }

  async openPath(p, skipCheck = false) {
    if (!skipCheck && !(await this.ensureSaved())) return;
    try { this.loadText(await host.readFile(p), p); } catch (e) { this.toast(`Cannot open ${p}: ${e.message}`, true); }
  }

  serialize() { return JSON.stringify(this.doc, null, 1); }

  suggested(ext) {
    const base = (this.fileName || this.doc.page.title || 'diagram').replace(/\.netdraw$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
    return `${base}.${ext}`;
  }

  async save(as = false) {
    this.props.flush();
    const p = await host.saveFile({ path: as ? null : this.filePath, text: this.serialize(), suggestedName: this.suggested('netdraw') });
    if (p === null && host.desktop) return false;
    if (p) { this.filePath = p; this.fileName = p.split(/[\\/]/).pop(); }
    this.dirty = false;
    host.setDirty(false);
    host.clearAutosave?.();
    this.autosaved = null;
    this.updateTitle();
    this.toast(`Saved ${this.fileName || ''}`);
    return true;
  }

  printScale(dpi = 300) {
    const k = this.doc.page.mmPerPx || MM_PER_PX;
    return Math.round((dpi * k / 25.4) * 1000) / 1000;
  }

  async exportPdf() {
    const { doc, svg } = this.exportDoc(false);
    const k = doc.page.mmPerPx || MM_PER_PX;
    try {
      const p = await host.exportPdf({ svg, wmm: doc.page.width * k, hmm: doc.page.height * k, suggestedName: this.suggested('pdf') });
      if (p) this.toast(`Exported ${p.split(/[\\/]/).pop()} (${Math.round(doc.page.width * k)} × ${Math.round(doc.page.height * k)} mm, vector)`);
    } catch (e) { this.toast(`PDF export failed: ${e.message}`, true); }
  }

  // Legend for every line style used in the drawing, placed under the content.
  insertLegend() {
    const custom = this.palette.customFlows();
    const seen = new Map();
    for (const c of this.doc.items) {
      // skip lines that are themselves legend entries (grouped with a label)
      if (c.type !== 'connector' || (c.group && this.doc.items.some((t) => t.group === c.group && t.type === 'text'))) continue;
      const k = `${c.color}|${c.dash || ''}|${!!c.arrowEnd}`;
      if (!seen.has(k)) seen.set(k, c);
    }
    if (!seen.size) return this.toast('No lines in the drawing yet');
    const boxes = this.doc.items.map((i) => this.editor.bbox(i.id)).filter(Boolean);
    const u = M.union(boxes) || { x: 40, y: 40, w: 0, h: 0 };
    const y = Math.round((u.y + u.h + 50) / 10) * 10;
    let x = Math.max(40, Math.round(u.x / 10) * 10);
    const before = this.snapshot();
    const gid = `g${M.newId()}`;
    const items = [];
    let n = 1;
    const x0 = x, right = this.doc.page.width - 40;
    let row = y;
    for (const c of seen.values()) {
      const label = flowLabel(c, custom) || `Line style ${n}`;
      n += 1;
      const w = 58 + Math.ceil(measure(label, 14, 400));
      if (x > x0 && x + w > right) { x = x0; row += 30; }
      items.push({ ...makeConnector({ color: c.color, width: 3.5, dash: c.dash, arrowEnd: c.arrowEnd, arrowStart: c.arrowStart, arrowSize: c.arrowSize }, `M${x} ${row} L${x + 46} ${row}`), id: M.newId(), group: gid });
      items.push({ id: M.newId(), type: 'text', x: x + 58, y: row + 5, text: label, size: 14, weight: 400, color: PALETTE.ink, anchor: 'start', group: gid });
      x = x + w + 44;
    }
    x = Math.max(...items.filter((i) => i.type === 'text').map((t) => t.x + measure(t.text, 14, 400)));
    this.doc.items.push(...items);
    if (row + 40 > this.doc.page.height) this.doc.page.height = Math.ceil((row + 40) / 10) * 10;
    if (x > this.doc.page.width) this.doc.page.width = Math.ceil(x / 10) * 10;
    this.record(before);
    this.editor.renderAll();
    this.editor.setSelection(items.map((i) => i.id));
    this.toast('Legend added — edit the labels by double-clicking them');
  }

  async find() {
    const q = await this.askText('Find text in the drawing', this.lastFind || '');
    if (!q) return;
    this.lastFind = q;
    const needle = q.toLowerCase();
    const hits = this.doc.items.filter((i) => [i.text, i.name, i.sub, i.title, i.label, i.body].some((v) => v && String(v).toLowerCase().includes(needle)));
    if (!hits.length) return this.toast(`"${q}" not found`);
    this.editor.setSelection(hits.map((h) => h.id));
    this.command('zoom100');
    this.toast(`${hits.length} match${hits.length > 1 ? 'es' : ''}`);
  }

  async saveFlow() {
    const c = this.editor.selectedItems().find((i) => i.type === 'connector');
    if (!c) return this.toast('Select a line first');
    const name = await this.askText('Name for this line style (used in legends)', flowLabel(c, this.palette.customFlows()) || 'My line style');
    if (!name) return;
    const list = this.palette.customFlows();
    list.push({ key: `custom-${Date.now().toString(36)}`, label: name, color: c.color, width: c.width, dash: c.dash, arrowEnd: !!c.arrowEnd, arrowStart: !!c.arrowStart, arrowSize: c.arrowSize, custom: true });
    this.palette.saveCustomFlows(list);
    this.palette.render();
    this.toast(`Line style "${name}" saved under Connectors`);
  }

  // Exports are white unless "Export in dark" is switched on in the export menu.
  get darkExport() { return store.get('netdraw.darkExport', false); }

  exportDoc(selectionOnly) {
    const r = this.exportDocLight(selectionOnly);
    return this.darkExport ? { doc: r.doc, svg: darkSVG(r.svg) } : r;
  }

  exportDocLight(selectionOnly) {
    if (!selectionOnly || !this.editor.sel.size) return { doc: this.doc, svg: renderSVG(this.doc) };
    const ids = M.expandGroups(this.doc, this.editor.sel);
    const b = M.union([...ids].map((id) => this.editor.bbox(id)).filter(Boolean));
    const pad = 24;
    const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
    const doc = { ...this.doc, page: { ...this.doc.page, width: w, height: h }, items: this.doc.items.filter((i) => ids.has(i.id)) };
    let svg = renderSVG(doc);
    svg = svg.replace(/viewBox="0 0 [\d.]+ [\d.]+"/, `viewBox="${x} ${y} ${w} ${h}"`)
      .replace(/<rect width="[\d.]+" height="[\d.]+" fill="([^"]*)"\/>/, `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="$1"/>`);
    return { doc, svg };
  }

  async exportSvg(selectionOnly = false) {
    const { svg } = this.exportDoc(selectionOnly);
    const faces = {};
    for (const n of ['Regular', 'Medium', 'SemiBold', 'Bold']) faces[n] = await host.fontBase64(n);
    const css = fontFaceCSS((n) => `data:font/ttf;base64,${faces[n]}`);
    const out = svg.replace(/^(<svg[^>]*>)/, `$1\n<style>${css}</style>`);
    const p = await host.exportSvg({ svg: out, suggestedName: this.suggested('svg') });
    if (p) this.toast(`Exported ${p.split(/[\\/]/).pop()}${this.darkExport ? ' (dark)' : ''}`);
  }

  async exportPng(scale = 2, selectionOnly = false) {
    if (scale === 'print') scale = this.printScale(300);
    const { doc, svg } = this.exportDoc(selectionOnly);
    try {
      const p = await host.exportPng({ svg, width: doc.page.width, height: doc.page.height, scale, suggestedName: this.suggested('png') });
      if (p) this.toast(`Exported ${p.split(/[\\/]/).pop()} (${Math.round(doc.page.width * scale)} × ${Math.round(doc.page.height * scale)} px${this.darkExport ? ', dark' : ''})`);
    } catch (e) { this.toast(`PNG export failed: ${e.message}`, true); }
  }

  async copyPng(scale = 2) {
    const { doc, svg } = this.exportDoc(this.editor.sel.size > 0);
    try {
      await host.copyPng({ svg, width: doc.page.width, height: doc.page.height, scale });
      this.toast(`${this.editor.sel.size ? 'Selection' : 'Drawing'} copied as image${this.darkExport ? ' (dark)' : ''}`);
    } catch (e) { this.toast(`Copy failed: ${e.message}`, true); }
  }

  // ---------------------------------------------------------------------------------------------- item ops
  insertItems(items, { atIndex } = {}) {
    for (const it of items) if (!it.id) it.id = M.newId();
    if (atIndex == null) this.doc.items.push(...items);
    else this.doc.items.splice(atIndex, 0, ...items);
    this.editor.renderAll();
    return items.map((i) => i.id);
  }

  // Copies of items with fresh ids; attachments survive only inside the copied set.
  cloneSet(items, dx, dy) {
    const map = new Map();
    const gmap = new Map();
    const out = M.clone(items);
    for (const it of out) { const nid = M.newId(); map.set(it.id, nid); it.id = nid; }
    for (const it of out) {
      if (it.group) { if (!gmap.has(it.group)) gmap.set(it.group, `g${M.newId()}`); it.group = gmap.get(it.group); }
      for (const k of ['from', 'to']) {
        if (!it[k]) continue;
        if (map.has(it[k].id)) it[k].id = map.get(it[k].id);
        else delete it[k];
      }
      delete it.locked;
      M.translateItem(it, dx, dy);
    }
    return out;
  }

  duplicate(ids, dx = 20, dy = 20, record = true) {
    const before = record ? this.snapshot() : null;
    const set = M.expandGroups(this.doc, ids);
    const src = this.doc.items.filter((i) => set.has(i.id));
    if (!src.length) return [];
    const copies = this.cloneSet(src, dx, dy);
    const top = Math.max(...src.map((i) => M.indexOf(this.doc, i.id)));
    const newIds = this.insertItems(copies, { atIndex: top + 1 });
    if (record) { this.record(before); this.editor.setSelection(newIds); }
    return newIds;
  }

  deleteSelection() {
    const ids = M.expandGroups(this.doc, this.editor.sel);
    if (!ids.size) return;
    const before = this.snapshot();
    this.doc.items = this.doc.items.filter((i) => !ids.has(i.id));
    for (const c of this.doc.items) {
      if (c.type !== 'connector') continue;
      if (c.from && ids.has(c.from.id)) delete c.from;
      if (c.to && ids.has(c.to.id)) delete c.to;
    }
    this.record(before);
    this.editor.renderAll();
    this.editor.setSelection([]);
  }

  copy() {
    const ids = M.expandGroups(this.doc, this.editor.sel);
    const items = this.doc.items.filter((i) => ids.has(i.id));
    if (!items.length) return;
    this.clip = M.clone(items);
    this.pasteCount = 0;
    host.writeClipboardText(JSON.stringify({ netdraw: 1, items: this.clip }));
  }

  async paste() {
    let items = null;
    const cb = await host.readClipboard();
    if (cb?.text && cb.text.includes('"netdraw"')) {
      try { const j = JSON.parse(cb.text); if (j.netdraw && Array.isArray(j.items)) items = j.items; } catch { /* not ours */ }
    }
    if (!items && cb?.image) return this.addImage(cb.image, this.viewCenter());
    if (!items && cb?.text && !this.clip) {
      const p = this.viewCenter();
      return this.addItems([{ ...makeText(TEXT_PRESETS[5], p.x, p.y), text: cb.text.slice(0, 2000) }]);
    }
    items = items || this.clip;
    if (!items) return;
    this.pasteCount += 1;
    const off = 20 * this.pasteCount;
    const before = this.snapshot();
    const copies = this.cloneSet(M.normalize({ items: M.clone(items) }).items, off, off);
    const ids = this.insertItems(copies);
    this.record(before);
    this.editor.setSelection(ids);
  }

  addItems(items, opts) {
    const before = this.snapshot();
    const ids = this.insertItems(items, opts);
    this.record(before);
    this.editor.setSelection(ids);
    return ids;
  }

  zorder(how) {
    const ids = M.expandGroups(this.doc, this.editor.sel);
    if (!ids.size) return;
    const before = this.snapshot();
    const items = this.doc.items;
    if (how === 'front' || how === 'back') {
      const sel = items.filter((i) => ids.has(i.id)), rest = items.filter((i) => !ids.has(i.id));
      this.doc.items = how === 'front' ? [...rest, ...sel] : [...sel, ...rest];
    } else if (how === 'forward') {
      for (let i = items.length - 2; i >= 0; i--) {
        if (ids.has(items[i].id) && !ids.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
      }
    } else {
      for (let i = 1; i < items.length; i++) {
        if (ids.has(items[i].id) && !ids.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
      }
    }
    this.record(before);
    this.editor.renderAll();
  }

  group(on) {
    const ids = [...M.expandGroups(this.doc, this.editor.sel)];
    if (!ids.length || (on && ids.length < 2)) return;
    const before = this.snapshot();
    const gid = `g${M.newId()}`;
    for (const id of ids) { const it = M.byId(this.doc, id); if (on) it.group = gid; else delete it.group; }
    this.record(before);
    this.props.render();
    this.toast(on ? 'Grouped' : 'Ungrouped');
  }

  lock() {
    const items = this.editor.selectedItems();
    const before = this.snapshot();
    const on = !items.some((i) => i.locked);
    for (const it of items) { if (on) it.locked = true; else delete it.locked; }
    this.record(before);
    this.editor.renderAll();
    if (on) this.editor.setSelection([]);
    this.toast(on ? 'Locked: click passes through. Use "Unlock all" on the Document panel to undo.' : 'Unlocked');
  }

  unlockAll() {
    const before = this.snapshot();
    let n = 0;
    for (const it of this.doc.items) if (it.locked) { delete it.locked; n++; }
    if (n) { this.record(before); this.editor.renderAll(); }
    this.toast(`${n} item(s) unlocked`);
  }

  // Units = groups or loose items; moving them drags attached connectors along.
  units() {
    const ids = M.expandGroups(this.doc, this.editor.sel);
    const byGroup = new Map();
    for (const it of this.doc.items) {
      if (!ids.has(it.id)) continue;
      const k = it.group || it.id;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(it);
    }
    return [...byGroup.values()].map((members) => {
      const solid = members.filter((m) => m.type !== 'connector');
      return { members, box: M.union((solid.length ? solid : members).map(M.snapBox)) };
    });
  }

  moveUnits(moves) {
    const startD = new Map();
    const moving = new Set();
    for (const [u] of moves) for (const m of u.members) moving.add(m.id);
    for (const c of this.doc.items) if (c.type === 'connector' && !moving.has(c.id)) startD.set(c.id, c.d);
    const nodeMoves = new Map();
    for (const [u, d] of moves) {
      for (const m of u.members) {
        M.translateItem(m, d.dx, d.dy);
        if (m.type === 'node') nodeMoves.set(m.id, d);
      }
    }
    M.followNodes(this.doc, nodeMoves, startD, moving);
    for (const id of moving) { const c = M.byId(this.doc, id); if (c?.type === 'connector') M.refreshAttachments(this.doc, c); }
  }

  align(how) {
    const units = this.units();
    if (units.length < 2) return;
    const before = this.snapshot();
    const all = M.union(units.map((u) => u.box));
    const moves = units.map((u) => {
      const b = u.box;
      const d = { dx: 0, dy: 0 };
      if (how === 'left') d.dx = all.x - b.x;
      if (how === 'right') d.dx = all.x + all.w - (b.x + b.w);
      if (how === 'hcenter') d.dx = all.x + all.w / 2 - (b.x + b.w / 2);
      if (how === 'top') d.dy = all.y - b.y;
      if (how === 'bottom') d.dy = all.y + all.h - (b.y + b.h);
      if (how === 'vcenter') d.dy = all.y + all.h / 2 - (b.y + b.h / 2);
      return [u, d];
    });
    this.moveUnits(moves);
    this.record(before);
    this.editor.renderAll();
  }

  distribute(axis) {
    const units = this.units();
    if (units.length < 3) return this.toast('Select at least three items to distribute');
    const before = this.snapshot();
    const c = (b) => (axis === 'h' ? b.x + b.w / 2 : b.y + b.h / 2);
    units.sort((a, b) => c(a.box) - c(b.box));
    const first = c(units[0].box), last = c(units[units.length - 1].box);
    const step = (last - first) / (units.length - 1);
    const moves = units.map((u, i) => {
      const delta = first + step * i - c(u.box);
      return [u, axis === 'h' ? { dx: Math.round(delta * 100) / 100, dy: 0 } : { dx: 0, dy: Math.round(delta * 100) / 100 }];
    });
    this.moveUnits(moves);
    this.record(before);
    this.editor.renderAll();
  }

  applyFlow(conns, flow) {
    const before = this.snapshot();
    for (const c of conns) {
      Object.assign(c, { color: flow.color, width: flow.width, arrowEnd: !!flow.arrowEnd, arrowSize: flow.arrowSize || 5.2 });
      if (flow.dash) c.dash = flow.dash; else delete c.dash;
    }
    this.record(before);
    this.editor.renderItems(conns.map((c) => c.id));
  }

  fitPage() {
    const boxes = this.doc.items.map((i) => this.editor.bbox(i.id)).filter(Boolean);
    const u = M.union(boxes);
    if (!u) return;
    const before = this.snapshot();
    this.doc.page.width = Math.ceil((u.x + u.w + 30) / 10) * 10;
    this.doc.page.height = Math.ceil((u.y + u.h + 30) / 10) * 10;
    this.record(before);
    this.editor.renderAll();
    this.editor.fit();
    this.props.render();
  }

  // ---------------------------------------------------------------------------------------------- palette drops
  viewCenter() {
    const r = $('#viewport').getBoundingClientRect();
    return this.editor.toDoc({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  }

  snapPt(p) {
    if (!this.editor.gridSnap) return p;
    const g = this.doc.page.grid || 10;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  startPaletteDrag(spec, e, el) {
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    this.paletteDragged = false;
    const move = (ev) => {
      if (!this.paletteDragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!ghost) {
        this.paletteDragged = true;
        ghost = el.cloneNode(true);
        ghost.classList.add('ghost');
        document.body.appendChild(ghost);
      }
      ghost.style.left = `${ev.clientX - 24}px`;
      ghost.style.top = `${ev.clientY - 24}px`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost?.remove();
      if (this.paletteDragged) {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#viewport');
        if (over) this.createFromSpec(spec, this.snapPt(this.editor.toDoc(ev)));
        setTimeout(() => { this.paletteDragged = false; }, 0);
      } else if (spec.kind !== 'flow') this.createFromSpec(spec, this.snapPt(this.viewCenter()));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  zoneIndexFor(box) {
    let idx = 0;
    this.doc.items.forEach((it, i) => { if (it.type === 'zone' && M.inside(box, it)) idx = i + 1; });
    return idx;
  }

  belowNodes() {
    const i = this.doc.items.findIndex((it) => it.type === 'node');
    return i < 0 ? this.doc.items.length : i;
  }

  async createFromSpec(spec, p) {
    const pal = this.palette;
    if (spec.kind === 'node') {
      const label = GLYPH_LABEL[spec.glyph] || '';
      const n = makeNode(spec.glyph, p.x, p.y, pal.nodeStyle, { name: label });
      this.addItems([n]);
    } else if (spec.kind === 'device') {
      const dev = VENDOR_DEVICES.find((d) => d.key === spec.key);
      if (dev) this.addItems([makeDevice(dev, p.x, p.y, pal.nodeStyle)]);
    } else if (spec.kind === 'zone') {
      const pr = ZONE_PRESETS.find((z) => z.key === spec.key);
      const g = this.doc.page.grid || 10;
      const z = makeZone(pr, Math.round((p.x - pr.w / 2) / g) * g, Math.round((p.y - Math.min(pr.h / 2, 40)) / g) * g);
      this.addItems([z], { atIndex: this.zoneIndexFor(z) });
    } else if (spec.kind === 'flow') {
      const f = pal.allFlows().find((x) => x.key === spec.key) || FLOW_PRESETS[1];
      const c = makeConnector(f, `M${p.x - 80} ${p.y} H${p.x + 80}`);
      this.addItems([c], { atIndex: this.belowNodes() });
    } else if (spec.kind === 'text') {
      const t = makeText(TEXT_PRESETS.find((x) => x.key === spec.key), p.x, p.y);
      this.addItems([t]);
      this.inlineEdit(t);
    } else if (spec.kind === 'badge') {
      this.addItems([makeBadge2(BADGE_PRESETS.find((x) => x.key === spec.key), p.x, p.y)]);
    } else if (spec.kind === 'cloud') {
      const gid = `g${M.newId()}`;
      const cloud = { id: M.newId(), type: 'path', d: cloudPath(p.x, p.y), fill: '#F0FDFA', stroke: PALETTE.wan, strokeWidth: 2.5, group: gid };
      const t1 = { id: M.newId(), type: 'text', x: p.x, y: p.y - 2, text: 'WAN', size: 20, weight: 700, color: PALETTE.wan, anchor: 'middle', group: gid };
      const t2 = { id: M.newId(), type: 'text', x: p.x, y: p.y + 22, text: 'private WAN, managed by provider', size: 13, weight: 400, color: PALETTE.muted, anchor: 'middle', group: gid };
      const before = this.snapshot();
      this.doc.items.splice(this.belowNodes(), 0, cloud);
      this.doc.items.push(t1, t2);
      this.editor.renderAll();
      this.record(before);
      this.editor.setSelection([cloud.id, t1.id, t2.id]);
    } else if (spec.kind === 'legend') {
      const f = this.editor.flow;
      const gid = `g${M.newId()}`;
      const line = { ...makeConnector(f, `M${p.x} ${p.y} L${p.x + 46} ${p.y}`), width: 3.5, group: gid };
      const t = { type: 'text', x: p.x + 58, y: p.y + 5, text: f.label, size: 14, weight: 400, color: PALETTE.ink, anchor: 'start', group: gid };
      this.addItems([line, t]);
    } else if (spec.kind === 'autolegend') {
      this.insertLegend();
    } else if (spec.kind === 'circle') {
      this.addItems([{ type: 'circle', x: p.x, y: p.y, r: 14, fill: '#fff', stroke: PALETTE.inet, strokeWidth: 2.5, dash: '6 5' }]);
    } else if (spec.kind === 'image') {
      const url = await host.pickImage();
      if (url) this.addImage(url, p);
    } else if (spec.kind === 'lib') {
      const e = pal.library()[spec.index];
      if (!e) return;
      const cx = e.box.x + e.box.w / 2, cy = e.box.y + e.box.h / 2;
      const items = this.cloneSet(M.normalize({ items: M.clone(e.items) }).items, p.x - cx, p.y - cy);
      this.addItems(items);
    }
  }

  async addImage(url, p) {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { return this.toast('That image could not be read', true); }
    const k = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    this.addItems([{ type: 'image', x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, href: url }]);
  }

  wireDrop() {
    const vp = $('#viewport');
    vp.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    vp.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (/\.(netdraw|json)$/i.test(f.name)) {
        if (!(await this.ensureSaved())) return;
        this.loadText(await f.text(), host.pathForFile(f), f.name);
      } else if (f.type.startsWith('image/')) {
        this.addImage(await readAsDataURL(f), this.snapPt(this.editor.toDoc(e)));
      }
    });
  }

  // ---------------------------------------------------------------------------------------------- inline text editing
  inlineEdit(it) {
    const ta = $('#inline-edit');
    const ed = this.editor;
    const z = ed.zoom;
    let value, x, y, size, align = 'center', width;
    if (it.type === 'text') {
      value = it.text; size = it.size;
      const w = Math.max(160, M.estimateTextWidth(it.text, it.size, it.weight) + 40);
      x = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
      y = it.y - it.size; width = w; align = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left';
    } else if (it.type === 'node') {
      value = [it.name, it.sub].filter((s) => s !== '').join('\n') || '';
      if (!it.name && it.sub) value = `\n${it.sub}`;
      size = it.nameSize; width = 260; x = it.x - 130; y = it.y + it.r + it.nameDy - it.nameSize;
    } else if (it.type === 'zone' && it.body) {
      value = it.body; size = it.bodySize ?? 14; width = it.w - 12;
      x = it.x + 6; y = it.y + (it.bodyDy ?? 56) - size; align = 'left';
    } else if (it.type === 'zone') {
      value = it.sub ? `${it.title}\n${it.sub}` : it.title; size = it.titleSize; width = Math.min(it.w, 700);
      x = it.titleAlign === 'right' ? it.x + it.w - width - 6 : it.x + 6; y = it.y + it.titleDy - it.titleSize;
      align = it.titleAlign === 'right' ? 'right' : 'left';
    } else if (it.type === 'connector') {
      const lp = pointAt(parsePath(it.d), it.labelPos ?? 0.5);
      value = it.label || ''; size = it.labelSize ?? 12.5; width = 180; x = lp.x - 90; y = lp.y - size;
    } else if (it.type === 'badge') {
      value = it.text; size = it.size; width = 60; x = it.x - 30; y = it.y - it.size / 1.2;
    } else return;
    const s = ed.toScreen(x, y);
    Object.assign(ta.style, {
      left: `${s.x}px`, top: `${s.y}px`, width: `${width * z}px`, fontSize: `${Math.max(11, size * z)}px`, textAlign: align,
      fontWeight: it.weight || it.nameWeight || it.titleWeight || 400,
    });
    ta.value = value;
    ta.hidden = false;
    ta.rows = Math.max(1, value.split('\n').length);
    this.inline = { id: it.id, before: this.snapshot(), single: it.type === 'badge' || it.type === 'connector' };
    ta.focus();
    ta.select();
  }

  commitInline(cancel = false) {
    const st = this.inline;
    if (!st) return;
    this.inline = null;
    const ta = $('#inline-edit');
    ta.hidden = true;
    const it = M.byId(this.doc, st.id);
    if (!it || cancel) return;
    const v = ta.value;
    if (it.type === 'text') it.text = v;
    else if (it.type === 'badge') it.text = v.trim();
    else if (it.type === 'node') { const [n, ...rest] = v.split('\n'); it.name = n; it.sub = rest.join('\n'); }
    else if (it.type === 'zone' && it.body != null && it.body !== '') it.body = v;
    else if (it.type === 'zone') { const [t, ...rest] = v.split('\n'); it.title = t; it.sub = rest.join(' '); }
    else if (it.type === 'connector') { if (v.trim()) it.label = v.trim(); else delete it.label; }
    this.editor.renderItems([it.id]);
    if (st.before !== this.snapshot()) this.record(st.before);
    this.props.render();
  }

  // ---------------------------------------------------------------------------------------------- commands
  command(cmd, arg) {
    const ed = this.editor;
    const [c, a] = cmd.includes(':') ? cmd.split(':') : [cmd, arg];
    switch (c) {
      case 'new': return this.newDoc();
      case 'open': return this.open();
      case 'openPath': return this.openPath(a);
      case 'save': return this.save();
      case 'saveAs': return this.save(true);
      case 'saveAndClose': return this.save().then((ok) => ok && host.closeNow?.());
      case 'exportSvg': return this.exportSvg(a === 'sel');
      case 'exportPng': return this.exportPng(a === 'print' ? 'print' : Number(a) || 2);
      case 'exportPdf': return this.exportPdf();
      case 'legend': return this.insertLegend();
      case 'image': return this.createFromSpec({ kind: 'image' }, this.snapPt(this.viewCenter()));
      case 'find': return this.find();
      case 'saveflow': return this.saveFlow();
      case 'addLabel': {
        const c = ed.selectedItems().find((i) => i.type === 'connector');
        if (!c) return null;
        const before = this.snapshot();
        if (!c.label) c.label = 'Label';
        this.record(before); ed.renderItems([c.id]); ed.drawOverlay();
        return this.inlineEdit(c);
      }
      case 'theme': return this.applyTheme(a || (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
      case 'darkPreview': {
        const on = !store.get('netdraw.darkPreview', true);
        store.set('netdraw.darkPreview', on);
        this.applyTheme(this.theme);
        return this.toast(on ? 'Dark drawing preview on (exports stay white)' : 'Drawing shown as it exports');
      }
      case 'rulers': ed.showRulers = !ed.showRulers; store.set('netdraw.rulers', ed.showRulers); ed.fit(); return this.syncToolbar();
      case 'darkExport': {
        const on = !this.darkExport;
        store.set('netdraw.darkExport', on);
        this.syncToolbar();
        return this.toast(on ? 'Exports are now dark (PNG, PDF, SVG, copy as image)' : 'Exports are white again');
      }
      case 'present': return this.setPresenting(!ed.present);
      case 'fullscreen': return host.toggleFullScreen?.();
      case 'uiZoom': { const f = Number(a) || 1; store.set('netdraw.uiZoom', f); host.setUiZoom?.(f); return setTimeout(() => ed.layout(), 50); }
      case 'exportPngSel': return this.exportPng(Number(a) || 2, true);
      case 'copyPng': return this.copyPng(2);
      case 'undo': return this.undo();
      case 'redo': return this.redo();
      case 'cut': this.copy(); return this.deleteSelection();
      case 'copy': return this.copy();
      case 'paste': return this.paste();
      case 'duplicate': return this.duplicate([...ed.sel]);
      case 'delete': return this.deleteSelection();
      case 'selectAll': return ed.setSelection(this.doc.items.filter((i) => !i.locked && !i.hidden).map((i) => i.id));
      case 'front': case 'back': case 'forward': case 'backward': return this.zorder(c);
      case 'group': return this.group(true);
      case 'ungroup': return this.group(false);
      case 'lock': return this.lock();
      case 'unlockall': return this.unlockAll();
      case 'align': return this.align(a);
      case 'dist': return this.distribute(a);
      case 'route': return ed.reroute(a);
      case 'reverse': return ed.reverse();
      case 'detach': {
        const before = this.snapshot();
        for (const it of ed.selectedItems()) { delete it.from; delete it.to; }
        this.record(before); ed.drawOverlay(); return this.props.render();
      }
      case 'autoattach': {
        const before = this.snapshot();
        const n = M.autoAttach(this.doc);
        if (n) this.record(before);
        return this.toast(`${n} line end(s) connected to icons`);
      }
      case 'fitpage': return this.fitPage();
      case 'zoomIn': return ed.setZoom(ed.zoom * 1.25);
      case 'zoomOut': return ed.setZoom(ed.zoom / 1.25);
      case 'zoomFit': return ed.fit();
      case 'zoom100': {
        ed.setZoom(1);
        const b = M.union([...ed.sel].map((id) => ed.bbox(id)).filter(Boolean));
        if (b) {
          const r = $('#viewport').getBoundingClientRect();
          ed.panX = r.width / 2 - (b.x + b.w / 2); ed.panY = r.height / 2 - (b.y + b.h / 2); ed.layout();
        }
        return null;
      }
      case 'grid': ed.showGrid = !ed.showGrid; ed.drawOverlay(); return this.syncToolbar();
      case 'snap': ed.snap = !ed.snap; ed.gridSnap = ed.snap; return this.syncToolbar();
      case 'mode': ed.mode = a; return this.syncToolbar();
      case 'routeStyle': ed.routeStyle = a; this.palette.render(); return this.syncToolbar();
      case 'edit': { const it = ed.selectedItems()[0]; if (it) this.inlineEdit(it); return null; }
      case 'shortcuts': return this.showShortcuts();
      case 'mcp': return this.showMcp();
      case 'about': return this.toast(`NetDraw ${host.version || ''} · drag-and-drop network and architecture diagrams`);
      default: return null;
    }
  }

  // ---------------------------------------------------------------------------------------------- toolbar & keys
  wireToolbar() {
    document.querySelectorAll('#toolbar [data-cmd]').forEach((b) => b.addEventListener('click', (e) => {
      if (b.dataset.menu) return this.toggleMenu(b, e);
      this.command(b.dataset.cmd);
    }));
    document.querySelectorAll('.menu [data-cmd]').forEach((b) => b.addEventListener('click', () => { this.closeMenus(); this.command(b.dataset.cmd); }));
    $('#zoomlabel').addEventListener('click', () => this.command('zoom100'));
    this.syncToolbar();
  }

  toggleMenu(btn) {
    const m = document.getElementById(btn.dataset.menu);
    const open = m.hidden;
    this.closeMenus();
    if (!open) return;
    const pg = this.doc.page;
    const k = pg.mmPerPx || MM_PER_PX;
    m.querySelectorAll('[data-dim]').forEach((el) => {
      const d = el.dataset.dim;
      const sc = d === 'print' ? this.printScale(300) : Number(d);
      el.textContent = d === 'pdf' ? `${Math.round(pg.width * k)} × ${Math.round(pg.height * k)} mm`
        : `${Math.round(pg.width * sc)} × ${Math.round(pg.height * sc)} px`;
    });
    m.hidden = false;
    const r = btn.getBoundingClientRect();
    m.style.left = `${Math.min(r.left, window.innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${r.bottom + 4}px`;
  }

  closeMenus() {
    document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
    $('#ctxmenu').hidden = true;
  }

  syncToolbar() {
    const ed = this.editor;
    document.querySelectorAll('[data-cmd^="mode:"]').forEach((b) => b.classList.toggle('on', b.dataset.cmd === `mode:${ed.mode}`));
    document.querySelectorAll('[data-cmd^="routeStyle:"]').forEach((b) => b.classList.toggle('on', b.dataset.cmd === `routeStyle:${ed.routeStyle}`));
    $('[data-cmd="grid"]')?.classList.toggle('on', ed.showGrid);
    $('[data-cmd="snap"]')?.classList.toggle('on', ed.snap);
    $('[data-cmd="theme"]')?.classList.toggle('on', document.documentElement.dataset.theme === 'dark');
    document.querySelectorAll('[data-cmd="darkExport"]').forEach((b) => b.classList.toggle('checked', this.darkExport));
    $('#viewport').classList.toggle('connect', ed.mode === 'connect');
    $('#viewport').classList.toggle('pan', ed.mode === 'pan');
    this.status();
  }

  onView() {
    const z = $('#zoomlabel');
    if (z) z.textContent = `${Math.round(this.editor.zoom * 100)}%`;
  }

  onSelection() {
    this.props.render();
    this.status();
  }

  onPointer(p) {
    const el = $('#coords');
    if (el) el.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
  }

  status() {
    const ed = this.editor;
    const n = ed.sel.size;
    let hint;
    if (ed.mode === 'connect') hint = 'Connect: drag from one icon to another. Esc to stop.';
    else if (n === 1 && ed.selectedItems()[0]?.type === 'connector') hint = 'Drag the ends onto icons · double-click the line to add a bend · Alt+click a bend to remove it';
    else if (n) hint = `${n} selected · arrows nudge (Shift = 10) · Ctrl+drag copies · Alt+drag moves a container without its contents`;
    else hint = 'Drag icons from the left · drag from an icon\'s blue dot to connect · drag empty space (or inside a container) to select';
    $('#hint').textContent = hint;
  }

  wireKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (e.target.id === 'inline-edit') {
        if (e.key === 'Escape') { e.preventDefault(); this.commitInline(true); }
        else if (e.key === 'Enter' && (e.ctrlKey || this.inline?.single || (!e.shiftKey && M.byId(this.doc, this.inline?.id)?.type === 'badge'))) { e.preventDefault(); this.commitInline(); }
        return;
      }
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'f5') { e.preventDefault(); return this.command('present'); }
      if (k === 'f11') { e.preventDefault(); return this.command('fullscreen'); }
      if (this.editor.present) {
        // view-only: leave, zoom and pan are the only keys that do something
        e.preventDefault();
        this.wakePresentBar();
        const ed = this.editor;
        if (k === 'escape') return this.setPresenting(false);
        if (k === '+' || k === '=') return ed.setZoom(ed.zoom * 1.25);
        if (k === '-') return ed.setZoom(ed.zoom / 1.25);
        if (k === '0' || k === 'f' || k === 'home') return ed.fit();
        if (k === '1') return ed.setZoom(1);
        if (k === 'd') return this.command('theme');
        const pan = { arrowleft: [80, 0], arrowright: [-80, 0], arrowup: [0, 80], arrowdown: [0, -80] }[k];
        if (pan) { ed.panX += pan[0]; ed.panY += pan[1]; ed.layout(); }
        return undefined;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // document-level shortcuts still work from a panel field; everything else stays with the field
        if (!ctrl || !['n', 'o', 's', 'e', 'p', 'f'].includes(k)) return undefined;
        e.target.blur();
      }
      const run = (c) => { e.preventDefault(); this.command(c); };
      if (ctrl) {
        if (k === 'n') return run('new');
        if (k === 'o') return run('open');
        if (k === 's') return run(e.shiftKey ? 'saveAs' : 'save');
        if (k === 'e') return run(e.shiftKey ? 'exportSvg' : 'exportPng:2');
        if (k === 'z') return run(e.shiftKey ? 'redo' : 'undo');
        if (k === 'y') return run('redo');
        if (k === 'x') return run('cut');
        if (k === 'c') return run(e.shiftKey ? 'copyPng' : 'copy');
        if (k === 'v') return run('paste');
        if (k === 'd') return run('duplicate');
        if (k === 'a') return run('selectAll');
        if (k === 'g') return run(e.shiftKey ? 'ungroup' : 'group');
        if (k === 'l') return run('lock');
        if (k === ']' || k === '}') return run(e.shiftKey ? 'front' : 'forward');
        if (k === '[' || k === '{') return run(e.shiftKey ? 'back' : 'backward');
        if (k === '=' || k === '+') return run('zoomIn');
        if (k === '-') return run('zoomOut');
        if (k === '0') return run('zoomFit');
        if (k === '1') return run('zoom100');
        if (k === "'") return run('grid');
        if (k === 'f') return run('find');
        if (k === 'p') return run(e.shiftKey ? 'exportPdf' : 'exportPng:print');
        return undefined;
      }
      if (k === 'delete' || k === 'backspace') return run('delete');
      if (k === 'escape') {
        const dr = this.editor.drag;
        if (dr) {
          // cancel the gesture: put the document back as it was when the drag started
          this.editor.drag = null; this.editor.guides = [];
          if (dr.started && dr.before && dr.before !== this.snapshot()) { this.doc = JSON.parse(dr.before); this.editor.renderAll(); }
          this.editor.drawOverlay();
          return undefined;
        }
        this.closeMenus();
        if (this.editor.mode !== 'select') return run('mode:select');
        return this.editor.setSelection([]);
      }
      if (k === 'f2' || k === 'enter') return run('edit');
      if (k === 'v') return run('mode:select');
      if (k === 'c') return run('mode:connect');
      if (k === 'h') return run('mode:pan');
      if (k === 'g') return run('grid');
      if (k === 'r') return run('rulers');
      if (k === 'l' && this.editor.selectedItems().some((i) => i.type === 'connector')) return run('addLabel');
      if (k === ' ') { e.preventDefault(); this.editor.spaceDown = true; $('#viewport').classList.add('pan'); return undefined; }
      const step = e.shiftKey ? 10 : 1;
      const arrows = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (arrows[k]) { e.preventDefault(); this.editor.nudge(...arrows[k]); }
      return undefined;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') { this.editor.spaceDown = false; $('#viewport').classList.toggle('pan', this.editor.mode === 'pan'); }
    });
    window.addEventListener('mousemove', () => { if (this.editor.present) this.wakePresentBar(); });
    document.querySelectorAll('#presentbar [data-cmd]').forEach((b) => b.addEventListener('click', () => this.command(b.dataset.cmd)));
    $('#inline-edit').addEventListener('blur', () => this.commitInline());
    $('#inline-edit').addEventListener('input', (e) => { e.target.rows = Math.max(1, e.target.value.split('\n').length); });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.menu, #ctxmenu, [data-menu]')) this.closeMenus();
    });
  }

  contextMenu(x, y, it) {
    const m = $('#ctxmenu');
    const sel = this.editor.selectedItems();
    const one = sel.length === 1 ? sel[0] : null;
    const items = [];
    const add = (cmd, label, key = '') => items.push(`<button data-cmd="${cmd}"><span>${label}</span><kbd>${key}</kbd></button>`);
    const sep = () => items.push('<hr>');
    if (it) {
      if (one && ['text', 'node', 'zone', 'badge'].includes(one.type)) { add('edit', 'Edit text', 'F2'); sep(); }
      add('cut', 'Cut', 'Ctrl+X'); add('copy', 'Copy', 'Ctrl+C'); add('paste', 'Paste', 'Ctrl+V'); add('duplicate', 'Duplicate', 'Ctrl+D');
      add('copyPng', 'Copy selection as image', 'Ctrl+Shift+C'); add('exportPngSel:2', 'Export selection as PNG…');
      sep();
      if (sel.some((i) => i.type === 'connector')) {
        add('addLabel', one?.label ? 'Edit label' : 'Add label', 'L');
        add('saveflow', 'Save as line style…');
        add('route:curve', 'Route as curve'); add('route:orthogonal', 'Route orthogonally'); add('route:straight', 'Route straight'); add('reverse', 'Reverse direction'); sep();
      }
      add('front', 'Bring to front', 'Ctrl+Shift+]'); add('back', 'Send to back', 'Ctrl+Shift+['); sep();
      if (sel.length > 1) add('group', 'Group', 'Ctrl+G');
      if (sel.some((i) => i.group)) add('ungroup', 'Ungroup', 'Ctrl+Shift+G');
      add('lock', sel.some((i) => i.locked) ? 'Unlock' : 'Lock', 'Ctrl+L');
      sep(); add('delete', 'Delete', 'Del');
    } else {
      add('paste', 'Paste', 'Ctrl+V'); add('selectAll', 'Select all', 'Ctrl+A'); sep();
      add('legend', 'Insert legend of used lines'); add('find', 'Find text…', 'Ctrl+F'); sep();
      add('zoomFit', 'Fit to window', 'Ctrl+0'); add('grid', 'Show grid', 'G'); add('rulers', 'Show rulers', 'R'); add('unlockall', 'Unlock all'); add('fitpage', 'Fit page to content');
    }
    m.innerHTML = items.join('');
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    m.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    m.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => { this.closeMenus(); this.command(b.dataset.cmd); }));
  }

  showShortcuts() {
    const rows = [
      ['Drag icon from the left', 'Add it'], ['Drag from an icon\'s blue dot', 'Draw a connector'], ['C / V / H', 'Connect / select / pan mode'],
      ['Double-click', 'Edit text · add a bend to a line'], ['Ctrl+drag', 'Copy while dragging'], ['Alt+drag a container', 'Move it without its contents'],
      ['Alt+click', 'Select one item inside a group'], ['Shift+drag', 'Move along one axis'], ['Arrows / Shift+arrows', 'Nudge 1 / 10 px'],
      ['Space+drag, middle mouse', 'Pan'], ['Ctrl+wheel', 'Zoom'], ['Ctrl+0 / Ctrl+1', 'Fit / 100%'], ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
      ['Ctrl+] / Ctrl+[', 'Forward / backward (Shift: front / back)'], ['Ctrl+E / Ctrl+Shift+E', 'Export PNG / SVG'], ['Ctrl+Shift+C', 'Copy as image (for Word)'],
      ['F5', 'Presentation mode (view-only, for screen sharing); Esc leaves it'], ['F11', 'Full screen'],
      ['G / R', 'Show grid / rulers'], ['Ctrl+L', 'Lock'], ['L', 'Label on the selected line'], ['Ctrl+F', 'Find text'],
      ['Ctrl+P / Ctrl+Shift+P', 'PNG for print (300 dpi) / PDF'], ['Ctrl+N', 'New drawing (paper size or template)'],
    ];
    this.modal('Keyboard and mouse', `<table class="keys">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>`);
  }

  async showMcp() {
    const info = await host.mcpInfo?.();
    if (!info) return this.toast('Only available in the desktop app');
    const body = '<p>NetDraw has a built-in <b>MCP server</b>, so an AI assistant (Claude Desktop, Claude Code, or any other ' +
      'MCP client) can build and change drawings. With NetDraw open it works on this drawing <b>live</b>, and every change ' +
      'is an undo step. It can also work on .netdraw files directly.</p>' +
      '<h4>Claude Desktop</h4><p>Adds NetDraw to its configuration. Restart Claude Desktop afterwards.</p>' +
      '<div class="btns"><button class="btn primary" id="mcp-install">Add to Claude Desktop</button></div>' +
      `<h4>Claude Code</h4><pre class="code" id="mcp-cc">${esc(info.claudeCode)}</pre>` +
      '<div class="btns"><button class="btn" data-copy="mcp-cc">Copy command</button></div>' +
      `<h4>Other MCP clients</h4><pre class="code" id="mcp-json">${esc(info.desktop)}</pre>` +
      '<div class="btns"><button class="btn" data-copy="mcp-json">Copy configuration</button></div>' +
      '<p class="hint" style="margin:10px 0 0">Try: "Draw our branch network in NetDraw: two sites, a firewall and the internet, then show me a preview."</p>';
    return this.modal('Connect an AI assistant', body, [['Close', true]], (wrap) => {
      wrap.querySelector('#mcp-install').addEventListener('click', async () => {
        try {
          const done = await host.mcpInstallDesktop();
          this.toast(`Added to ${done.length} Claude Desktop configuration${done.length > 1 ? 's' : ''}. Restart Claude Desktop.`);
        } catch (e) { this.toast(e.message, true); }
      });
      wrap.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
        host.copyText(wrap.querySelector(`#${b.dataset.copy}`).textContent);
        this.toast('Copied');
      }));
    });
  }

  modal(title, body, buttons = [['Close', true]], setup = null) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><div class="body">${body}</div><div class="btns end">` +
        buttons.map(([l, primary], i) => `<button class="btn${primary ? ' primary' : ''}" data-i="${i}">${esc(l)}</button>`).join('') + '</div></div>';
      document.body.appendChild(wrap);
      const done = (i) => { this.modalValue = wrap.querySelector('input')?.value; wrap.remove(); resolve(i); };
      wrap.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => done(Number(b.dataset.i))));
      wrap.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') done(-1);
        if (e.key === 'Enter') done(0);
      });
      setup?.(wrap);
      (wrap.querySelector('input') || wrap.querySelector('.primary'))?.focus();
    });
  }

  async askText(title, def = '') {
    const i = await this.modal(title, `<input class="wide" type="text" value="${esc(def)}">`, [['OK', true], ['Cancel', false]]);
    return i === 0 ? (this.modalValue ?? def) : null;
  }

  toast(msg, error = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = error ? 'show error' : 'show';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.className = ''; }, error ? 6000 : 2600);
  }
}

window.app = new App();
