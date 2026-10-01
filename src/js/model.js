// Document model: defaults, normalisation, ids, geometry and the operations the editor performs on items.
import { PALETTE, MM_PER_PX } from './presets.js';
import { measure, wrapLines } from './textmetrics.js';
import {
  parsePath, serializePath, translateSegs, scaleSegs, pathBBox, moveStart, moveEnd, startPoint, endPoint,
} from './path.js';

export const FORMAT = 'netdraw';
export const VERSION = 1;

const DEFAULTS = {
  text: { text: '', size: 14, weight: 400, color: PALETTE.ink, anchor: 'start' },
  zone: {
    w: 300, h: 200, rx: 16, fill: '#F8FAFC', stroke: '#CBD5E1', strokeWidth: 1.6, title: '', titleSize: 15,
    titleWeight: 700, titleColor: PALETTE.muted, titleAlign: 'left', titleDx: 18, titleDy: 28, sub: '', subSize: 12.5,
    subColor: PALETTE.muted, subDy: 48,
  },
  node: {
    r: 32, color: PALETTE.client, glyph: 'pc', glyphSet: 'A', name: '', nameSize: 14, nameWeight: 600,
    nameColor: PALETTE.ink, nameDy: 20, sub: '', subSize: 12, subColor: PALETTE.muted, subDy: 37, subLh: 15,
  },
  connector: { d: 'M0 0 L100 0', color: PALETTE.zia, width: 3.2, arrowEnd: true, arrowSize: 5.2 },
  badge: {
    r: 13, fill: PALETTE.zia, stroke: '#fff', strokeWidth: 2.5, text: '1', size: 13, weight: 700,
    textColor: '#fff', textDy: 4.8,
  },
  path: { d: 'M0 0 L100 0', fill: 'none', stroke: PALETTE.ink, strokeWidth: 2 },
  circle: { r: 14, fill: '#fff', stroke: PALETTE.ink, strokeWidth: 2.5 },
  image: { w: 120, h: 80, href: '' },
};

// Default page: A3 landscape at the print scale (2100 x 1485 px = 420 x 297 mm).
export function newDoc(w = 2100, h = 1485, title = 'Untitled') {
  return {
    format: FORMAT, version: VERSION,
    page: { width: w, height: h, background: '#fff', fontFamily: 'IBM Plex Sans, DejaVu Sans, sans-serif', title, grid: 10, mmPerPx: MM_PER_PX },
    items: [],
  };
}

let counter = 0;
export function newId() {
  counter += 1;
  return `n${Date.now().toString(36)}${counter.toString(36)}`;
}

export function normalize(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items)) throw new Error('Not a NetDraw project');
  if (doc.format && doc.format !== FORMAT) throw new Error(`Unknown format "${doc.format}"`);
  const base = newDoc();
  doc.format = FORMAT;
  doc.version = doc.version || VERSION;
  doc.page = { ...base.page, ...(doc.page || {}) };
  const seen = new Set();
  doc.items = doc.items.filter((it) => it && DEFAULTS[it.type]).map((it) => {
    const out = { ...DEFAULTS[it.type], ...it };
    if (!out.id || seen.has(out.id)) out.id = newId();
    seen.add(out.id);
    if (it.type !== 'connector' && it.type !== 'path') {
      if (typeof out.x !== 'number') out.x = 0;
      if (typeof out.y !== 'number') out.y = 0;
    }
    return out;
  });
  return doc;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const byId = (doc, id) => doc.items.find((i) => i.id === id);
export const indexOf = (doc, id) => doc.items.findIndex((i) => i.id === id);

// ------------------------------------------------------------------------------------------------ geometry
// "Snap box": the part of an item used for alignment (a node's disc, not its label).
export function snapBox(it) {
  switch (it.type) {
    case 'node': return { x: it.x - it.r, y: it.y - it.r, w: it.r * 2, h: it.r * 2 };
    case 'badge': case 'circle': return { x: it.x - it.r, y: it.y - it.r, w: it.r * 2, h: (it.ry ?? it.r) * 2 };
    case 'zone': case 'image': return { x: it.x, y: it.y, w: it.w, h: it.h };
    case 'connector': case 'path': return pathBBox(parsePath(it.d));
    case 'text': {
      const lines = it.wrap ? wrapLines(it.text, it.wrap, it.size, it.weight) : String(it.text ?? '').split('\n');
      const w = it.wrap || Math.max(...lines.map((l) => measure(l, it.size, it.weight)));
      const lh = it.lineHeight || Math.round(it.size * 1.35 * 10) / 10;
      const x = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
      return { x, y: it.y - it.size * 0.8, w, h: it.size + (lines.length - 1) * lh };
    }
    default: return { x: it.x || 0, y: it.y || 0, w: 0, h: 0 };
  }
}

export function estimateTextWidth(s, size, weight = 400) {
  return Math.max(...String(s ?? '').split('\n').map((l) => measure(l, size, weight)));
}

export const union = (boxes) => {
  if (!boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

export const inside = (b, z, pad = 0) =>
  b.x >= z.x - pad && b.y >= z.y - pad && b.x + b.w <= z.x + z.w + pad && b.y + b.h <= z.y + z.h + pad;

// ------------------------------------------------------------------------------------------------ transforms
export function translateItem(it, dx, dy) {
  if (it.type === 'connector' || it.type === 'path') {
    it.d = serializePath(translateSegs(parsePath(it.d), dx, dy));
  } else {
    it.x += dx; it.y += dy;
  }
}

export function scalePathItem(it, ox, oy, sx, sy) {
  it.d = serializePath(scaleSegs(parsePath(it.d), ox, oy, sx, sy));
}

// Recompute the connectors attached to moved nodes. `moved` maps node id -> {dx, dy}; `startD` maps
// connector id -> its d at the start of the gesture; `skip` holds connectors that move as a whole anyway.
export function followNodes(doc, moved, startD, skip = new Set()) {
  const touched = [];
  for (const c of doc.items) {
    if (c.type !== 'connector' || skip.has(c.id)) continue;
    const a = c.from && moved.get(c.from.id), b = c.to && moved.get(c.to.id);
    if (!a && !b) continue;
    const d0 = startD.get(c.id) ?? c.d;
    startD.set(c.id, d0);
    const segs = parsePath(d0);
    if (a && b && a.dx === b.dx && a.dy === b.dy) translateSegs(segs, a.dx, a.dy);
    else {
      if (a) moveStart(segs, a.dx, a.dy, !!c.to);
      if (b) moveEnd(segs, b.dx, b.dy, !!c.from);
    }
    c.d = serializePath(segs);
    touched.push(c.id);
  }
  return touched;
}

// After a connector was edited or moved by itself, refresh (or drop) its attachments.
export function refreshAttachments(doc, c, tol = 18) {
  const segs = parsePath(c.d);
  const ends = [['from', startPoint(segs)], ['to', endPoint(segs)]];
  for (const [k, p] of ends) {
    const a = c[k];
    if (!a) continue;
    const n = byId(doc, a.id);
    if (!n || Math.hypot(p.x - n.x, p.y - n.y) > n.r + tol) { delete c[k]; continue; }
    a.dx = round3(p.x - n.x); a.dy = round3(p.y - n.y);
  }
}

export function attachEnd(c, key, node, p) {
  c[key] = { id: node.id, dx: round3(p.x - node.x), dy: round3(p.y - node.y) };
}

export function nodeAt(doc, x, y, tol = 14, exclude = null) {
  let best = null, bd = Infinity;
  for (const n of doc.items) {
    if (n.type !== 'node' || n.id === exclude || n.hidden) continue;
    const d = Math.hypot(x - n.x, y - n.y);
    if (d <= n.r + tol && d < bd) { best = n; bd = d; }
  }
  return best;
}

// Connector endpoints auto-binding (for imported or hand-written files).
export function autoAttach(doc, tol = 16) {
  let n = 0;
  for (const c of doc.items) {
    if (c.type !== 'connector') continue;
    const segs = parsePath(c.d);
    for (const [k, p] of [['from', startPoint(segs)], ['to', endPoint(segs)]]) {
      if (c[k]) continue;
      const node = nodeAt(doc, p.x, p.y, tol);
      if (node) { attachEnd(c, k, node, p); n++; }
    }
  }
  return n;
}

export const round3 = (v) => Math.round(v * 1000) / 1000;

export function groupMembers(doc, id) {
  const it = byId(doc, id);
  if (!it || !it.group) return [id];
  return doc.items.filter((i) => i.group === it.group).map((i) => i.id);
}

export function expandGroups(doc, ids) {
  const out = new Set();
  for (const id of ids) for (const m of groupMembers(doc, id)) out.add(m);
  return out;
}
