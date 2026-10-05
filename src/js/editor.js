// Canvas editor: rendering, selection, moving with smart guides, resizing, connector drawing and editing.
import { renderSVG, renderItemWrapped, markerDefs } from './render.js';
import * as M from './model.js';
import {
  parsePath, serializePath, moveStart, moveEnd, startPoint, endPoint, splitSegment, nearestSegment, route, fmt,
  reverseSegs, scaleSegs, pathBBox, pointAt, nearestT,
} from './path.js';
import { makeConnector, FLOW_PRESETS, MM_PER_PX } from './presets.js';

const RULER = 22;

const NS = 'http://www.w3.org/2000/svg';
const SEL = '#2563EB';
const GUIDE = '#E11D48';

export class Editor {
  constructor(app, viewport) {
    this.app = app;
    this.vp = viewport;
    this.stage = viewport.querySelector('#stage');
    this.pageEl = viewport.querySelector('#page');
    this.ov = viewport.querySelector('#overlay');
    this.zoom = 1; this.panX = 40; this.panY = 40;
    this.sel = new Set();
    this.snap = true; this.gridSnap = true; this.showGrid = false;
    this.mode = 'select';
    this.routeStyle = 'curve';
    this.flow = FLOW_PRESETS[1];
    this.drag = null;
    this.hover = null;
    this.guides = [];
    this.spaceDown = false;
    this.showRulers = true;
    this.darkPreview = false;
    this.rx = viewport.querySelector('#ruler-x');
    this.ry = viewport.querySelector('#ruler-y');
    this.bind();
  }

  setDarkPreview(on) {
    this.darkPreview = on;
    this.stage.classList.toggle('dark-preview', on);
  }

  // ---------------------------------------------------------------------------------------------- rulers (mm)
  drawRulers(mouse) {
    const show = this.showRulers && !this.present;
    this.vp.classList.toggle('rulers', show);
    if (!show || !this.rx) return;
    const r = this.vp.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--ruler-bg').trim() || '#F8FAFC';
    const fg = css.getPropertyValue('--ruler-fg').trim() || '#64748B';
    const page = css.getPropertyValue('--ruler-page').trim() || '#FFFFFF';
    const mmPerPx = this.doc.page.mmPerPx || MM_PER_PX;
    const pxPerMm = this.zoom / mmPerPx;                  // screen px per mm
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const minor = steps.find((st) => st * pxPerMm >= 7) || 1000;
    const major = steps.find((st) => st >= minor * 5 && st * pxPerMm >= 60) || minor * 10;
    const { width: W, height: H } = this.doc.page;
    const draw = (cv, horiz) => {
      const len = horiz ? r.width : r.height;
      cv.width = Math.round((horiz ? len : RULER) * dpr); cv.height = Math.round((horiz ? RULER : len) * dpr);
      cv.style.width = `${horiz ? len : RULER}px`; cv.style.height = `${horiz ? RULER : len}px`;
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = bg; g.fillRect(0, 0, horiz ? len : RULER, horiz ? RULER : len);
      const o = horiz ? this.panX : this.panY, ext = (horiz ? W : H) * this.zoom;
      g.fillStyle = page;
      if (horiz) g.fillRect(o, 0, ext, RULER); else g.fillRect(0, o, RULER, ext);
      g.strokeStyle = fg; g.fillStyle = fg; g.lineWidth = 1;
      g.font = '10px "IBM Plex Sans", sans-serif';
      const first = Math.floor((-o / pxPerMm) / minor) * minor;
      const last = ((len - o) / pxPerMm);
      g.beginPath();
      for (let mm = first; mm <= last; mm += minor) {
        const p = Math.round(o + mm * pxPerMm) + 0.5;
        const isMajor = Math.abs(mm % major) < 1e-6;
        const t = isMajor ? 10 : (Math.abs(mm % (minor * 5)) < 1e-6 ? 6 : 3);
        if (horiz) { g.moveTo(p, RULER); g.lineTo(p, RULER - t); } else { g.moveTo(RULER, p); g.lineTo(RULER - t, p); }
        if (isMajor) {
          const label = `${Math.round(mm)}`;
          if (horiz) g.fillText(label, p + 3, 10);
          else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.fillText(label, -g.measureText(label).width, 0); g.restore(); }
        }
      }
      g.stroke();
      if (mouse) {
        const m = (horiz ? mouse.x : mouse.y) * this.zoom + o;
        g.strokeStyle = '#2563EB'; g.beginPath();
        if (horiz) { g.moveTo(m + 0.5, 0); g.lineTo(m + 0.5, RULER); } else { g.moveTo(0, m + 0.5); g.lineTo(RULER, m + 0.5); }
        g.stroke();
      }
      g.strokeStyle = css.getPropertyValue('--line').trim() || '#E2E8F0';
      g.beginPath();
      if (horiz) { g.moveTo(0, RULER - 0.5); g.lineTo(len, RULER - 0.5); } else { g.moveTo(RULER - 0.5, 0); g.lineTo(RULER - 0.5, len); }
      g.stroke();
    };
    draw(this.rx, true);
    draw(this.ry, false);
  }

  get doc() { return this.app.doc; }

  // ---------------------------------------------------------------------------------------------- rendering
  renderAll() {
    this.hover = this.hover && M.byId(this.doc, this.hover.id);
    this.pageEl.innerHTML = renderSVG(this.doc, { wrap: true, hit: true });
    this.svg = this.pageEl.firstElementChild;
    for (const it of this.doc.items) if (it.locked) this.gEl(it.id)?.classList.add('locked');
    this.layout();
  }

  gEl(id) { return this.svg?.querySelector(`g[data-id="${CSS.escape(id)}"]`); }

  renderItems(ids) {
    if (!this.svg) return this.renderAll();
    let needFull = false;
    for (const id of ids) {
      const it = M.byId(this.doc, id);
      const g = this.gEl(id);
      if (!it) { g?.remove(); continue; }
      if (!g) { needFull = true; break; }
      g.innerHTML = renderItemWrapped(it, true);
      g.classList.toggle('locked', !!it.locked);
      g.style.display = it.hidden ? 'none' : '';
    }
    if (needFull) return this.renderAll();
    this.svg.querySelector('defs').innerHTML = markerDefs(this.doc);
    this.drawOverlay();
  }

  layout() {
    const { width: W, height: H } = this.doc.page;
    const w = W * this.zoom, h = H * this.zoom;
    Object.assign(this.stage.style, { left: `${this.panX}px`, top: `${this.panY}px`, width: `${w}px`, height: `${h}px` });
    if (this.svg) { this.svg.setAttribute('width', w); this.svg.setAttribute('height', h); }
    this.ov.setAttribute('width', w); this.ov.setAttribute('height', h);
    this.ov.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.drawOverlay();
    this.drawRulers();
    this.app.onView?.();
  }

  fit() {
    const r = this.vp.getBoundingClientRect();
    const { width: W, height: H } = this.doc.page;
    const m = this.showRulers && !this.present ? RULER : 0;
    this.zoom = Math.max(0.05, Math.min((r.width - m - 60) / W, (r.height - m - 60) / H, 4));
    this.panX = m + (r.width - m - W * this.zoom) / 2;
    this.panY = m + (r.height - m - H * this.zoom) / 2;
    this.layout();
  }

  setZoom(z, cx, cy) {
    const r = this.vp.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const nz = Math.max(0.05, Math.min(8, z));
    this.panX = cx - (cx - this.panX) * (nz / this.zoom);
    this.panY = cy - (cy - this.panY) * (nz / this.zoom);
    this.zoom = nz;
    this.layout();
  }

  toDoc(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
  }

  toScreen(x, y) {
    const r = this.stage.getBoundingClientRect();
    return { x: r.left + x * this.zoom, y: r.top + y * this.zoom };
  }

  bbox(id) {
    const g = this.gEl(id);
    const it = M.byId(this.doc, id);
    if (!g || !it) return null;
    if (it.type === 'connector' || it.type === 'path') return pathBBox(parsePath(it.d));
    try { const b = g.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { return M.snapBox(it); }
  }

  // ---------------------------------------------------------------------------------------------- selection
  setSelection(ids) {
    this.sel = new Set(ids);
    this.drawOverlay();
    this.app.onSelection?.();
  }

  selectedItems() { return this.doc.items.filter((i) => this.sel.has(i.id)); }

  // ---------------------------------------------------------------------------------------------- overlay
  el(tag, attrs, parent = this.ov) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  }

  drawOverlay() {
    const ov = this.ov;
    ov.replaceChildren();
    if (this.present) return;
    const px = 1 / this.zoom;
    const { width: W, height: H } = this.doc.page;
    if (this.showGrid) {
      const g = this.doc.page.grid || 10;
      const step = g * Math.max(1, Math.ceil(6 / (g * this.zoom)));
      const defs = this.el('defs', {});
      const pat = this.el('pattern', { id: 'gridpat', width: step, height: step, patternUnits: 'userSpaceOnUse' }, defs);
      this.el('circle', { cx: 0, cy: 0, r: 1.1 * px, fill: '#94A3B8' }, pat);
      this.el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#gridpat)', 'pointer-events': 'none' });
    }
    const items = this.selectedItems();
    for (const it of items) {
      if (it.type === 'connector') continue;
      const b = this.bbox(it.id);
      if (!b) continue;
      this.el('rect', {
        x: b.x - 4 * px, y: b.y - 4 * px, width: b.w + 8 * px, height: b.h + 8 * px, fill: 'none', stroke: SEL,
        'stroke-width': 1.2 * px, 'stroke-dasharray': `${4 * px} ${3 * px}`, 'pointer-events': 'none',
      });
    }
    if (items.length === 1) this.drawHandles(items[0], px);
    else if (items.length > 1) {
      const u = M.union(items.map((i) => this.bbox(i.id)).filter(Boolean));
      if (u) this.el('rect', { x: u.x - 8 * px, y: u.y - 8 * px, width: u.w + 16 * px, height: u.h + 16 * px, fill: 'none', stroke: SEL, 'stroke-width': 1 * px, 'pointer-events': 'none' });
      for (const it of items) if (it.type === 'connector') this.connectorOutline(it, px);
    }
    for (const g of this.guides) {
      if (g.x != null) this.el('line', { x1: g.x, y1: 0, x2: g.x, y2: H, stroke: GUIDE, 'stroke-width': px, 'pointer-events': 'none' });
      else this.el('line', { x1: 0, y1: g.y, x2: W, y2: g.y, stroke: GUIDE, 'stroke-width': px, 'pointer-events': 'none' });
    }
    const d = this.drag;
    if (d?.kind === 'marquee' && d.started) {
      const x = Math.min(d.p0.x, d.p.x), y = Math.min(d.p0.y, d.p.y);
      this.el('rect', { x, y, width: Math.abs(d.p.x - d.p0.x), height: Math.abs(d.p.y - d.p0.y), fill: 'rgba(37,99,235,.08)', stroke: SEL, 'stroke-width': px, 'pointer-events': 'none' });
    }
    if (d?.kind === 'connect' && d.preview) {
      this.el('path', { d: d.preview, fill: 'none', stroke: d.flow.color, 'stroke-width': d.flow.width, 'stroke-dasharray': d.flow.dash || null, opacity: 0.75, 'stroke-linecap': 'round', 'pointer-events': 'none' });
    }
    const target = d?.target || (d?.kind === 'end' && d.snapNode);
    if (target) this.el('circle', { cx: target.x, cy: target.y, r: target.r + 6 * px, fill: 'none', stroke: '#16A34A', 'stroke-width': 3 * px, 'pointer-events': 'none' });
    if (!d && this.hover && (this.mode === 'connect' || !this.sel.has(this.hover.id) || this.sel.size === 1)) this.drawPorts(this.hover, px);
  }

  drawPorts(n, px) {
    const pts = [[n.r, 0], [-n.r, 0], [0, n.r], [0, -n.r]];
    for (const [dx, dy] of pts) {
      this.el('circle', {
        cx: n.x + dx, cy: n.y + dy, r: 5.5 * px, fill: '#fff', stroke: SEL, 'stroke-width': 2 * px,
        'data-handle': 'port', 'data-id': n.id, class: 'h-port',
      });
    }
  }

  connectorOutline(c, px) {
    this.el('path', { d: c.d, fill: 'none', stroke: SEL, 'stroke-width': c.width + 5 * px, opacity: 0.25, 'pointer-events': 'none', 'stroke-linecap': 'round' });
  }

  drawHandles(it, px) {
    const hs = 8 * px;
    const square = (x, y, attrs) => this.el('rect', { x: x - hs / 2, y: y - hs / 2, width: hs, height: hs, fill: '#fff', stroke: SEL, 'stroke-width': 1.5 * px, ...attrs });
    if (it.type === 'zone' || it.type === 'image' || it.type === 'path') {
      const b = it.type === 'path' ? pathBBox(parsePath(it.d)) : { x: it.x, y: it.y, w: it.w, h: it.h };
      const dirs = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
      for (const [dir, [fx, fy]] of Object.entries(dirs)) {
        square(b.x + b.w * fx, b.y + b.h * fy, { 'data-handle': 'resize', 'data-dir': dir, class: `h-resize h-${dir}` });
      }
    }
    if (['node', 'text', 'badge', 'circle'].includes(it.type)) {
      // corner handles scale the item (icon disc + glyph, text size, marker); side handles set a text's wrap width
      const b = it.type === 'text' ? (this.bbox(it.id) || M.snapBox(it)) : M.snapBox(it);
      const dirs = { nw: [0, 0], ne: [1, 0], se: [1, 1], sw: [0, 1] };
      if (it.type === 'text') Object.assign(dirs, { e: [1, 0.5], w: [0, 0.5] });
      for (const [dir, [fx, fy]] of Object.entries(dirs)) {
        square(b.x + b.w * fx, b.y + b.h * fy, { 'data-handle': 'scale', 'data-dir': dir, class: `h-resize h-${dir}` });
      }
    }
    if (it.type === 'connector') {
      this.connectorOutline(it, px);
      const segs = parsePath(it.d);
      let prev = null;
      segs.forEach((s, i) => {
        if (s.c === 'C') {
          this.el('line', { x1: prev.x, y1: prev.y, x2: s.x1, y2: s.y1, stroke: SEL, 'stroke-width': px, 'pointer-events': 'none' });
          this.el('line', { x1: s.x, y1: s.y, x2: s.x2, y2: s.y2, stroke: SEL, 'stroke-width': px, 'pointer-events': 'none' });
          this.el('circle', { cx: s.x1, cy: s.y1, r: 4.5 * px, fill: SEL, 'data-handle': 'ctrl', 'data-seg': i, 'data-k': '1', class: 'h-ctrl' });
          this.el('circle', { cx: s.x2, cy: s.y2, r: 4.5 * px, fill: SEL, 'data-handle': 'ctrl', 'data-seg': i, 'data-k': '2', class: 'h-ctrl' });
        } else if (s.c === 'Q') {
          this.el('path', { d: `M${prev.x} ${prev.y} L${s.x1} ${s.y1} L${s.x} ${s.y}`, fill: 'none', stroke: SEL, 'stroke-width': px, 'pointer-events': 'none' });
          this.el('circle', { cx: s.x1, cy: s.y1, r: 4.5 * px, fill: SEL, 'data-handle': 'ctrl', 'data-seg': i, 'data-k': '1', class: 'h-ctrl' });
        }
        if ('x' in s) prev = s;
      });
      if (it.label) {
        const lp = pointAt(segs, it.labelPos ?? 0.5);
        const k = 6 * px;
        this.el('path', { d: `M${lp.x} ${lp.y - k} L${lp.x + k} ${lp.y} L${lp.x} ${lp.y + k} L${lp.x - k} ${lp.y} Z`, fill: '#fff', stroke: '#D97706', 'stroke-width': 2 * px, 'data-handle': 'label', class: 'h-vertex' });
      }
      const last = segs.length - 1;
      segs.forEach((s, i) => {
        if (!('x' in s)) return;
        if (i === 0 || i === last) {
          const att = i === 0 ? it.from : it.to;
          this.el('circle', {
            cx: s.x, cy: s.y, r: 6.5 * px, fill: att ? '#16A34A' : '#fff', stroke: att ? '#fff' : SEL, 'stroke-width': 2 * px,
            'data-handle': 'end', 'data-end': i === 0 ? 'from' : 'to', class: 'h-end',
          });
        } else square(s.x, s.y, { 'data-handle': 'vertex', 'data-seg': i, class: 'h-vertex' });
      });
    }
  }

  // ---------------------------------------------------------------------------------------------- events
  bind() {
    const vp = this.vp;
    vp.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    vp.addEventListener('dblclick', (e) => this.onDouble(e));
    vp.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    vp.addEventListener('contextmenu', (e) => this.onContext(e));
    vp.addEventListener('pointerleave', () => { if (!this.drag && this.hover) { this.hover = null; this.drawOverlay(); } });
    window.addEventListener('resize', () => (this.present ? this.fit() : this.layout()));
  }

  itemFromEvent(e) {
    const g = e.target.closest?.('#page g[data-id]');
    return g ? M.byId(this.doc, g.dataset.id) : null;
  }

  onWheel(e) {
    e.preventDefault();
    const r = this.vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018));
      this.setZoom(this.zoom * f, e.clientX - r.left, e.clientY - r.top);
    } else {
      const k = e.deltaMode ? 30 : 1;
      if (e.shiftKey) this.panX -= (e.deltaY || e.deltaX) * k;
      else { this.panX -= e.deltaX * k; this.panY -= e.deltaY * k; }
      this.layout();
    }
  }

  onDown(e) {
    this.app.closeMenus?.();
    this.app.commitInline?.();
    // presentation mode is view-only: any drag pans, nothing can be selected or changed
    if (e.button === 1 || (e.button === 0 && (this.present || this.spaceDown || this.mode === 'pan'))) {
      e.preventDefault();
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: this.panX, py: this.panY };
      this.vp.classList.add('panning');
      return;
    }
    const p = this.toDoc(e);
    const h = e.target.closest?.('[data-handle]');
    if (e.button === 2) {
      const it = this.itemFromEvent(e);
      if (it && !this.sel.has(it.id)) this.setSelection(e.altKey ? [it.id] : M.groupMembers(this.doc, it.id));
      return;
    }
    if (e.button !== 0) return;
    if (h) return this.startHandle(h, e, p);
    const it = this.itemFromEvent(e);
    if (it && this.mode === 'connect' && it.type === 'node') return this.startConnect(it, e, p);
    if (it) {
      const members = e.altKey ? [it.id] : M.groupMembers(this.doc, it.id);
      if (it.type === 'zone' && !this.sel.has(it.id) && !e.shiftKey && this.inZoneInterior(it, p)) {
        this.drag = { kind: 'marquee', p0: p, p, add: false, clickSelect: members, started: false, sx: e.clientX, sy: e.clientY };
        return;
      }
      if (e.shiftKey) {
        const has = members.every((m) => this.sel.has(m));
        const next = new Set(this.sel);
        for (const m of members) has ? next.delete(m) : next.add(m);
        this.setSelection(next);
        if (has) return;
      } else if (!this.sel.has(it.id)) this.setSelection(members);
      this.drag = { kind: 'move', p0: p, sx: e.clientX, sy: e.clientY, started: false, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, hit: it.id };
      return;
    }
    if (!e.shiftKey && this.sel.size) this.setSelection([]);
    this.drag = { kind: 'marquee', p0: p, p, add: e.shiftKey, base: new Set(this.sel), started: false, sx: e.clientX, sy: e.clientY };
  }

  inZoneInterior(z, p) {
    const m = 22 / this.zoom;
    return p.x > z.x + m && p.x < z.x + z.w - m && p.y > z.y + Math.max(m, (z.title ? z.subDy || z.titleDy : 0) + 12) && p.y < z.y + z.h - m;
  }

  onMove(e) {
    const d = this.drag;
    if (!d) {
      if (this.present) return;
      if (e.target.closest?.('#viewport')) {
        const p = this.toDoc(e);
        this.app.onPointer?.(p);
        this.drawRulers(p);
        const it = this.itemFromEvent(e);
        const port = e.target.closest?.('[data-handle="port"]');
        const node = it?.type === 'node' ? it : port ? M.byId(this.doc, port.dataset.id) : null;
        const prev = this.hover;
        this.hover = node || (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < prev.r + 14 / this.zoom ? prev : null);
        if (prev !== this.hover) this.drawOverlay();
      }
      return;
    }
    if (d.kind === 'pan') {
      this.panX = d.px + e.clientX - d.sx; this.panY = d.py + e.clientY - d.sy;
      this.layout();
      return;
    }
    const p = this.toDoc(e);
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      d.started = true;
      d.before = this.app.snapshot();
      this.beginDrag(d, e);
    }
    d.p = p;
    if (d.kind === 'move') this.dragMove(d, p, e);
    else if (d.kind === 'marquee') this.dragMarquee(d, p);
    else if (d.kind === 'resize') this.dragResize(d, p, e);
    else if (d.kind === 'scale') this.dragScale(d, p, e);
    else if (d.kind === 'connect') this.dragConnect(d, p);
    else if (d.kind === 'end') this.dragEndpoint(d, p, e);
    else if (d.kind === 'label') {
      const c = M.byId(this.doc, d.id);
      c.labelPos = Math.round(nearestT(parsePath(c.d), p.x, p.y) * 1000) / 1000;
      this.renderItems([c.id]);
    }
    else if (d.kind === 'vertex' || d.kind === 'ctrl') this.dragVertex(d, p, e);
  }

  onUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.vp.classList.remove('panning');
    if (d.kind === 'pan') return;
    if (!d.started) {
      if (d.kind === 'marquee' && d.clickSelect) this.setSelection(d.clickSelect);
      else if (d.kind === 'move' && !e.shiftKey && this.sel.size > 1 && d.hit) {
        const members = d.alt ? [d.hit] : M.groupMembers(this.doc, d.hit);
        if (members.length < this.sel.size) this.setSelection(members);
      }
      this.guides = [];
      this.drawOverlay();
      return;
    }
    this.guides = [];
    if (d.kind === 'move') this.endMove(d);
    if (d.kind === 'connect') this.endConnect(d);
    if (d.kind === 'end') this.endEndpoint(d, e);
    if (d.kind === 'marquee') { this.drawOverlay(); this.app.onSelection?.(); return; }
    if (d.before && d.before !== this.app.snapshot()) this.app.record(d.before);
    this.drawOverlay();
    this.app.onSelection?.();
  }

  // ---------------------------------------------------------------------------------------------- move
  // Items drawn after a selected container and lying fully inside it travel with it.
  containedIn(base) {
    const doc = this.doc;
    const out = new Set();
    for (const id of base) {
      const z = M.byId(doc, id);
      if (z?.type !== 'zone') continue;
      const zi = M.indexOf(doc, z.id);
      const zb = { x: z.x, y: z.y, w: z.w, h: z.h };
      doc.items.forEach((it, i) => {
        if (i <= zi || base.has(it.id) || it.locked) return;
        const b = it.type === 'node' ? this.bbox(it.id) : (it.type === 'connector' || it.type === 'path') ? pathBBox(parsePath(it.d)) : M.snapBox(it);
        if (b && M.inside(b, zb, 2)) out.add(it.id);
      });
    }
    return out;
  }

  beginDrag(d) {
    if (d.kind !== 'move') return;
    const doc = this.doc;
    if (d.ctrl) {
      // copy-drag: duplicate the selection together with the contents of selected containers
      const src = M.expandGroups(doc, this.sel);
      const all = d.alt ? src : new Set([...src, ...this.containedIn(src)]);
      const ids = this.app.duplicate([...all], 0, 0, false);
      this.sel = new Set(ids);
      d.alt = true;   // the copies are the moving set; do not scan for contents again
    }
    const base = M.expandGroups(doc, this.sel);
    const moving = new Set(base);
    if (!d.alt) for (const id of this.containedIn(base)) moving.add(id);
    d.moving = moving;
    d.start = new Map([...moving].map((id) => [id, M.clone(M.byId(doc, id))]));
    d.startD = new Map();
    for (const c of doc.items) if (c.type === 'connector' && !moving.has(c.id)) d.startD.set(c.id, c.d);
    const ref = [...base].map((id) => M.byId(doc, id)).filter((i) => i.type !== 'connector');
    d.ref = M.union(ref.map(M.snapBox)) || M.union([...base].map((id) => this.bbox(id)).filter(Boolean));
    d.single = ref.length === 1 ? ref[0] : null;
    d.lines = this.snapLines(moving);
  }

  snapLines(exclude) {
    const xs = [], ys = [];
    const { width: W, height: H } = this.doc.page;
    xs.push(0, W / 2, W); ys.push(0, H / 2, H);
    for (const it of this.doc.items) {
      if (exclude.has(it.id) || it.hidden || it.type === 'connector' || it.type === 'path') continue;
      const b = M.snapBox(it);
      if (it.type === 'text') {
        xs.push(it.x); ys.push(it.y);
        continue;
      }
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  }

  snapDelta(ref, dx, dy, lines, single) {
    const guides = [];
    const tol = 6 / this.zoom;
    let sx = null, sy = null;
    if (this.snap && ref) {
      const mx = single?.type === 'text' ? [single.x] : [ref.x, ref.x + ref.w / 2, ref.x + ref.w];
      const my = single?.type === 'text' ? [single.y] : [ref.y, ref.y + ref.h / 2, ref.y + ref.h];
      let best = tol + 1;
      for (const m of mx) for (const v of lines.xs) { const k = v - (m + dx); if (Math.abs(k) < Math.abs(best)) { best = k; sx = v; } }
      if (Math.abs(best) <= tol) { dx += best; guides.push({ x: sx }); } else sx = null;
      best = tol + 1;
      for (const m of my) for (const v of lines.ys) { const k = v - (m + dy); if (Math.abs(k) < Math.abs(best)) { best = k; sy = v; } }
      if (Math.abs(best) <= tol) { dy += best; guides.push({ y: sy }); } else sy = null;
    }
    if (this.gridSnap && ref) {
      const g = this.doc.page.grid || 10;
      const ax = single && single.type !== 'zone' && single.type !== 'image' ? (single.type === 'text' ? single.x : ref.x + ref.w / 2) : ref.x;
      const ay = single && single.type !== 'zone' && single.type !== 'image' ? (single.type === 'text' ? single.y : ref.y + ref.h / 2) : ref.y;
      if (sx == null) dx = Math.round((ax + dx) / g) * g - ax;
      if (sy == null) dy = Math.round((ay + dy) / g) * g - ay;
    }
    return { dx, dy, guides };
  }

  dragMove(d, p, e) {
    let dx = p.x - d.p0.x, dy = p.y - d.p0.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const s = this.snapDelta(d.ref, dx, dy, d.lines, d.single);
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) s.dy = 0; else s.dx = 0; }
    this.guides = s.guides;
    this.applyMove(d, s.dx, s.dy);
  }

  applyMove(d, dx, dy) {
    const doc = this.doc;
    const movedNodes = new Map();
    for (const [id, st] of d.start) {
      const it = M.byId(doc, id);
      if (!it) continue;
      Object.assign(it, M.clone(st));
      M.translateItem(it, dx, dy);
      if (it.type === 'node') movedNodes.set(id, { dx, dy });
    }
    for (const [id, d0] of d.startD) { const c = M.byId(doc, id); if (c) c.d = d0; }
    const followers = M.followNodes(doc, movedNodes, new Map(d.startD), d.moving);
    d.followers = followers;
    this.renderItems([...d.moving, ...followers]);
  }

  endMove(d) {
    for (const id of d.moving) {
      const it = M.byId(this.doc, id);
      if (it?.type === 'connector') M.refreshAttachments(this.doc, it);
    }
    this.renderItems([...d.moving]);
  }

  // Keyboard nudge.
  nudge(dx, dy) {
    if (!this.sel.size) return;
    const before = this.app.snapshot();
    const d = { moving: M.expandGroups(this.doc, this.sel) };
    d.start = new Map([...d.moving].map((id) => [id, M.clone(M.byId(this.doc, id))]));
    d.startD = new Map();
    for (const c of this.doc.items) if (c.type === 'connector' && !d.moving.has(c.id)) d.startD.set(c.id, c.d);
    this.applyMove(d, dx, dy);
    this.endMove(d);
    this.app.record(before, 'nudge');
  }

  // ---------------------------------------------------------------------------------------------- marquee
  dragMarquee(d, p) {
    const x0 = Math.min(d.p0.x, p.x), y0 = Math.min(d.p0.y, p.y);
    const box = { x: x0, y: y0, w: Math.abs(p.x - d.p0.x), h: Math.abs(p.y - d.p0.y) };
    const hit = new Set(d.add ? d.base : []);
    for (const it of this.doc.items) {
      if (it.locked || it.hidden) continue;
      const b = this.bbox(it.id);
      if (b && M.inside(b, box)) for (const m of M.groupMembers(this.doc, it.id)) hit.add(m);
    }
    this.sel = hit;
    this.drawOverlay();
  }

  // ---------------------------------------------------------------------------------------------- handles
  startHandle(h, e, p) {
    const kind = h.dataset.handle;
    if (kind === 'port') {
      const n = M.byId(this.doc, h.dataset.id);
      return n ? this.startConnect(n, e, p) : undefined;
    }
    const it = this.selectedItems()[0];
    if (!it) return;
    const base = { p0: p, sx: e.clientX, sy: e.clientY, started: false, id: it.id, start: M.clone(it) };
    if (kind === 'resize') this.drag = { ...base, kind: 'resize', dir: h.dataset.dir, box: it.type === 'path' ? pathBBox(parsePath(it.d)) : null };
    else if (kind === 'scale') {
      const box = it.type === 'text' ? (this.bbox(it.id) || M.snapBox(it)) : M.snapBox(it);
      const startD = new Map(this.doc.items.filter((c) => c.type === 'connector' && (c.from?.id === it.id || c.to?.id === it.id)).map((c) => [c.id, M.clone(c)]));
      this.drag = { ...base, kind: 'scale', dir: h.dataset.dir, box, startD };
    }
    else if (kind === 'end') this.drag = { ...base, kind: 'end', end: h.dataset.end };
    else if (kind === 'label') this.drag = { ...base, kind: 'label' };
    else if (kind === 'vertex' || kind === 'ctrl') {
      if (kind === 'vertex' && e.altKey) return this.removeVertex(it, Number(h.dataset.seg));
      this.drag = { ...base, kind, seg: Number(h.dataset.seg), k: h.dataset.k };
    }
  }

  // Scale an icon / text / marker from a corner handle (side handles on text set the wrap width).
  dragScale(d, p, e) {
    const it = M.byId(this.doc, d.id);
    const st = d.start, b = d.box;
    Object.assign(it, M.clone(st));
    if (it.type === 'text' && (d.dir === 'e' || d.dir === 'w')) {
      const edge = it.anchor === 'middle' ? Math.abs(p.x - it.x) * 2 : it.anchor === 'end' ? it.x - p.x : p.x - it.x;
      const g = this.gridSnap && !e.altKey ? 10 : 1;
      it.wrap = Math.max(40, Math.round(Math.abs(edge) / g) * g);
      this.renderItems([it.id]);
      return;
    }
    // opposite corner stays put for text; icons and markers scale around their centre
    const ox = d.dir.includes('w') ? b.x + b.w : b.x, oy = d.dir.includes('n') ? b.y + b.h : b.y;
    let k;
    if (it.type === 'text') k = Math.max(Math.abs(p.x - ox) / (b.w || 1), Math.abs(p.y - oy) / (b.h || 1));
    else k = Math.max(Math.abs(p.x - st.x), Math.abs(p.y - st.y)) / (st.r || 1);
    k = Math.max(0.25, Math.min(8, k));
    if (it.type === 'text') {
      it.size = Math.max(6, Math.round(st.size * k * 2) / 2);
      if (st.wrap) it.wrap = Math.round(st.wrap * it.size / st.size);
    } else if (it.type === 'node') {
      const r = Math.max(10, Math.round(st.r * k));
      const f = r / st.r;
      it.r = r;
      it.glyphScale = Math.round((st.glyphScale ?? 1) * f * 1000) / 1000;
      if (Math.abs(it.glyphScale - 1) < 0.001) delete it.glyphScale;
      if (st.badge && st.badge.dx != null) { it.badge.dx = st.badge.dx * f; it.badge.dy = st.badge.dy * f; }
      if (e.shiftKey) {   // Shift also scales the label
        it.nameSize = Math.round(st.nameSize * f * 2) / 2; it.subSize = Math.round(st.subSize * f * 2) / 2;
        it.nameDy = Math.round(st.nameDy * f); it.subDy = Math.round(st.subDy * f); it.subLh = Math.round(st.subLh * f);
      }
      // attached line ends move with the disc edge
      for (const [cid, c0] of d.startD) {
        const c = M.byId(this.doc, cid);
        Object.assign(c, M.clone(c0));
        const segs = parsePath(c0.d);
        if (c0.from?.id === it.id) { moveStart(segs, c0.from.dx * (f - 1), c0.from.dy * (f - 1), !!c0.to); c.from = { ...c0.from, dx: c0.from.dx * f, dy: c0.from.dy * f }; }
        if (c0.to?.id === it.id) { moveEnd(segs, c0.to.dx * (f - 1), c0.to.dy * (f - 1), !!c0.from); c.to = { ...c0.to, dx: c0.to.dx * f, dy: c0.to.dy * f }; }
        c.d = serializePath(segs);
      }
    } else {
      const r = Math.max(4, Math.round(st.r * k));
      it.r = r;
      if (it.type === 'badge') { it.size = Math.round(st.size * r / st.r * 2) / 2; it.textDy = Math.round(st.textDy * r / st.r * 10) / 10; }
      if (st.ry != null) it.ry = Math.round(st.ry * r / st.r);
    }
    this.renderItems([it.id, ...d.startD.keys()]);
  }

  dragResize(d, p, e) {
    const it = M.byId(this.doc, d.id);
    const st = d.start;
    const g = this.gridSnap ? this.doc.page.grid || 10 : 0;
    const sn = (v) => (g ? Math.round(v / g) * g : v);
    const b0 = d.box || { x: st.x, y: st.y, w: st.w, h: st.h };
    let x0 = b0.x, y0 = b0.y, x1 = b0.x + b0.w, y1 = b0.y + b0.h;
    if (d.dir.includes('w')) x0 = sn(p.x);
    if (d.dir.includes('e')) x1 = sn(p.x);
    if (d.dir.includes('n')) y0 = sn(p.y);
    if (d.dir.includes('s')) y1 = sn(p.y);
    if ((e.shiftKey || it.type === 'image') && d.dir.length === 2 && b0.w && b0.h) {
      const k = Math.max((x1 - x0) / b0.w, (y1 - y0) / b0.h);
      if (d.dir.includes('w')) x0 = x1 - b0.w * k; else x1 = x0 + b0.w * k;
      if (d.dir.includes('n')) y0 = y1 - b0.h * k; else y1 = y0 + b0.h * k;
    }
    const min = 8;
    if (x1 - x0 < min) { if (d.dir.includes('w')) x0 = x1 - min; else x1 = x0 + min; }
    if (y1 - y0 < min) { if (d.dir.includes('n')) y0 = y1 - min; else y1 = y0 + min; }
    if (it.type === 'path') {
      Object.assign(it, M.clone(st));
      const segs = parsePath(st.d);
      scaleSegs(segs, b0.x, b0.y, (x1 - x0) / (b0.w || 1), (y1 - y0) / (b0.h || 1));
      it.d = serializePath(segs);
      M.translateItem(it, x0 - b0.x, y0 - b0.y);
    } else Object.assign(it, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    this.renderItems([it.id]);
  }

  dragEndpoint(d, p, e) {
    const c = M.byId(this.doc, d.id);
    const segs = parsePath(d.start.d);
    const orig = d.end === 'from' ? startPoint(segs) : endPoint(segs);
    const node = e.altKey ? null : M.nodeAt(this.doc, p.x, p.y, 10 / this.zoom);
    let q = p;
    if (node) {
      const vx = p.x - node.x, vy = p.y - node.y, len = Math.hypot(vx, vy) || 1;
      const gap = d.end === 'to' && c.arrowEnd ? 4 : d.end === 'from' && c.arrowStart ? 4 : 0;
      q = { x: node.x + (vx / len) * (node.r + gap), y: node.y + (vy / len) * (node.r + gap) };
    } else if (this.gridSnap && !e.altKey) {
      const g = this.doc.page.grid || 10;
      q = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
    }
    d.snapNode = node;
    d.q = q;
    if (d.end === 'from') moveStart(segs, q.x - orig.x, q.y - orig.y);
    else moveEnd(segs, q.x - orig.x, q.y - orig.y);
    c.d = serializePath(segs);
    this.renderItems([c.id]);
  }

  endEndpoint(d) {
    const c = M.byId(this.doc, d.id);
    if (!c || !d.q) return;
    if (d.snapNode) M.attachEnd(c, d.end, d.snapNode, d.q);
    else delete c[d.end];
    this.renderItems([c.id]);
  }

  dragVertex(d, p, e) {
    const c = M.byId(this.doc, d.id);
    const segs = parsePath(d.start.d);
    const s = segs[d.seg];
    let q = p;
    if (this.gridSnap && !e.altKey) { const g = this.doc.page.grid || 10; q = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }; }
    if (d.kind === 'ctrl') {
      if (d.k === '2') { s.x2 = q.x; s.y2 = q.y; } else { s.x1 = q.x; s.y1 = q.y; }
    } else {
      // keep axis-aligned neighbours axis-aligned when the user holds Shift
      const dx = q.x - s.x, dy = q.y - s.y;
      s.x = q.x; s.y = q.y;
      if (s.c === 'C') { s.x2 += dx; s.y2 += dy; }
      const nx = segs[d.seg + 1];
      if (nx?.c === 'C') { nx.x1 += dx; nx.y1 += dy; }
    }
    c.d = serializePath(segs);
    this.renderItems([c.id]);
  }

  removeVertex(c, i) {
    const before = this.app.snapshot();
    const segs = parsePath(c.d);
    if (i <= 0 || i >= segs.length - 1) return;
    segs.splice(i, 1);
    c.d = serializePath(segs);
    this.app.record(before);
    this.renderItems([c.id]);
  }

  // ---------------------------------------------------------------------------------------------- connect
  startConnect(n, e, p) {
    this.drag = { kind: 'connect', from: n, p0: p, p, sx: e.clientX, sy: e.clientY, started: false, flow: this.flow };
  }

  dragConnect(d, p) {
    const t = M.nodeAt(this.doc, p.x, p.y, 8 / this.zoom, d.from.id);
    d.target = t;
    const gap = d.flow.arrowEnd ? 4 : 0;
    d.preview = t ? route(this.routeStyle, d.from, d.from.r, t, t.r, gap)
      : route(this.routeStyle, d.from, d.from.r, p, 0, 0);
    this.drawOverlay();
  }

  endConnect(d) {
    if (!d.preview) return;
    const c = makeConnector(d.flow, d.preview);
    c.id = M.newId();
    const segs = parsePath(c.d);
    M.attachEnd(c, 'from', d.from, startPoint(segs));
    if (d.target) M.attachEnd(c, 'to', d.target, endPoint(segs));
    const firstNode = this.doc.items.findIndex((i) => i.type === 'node');
    const idx = Math.min(...[firstNode, M.indexOf(this.doc, d.from.id), d.target ? M.indexOf(this.doc, d.target.id) : Infinity].filter((v) => v >= 0));
    this.doc.items.splice(Number.isFinite(idx) ? idx : this.doc.items.length, 0, c);
    this.renderAll();
    this.setSelection([c.id]);
  }

  // Re-route selected connectors between their attached nodes (or their current endpoints).
  reroute(style, ids = [...this.sel]) {
    const before = this.app.snapshot();
    for (const id of ids) {
      const c = M.byId(this.doc, id);
      if (c?.type !== 'connector') continue;
      const segs = parsePath(c.d);
      const a = c.from && M.byId(this.doc, c.from.id), b = c.to && M.byId(this.doc, c.to.id);
      const p0 = startPoint(segs), p1 = endPoint(segs);
      const A = a || { x: p0.x, y: p0.y, r: 0 }, B = b || { x: p1.x, y: p1.y, r: 0 };
      const gap = b && c.arrowEnd ? 4 : 0;
      c.d = route(style, A, A.r, B, B.r, gap);
      const s2 = parsePath(c.d);
      if (a) M.attachEnd(c, 'from', a, startPoint(s2));
      if (b) M.attachEnd(c, 'to', b, endPoint(s2));
    }
    this.app.record(before);
    this.renderItems(ids);
  }

  reverse(ids = [...this.sel]) {
    const before = this.app.snapshot();
    for (const id of ids) {
      const c = M.byId(this.doc, id);
      if (c?.type !== 'connector') continue;
      c.d = serializePath(reverseSegs(parsePath(c.d)));
      const f = c.from; c.from = c.to; c.to = f;
      if (!c.from) delete c.from; if (!c.to) delete c.to;
    }
    this.app.record(before);
    this.renderItems(ids);
  }

  // ---------------------------------------------------------------------------------------------- double click
  onDouble(e) {
    if (this.present) return undefined;
    const it = this.itemFromEvent(e);
    if (!it) return;
    if (it.type === 'connector' && it.label && e.target.tagName === 'text') return this.app.inlineEdit(it);
    if (it.type === 'connector') {
      const p = this.toDoc(e);
      const segs = parsePath(it.d);
      const i = nearestSegment(segs, p.x, p.y);
      if (i > 0) {
        const before = this.app.snapshot();
        splitSegment(segs, i);
        it.d = serializePath(segs);
        this.app.record(before);
        this.setSelection([it.id]);
        this.renderItems([it.id]);
      }
      return;
    }
    if (['text', 'node', 'zone', 'badge'].includes(it.type)) this.app.inlineEdit(it);
  }

  onContext(e) {
    e.preventDefault();
    if (this.present) return;
    const it = this.itemFromEvent(e);
    this.app.contextMenu(e.clientX, e.clientY, it);
  }
}

export { NS };
