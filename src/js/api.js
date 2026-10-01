// Document operations for automation (MCP server, scripts). Pure: works on a document object, no DOM.
// The open editor runs the same functions on its live document, so a client can drive NetDraw while you watch.
import * as M from './model.js';
import {
  PALETTE, GLYPH_COLOR, NODE_STYLES, ZONE_PRESETS, TEXT_PRESETS, FLOW_PRESETS, BADGE_PRESETS, PAPER_SIZES,
  makeNode, makeZone, makeText, makeBadge2, makeConnector, makeBadge, paperPx, flowLabel, describePage, MM_PER_PX,
  BRANDS, VENDOR_DEVICES, setVendor,
} from './presets.js';
import { GLYPH_GROUPS, GLYPH_LABEL, GLYPHS_A, VENDOR_GROUPS } from './glyphs.js';
import { route, parsePath, startPoint, endPoint, pathBBox, labelBelow } from './path.js';
import { measure } from './textmetrics.js';

export class ApiError extends Error {}

const color = (c, fallback) => {
  if (!c) return fallback;
  if (PALETTE[c]) return PALETTE[c];
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return c;
  throw new ApiError(`Unknown colour "${c}". Use a palette key (${Object.keys(PALETTE).join(', ')}) or #RRGGBB.`);
};

const snap = (v) => Math.round(Number(v) / 10) * 10;
const num = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ApiError(`"${name}" must be a number`);
  return n;
};

// ------------------------------------------------------------------------------------------------ reading
export function styleGuide() {
  return {
    icons: Object.fromEntries(GLYPH_GROUPS.map(([g, keys]) => [g, Object.fromEntries(keys.map((k) => [k, GLYPH_LABEL[k]]))])),
    vendor_icons: {
      how: 'Brand logo discs (glyph "b-<brand>") and Microsoft architecture icons (glyph "ms-…") are used like any glyph. ' +
        'For a vendor device, use a generic glyph plus vendor, e.g. {kind:"icon", glyph:"firewall", vendor:"fortinet", name:"FortiGate"}: ' +
        'the disc takes the vendor colour and the vendor logo becomes the badge.',
      ...Object.fromEntries(VENDOR_GROUPS.map(([g, keys]) => [g, Object.fromEntries(keys.map((k) => [k, GLYPH_LABEL[k]]))])),
      devices: Object.fromEntries(VENDOR_DEVICES.map((d) => [d.label, { glyph: d.glyph, vendor: d.brand.slice(2) }])),
    },
    icon_styles: Object.fromEntries(Object.entries(NODE_STYLES).map(([k, s]) => [k, `${s.label}: disc radius ${s.r}, name ${s.nameSize}px, details ${s.subSize}px`])),
    line_styles: Object.fromEntries(FLOW_PRESETS.map((f) => [f.key, f.label])),
    routes: ['curve', 'orthogonal', 'straight'],
    containers: Object.fromEntries(ZONE_PRESETS.map((z) => [z.key, `${z.label} (default ${z.w} × ${z.h})`])),
    texts: Object.fromEntries(TEXT_PRESETS.map((t) => [t.key, `${t.label}: ${t.t.size}px`])),
    markers: Object.fromEntries(BADGE_PRESETS.map((b) => [b.key, b.label])),
    colours: PALETTE,
    paper_sizes: Object.fromEntries(PAPER_SIZES.map((p) => [p.key, `${p.label}: ${paperPx(p).join(' × ')} px`])),
    rules: [
      'Coordinates are page pixels; at the print scale 1 px = 0.2 mm (A3 landscape = 2100 × 1485). Use multiples of 10.',
      'Icons: x, y is the disc centre; name (1–3 words) and details (max two short lines) sit below the disc.',
      'Keep icon centres at least 170 px apart in a row and 200 px apart vertically when they have two-line details.',
      'Group icons in containers (sites, cloud services, data centres, trust zones); leave 40 px between containers.',
      'Read left to right: users → network/edge → cloud service → applications.',
      'Title at (40, 54) with the "title" text preset, subtitle at (40, 84) with "subtitle".',
      'Explain flows with numbered markers on the lines and a row of marker + "note" text per step below the drawing.',
      'Finish with add_legend, then render_preview and fix lines that cross labels or icons.',
    ],
  };
}

export function summary(doc) {
  const items = doc.items.map((it) => {
    const o = { id: it.id, type: it.type };
    if (it.type === 'node') Object.assign(o, { glyph: it.glyph, name: it.name, sub: it.sub || undefined, x: it.x, y: it.y, r: it.r, color: it.color, badge: it.badge?.text, inactive: it.inactive || undefined });
    else if (it.type === 'zone') Object.assign(o, { title: it.title, sub: it.sub || undefined, body: it.body || undefined, x: it.x, y: it.y, w: it.w, h: it.h, fill: it.fill });
    else if (it.type === 'connector') {
      const s = parsePath(it.d);
      Object.assign(o, { from: it.from?.id, to: it.to?.id, start: startPoint(s), end: endPoint(s), style: flowLabel(it) || it.color, label: it.label });
    } else if (it.type === 'text') Object.assign(o, { text: it.text, x: it.x, y: it.y, size: it.size });
    else if (it.type === 'badge') Object.assign(o, { text: it.text, x: it.x, y: it.y });
    else Object.assign(o, { x: it.x, y: it.y });
    if (it.group) o.group = it.group;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  });
  const info = describePage(doc.page);
  return {
    page: { title: doc.page.title, width: doc.page.width, height: doc.page.height, paper: info.exact?.label || (info.fits ? `fits on ${info.fits.label}` : 'custom'), mm: [Math.round(info.wmm), Math.round(info.hmm)] },
    items,
  };
}

// Bounding box including an icon's label, for placement decisions.
export function extent(it) {
  if (it.type === 'node') {
    const below = labelBelow(it);
    const w = Math.max(it.r * 2, measure(it.name || '', it.nameSize, it.nameWeight), ...String(it.sub || '').split('\n').map((l) => measure(l, it.subSize)));
    return { x: it.x - w / 2, y: it.y - it.r, w, h: it.r + below };
  }
  if (it.type === 'connector' || it.type === 'path') return pathBBox(parsePath(it.d));
  return M.snapBox(it);
}

// ------------------------------------------------------------------------------------------------ building
function nodeFrom(spec, doc) {
  if (!spec.glyph) throw new ApiError('icon needs "glyph" (see get_style_guide)');
  if (!GLYPHS_A[spec.glyph]) throw new ApiError(`Unknown glyph "${spec.glyph}"`);
  const style = spec.style || dominantStyle(doc);
  if (!NODE_STYLES[style]) throw new ApiError(`Unknown icon style "${style}" (overview, flow, document)`);
  const n = makeNode(spec.glyph, snap(num(spec.x, 'x')), snap(num(spec.y, 'y')), style, {
    name: spec.name ?? GLYPH_LABEL[spec.glyph] ?? '', sub: spec.sub ?? spec.details ?? '',
  });
  if (spec.color) n.color = color(spec.color);
  if (spec.inactive) n.inactive = true;
  if (spec.badge) n.badge = makeBadge(style, n.r, String(spec.badge));
  if (spec.vendor) {
    if (!setVendor(n, String(spec.vendor), style)) throw new ApiError(`Unknown vendor "${spec.vendor}" (brand keys from get_style_guide, without "b-")`);
    if (spec.color) n.color = color(spec.color);
  }
  return n;
}

function dominantStyle(doc) {
  const t = {};
  for (const n of doc.items) if (n.type === 'node') { const k = n.glyphSet === 'B' ? 'flow' : n.nameSize >= 18 ? 'document' : 'overview'; t[k] = (t[k] || 0) + 1; }
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || 'overview';
}

function zoneFrom(spec) {
  const preset = ZONE_PRESETS.find((z) => z.key === (spec.preset || 'site'));
  if (!preset) throw new ApiError(`Unknown container preset "${spec.preset}"`);
  const z = makeZone(preset, snap(num(spec.x, 'x')), snap(num(spec.y, 'y')));
  if (spec.w) z.w = snap(spec.w);
  if (spec.h) z.h = snap(spec.h);
  for (const k of ['title', 'sub', 'body']) if (spec[k] != null) z[k] = String(spec[k]);
  if (spec.fill) z.fill = color(spec.fill);
  if (spec.stroke) z.stroke = color(spec.stroke);
  if (spec.title_align) z.titleAlign = spec.title_align;
  return z;
}

function textFrom(spec) {
  const preset = TEXT_PRESETS.find((t) => t.key === (spec.preset || 'label'));
  if (!preset) throw new ApiError(`Unknown text preset "${spec.preset}"`);
  const t = makeText(preset, num(spec.x, 'x'), num(spec.y, 'y'));
  t.text = String(spec.text ?? t.text);
  if (spec.size) t.size = num(spec.size, 'size');
  if (spec.weight) t.weight = num(spec.weight, 'weight');
  if (spec.color) t.color = color(spec.color);
  if (spec.anchor) t.anchor = spec.anchor;
  if (spec.wrap) t.wrap = num(spec.wrap, 'wrap');
  return t;
}

function markerFrom(spec) {
  const preset = BADGE_PRESETS.find((b) => b.key === (spec.preset || 'n-blue'));
  const b = makeBadge2(preset || BADGE_PRESETS[0], num(spec.x, 'x'), num(spec.y, 'y'));
  if (spec.text != null) b.text = String(spec.text);
  if (spec.color) b.fill = color(spec.color);
  return b;
}

// Containers go behind everything, other items on top.
function insert(doc, items) {
  for (const it of items) {
    it.id = M.newId();
    if (it.type === 'zone') {
      let idx = 0;
      doc.items.forEach((o, i) => { if (o.type === 'zone' && M.inside(it, o)) idx = i + 1; });
      doc.items.splice(idx, 0, it);
    } else doc.items.push(it);
  }
  return items.map((i) => i.id);
}

export function addItems(doc, specs) {
  if (!Array.isArray(specs) || !specs.length) throw new ApiError('"items" must be a non-empty array');
  const made = specs.map((s) => {
    switch (s.kind) {
      case 'icon': return nodeFrom(s, doc);
      case 'container': return zoneFrom(s);
      case 'note': return zoneFrom({ ...s, preset: 'note', title: s.title ?? 'Note', body: s.body ?? s.text ?? '' });
      case 'text': return textFrom(s);
      case 'marker': return markerFrom(s);
      default: throw new ApiError(`Unknown kind "${s.kind}" (icon, container, note, text, marker)`);
    }
  });
  return insert(doc, made);
}

export function connect(doc, p) {
  const a = M.byId(doc, p.from), b = M.byId(doc, p.to);
  if (!a || a.type !== 'node') throw new ApiError(`"from" must be the id of an icon (got ${p.from})`);
  if (!b || b.type !== 'node') throw new ApiError(`"to" must be the id of an icon (got ${p.to})`);
  const flow = FLOW_PRESETS.find((f) => f.key === (p.line_style || 'zia'));
  if (!flow) throw new ApiError(`Unknown line_style "${p.line_style}" (see get_style_guide)`);
  const style = p.route || 'curve';
  if (!['curve', 'orthogonal', 'straight'].includes(style)) throw new ApiError('route must be curve, orthogonal or straight');
  const c = makeConnector(flow, route(style, a, a.r, b, b.r, flow.arrowEnd ? 4 : 0));
  if (p.label) c.label = String(p.label);
  const segs = parsePath(c.d);
  M.attachEnd(c, 'from', a, startPoint(segs));
  M.attachEnd(c, 'to', b, endPoint(segs));
  c.id = M.newId();
  const firstNode = doc.items.findIndex((i) => i.type === 'node');
  doc.items.splice(firstNode < 0 ? doc.items.length : firstNode, 0, c);
  return c.id;
}

const PROTECTED = new Set(['id', 'type', 'from', 'to']);

export function updateItems(doc, updates) {
  if (!Array.isArray(updates)) throw new ApiError('"updates" must be an array of {id, props}');
  const changed = [];
  for (const { id, props } of updates) {
    const it = M.byId(doc, id);
    if (!it) throw new ApiError(`No item with id ${id}`);
    const p = { ...(props || {}) };
    if (it.type === 'node' && ('x' in p || 'y' in p)) {
      const nx = 'x' in p ? num(p.x, 'x') : it.x, ny = 'y' in p ? num(p.y, 'y') : it.y;
      const delta = { dx: nx - it.x, dy: ny - it.y };
      it.x = nx; it.y = ny;
      M.followNodes(doc, new Map([[it.id, delta]]), new Map());
      delete p.x; delete p.y;
    }
    if (it.type === 'node' && 'vendor' in p) {
      if (p.vendor) { if (!setVendor(it, String(p.vendor))) throw new ApiError(`Unknown vendor "${p.vendor}"`); } else if (it.badge?.brand) delete it.badge;
      delete p.vendor;
    }
    if (it.type === 'node' && 'badge' in p) {
      if (p.badge) it.badge = makeBadge(it.glyphSet === 'B' ? 'flow' : 'overview', it.r, String(p.badge)); else delete it.badge;
      delete p.badge;
    }
    if (it.type === 'connector' && 'line_style' in p) {
      const f = FLOW_PRESETS.find((x) => x.key === p.line_style);
      if (!f) throw new ApiError(`Unknown line_style "${p.line_style}"`);
      Object.assign(it, { color: f.color, width: f.width, arrowEnd: !!f.arrowEnd, arrowSize: f.arrowSize || 5.2 });
      if (f.dash) it.dash = f.dash; else delete it.dash;
      if (f.arrowStart) it.arrowStart = true; else delete it.arrowStart;
      delete p.line_style;
    }
    for (const [k, v] of Object.entries(p)) {
      if (PROTECTED.has(k)) continue;
      if (v === null) delete it[k];
      else it[k] = ['color', 'fill', 'stroke', 'textColor', 'nameColor', 'subColor', 'titleColor'].includes(k) ? color(v) : v;
    }
    if (it.type === 'connector' && 'd' in p) M.refreshAttachments(doc, it);
    changed.push(id);
  }
  return changed;
}

export function deleteItems(doc, ids) {
  const set = new Set(ids || []);
  const missing = [...set].filter((id) => !M.byId(doc, id));
  if (missing.length) throw new ApiError(`No items with ids ${missing.join(', ')}`);
  doc.items = doc.items.filter((i) => !set.has(i.id));
  for (const c of doc.items) {
    if (c.type !== 'connector') continue;
    if (c.from && set.has(c.from.id)) delete c.from;
    if (c.to && set.has(c.to.id)) delete c.to;
  }
  return [...set];
}

export function addLegend(doc, p = {}) {
  const seen = new Map();
  for (const c of doc.items) {
    if (c.type !== 'connector' || (c.group && doc.items.some((t) => t.group === c.group && t.type === 'text'))) continue;
    const k = `${c.color}|${c.dash || ''}|${!!c.arrowEnd}`;
    if (!seen.has(k)) seen.set(k, c);
  }
  if (!seen.size) throw new ApiError('No lines in the drawing yet');
  const u = M.union(doc.items.map(extent)) || { x: 40, y: 40, w: 0, h: 0 };
  let x = p.x ?? Math.max(40, snap(u.x));
  let y = p.y ?? snap(u.y + u.h + 50);
  const x0 = x, right = doc.page.width - 40;
  const gid = `g${M.newId()}`;
  const items = [];
  let n = 1;
  for (const c of seen.values()) {
    const label = flowLabel(c) || `Line style ${n}`;
    n += 1;
    const w = 58 + Math.ceil(measure(label, 14, 400));
    if (x > x0 && x + w > right) { x = x0; y += 30; }
    items.push({ ...makeConnector({ color: c.color, width: 3.5, dash: c.dash, arrowEnd: c.arrowEnd, arrowStart: c.arrowStart, arrowSize: c.arrowSize }, `M${x} ${y} L${x + 46} ${y}`), group: gid });
    items.push({ type: 'text', x: x + 58, y: y + 5, text: label, size: 14, weight: 400, color: PALETTE.ink, anchor: 'start', group: gid });
    x += w + 44;
  }
  for (const it of items) it.id = M.newId();
  doc.items.push(...items);
  if (y + 40 > doc.page.height) doc.page.height = Math.ceil((y + 40) / 10) * 10;
  return items.map((i) => i.id);
}

export function newDrawing(p = {}) {
  const paper = PAPER_SIZES.find((x) => x.key === (p.paper || 'A3-landscape'));
  if (!paper) throw new ApiError(`Unknown paper "${p.paper}" (${PAPER_SIZES.map((x) => x.key).join(', ')})`);
  const [w, h] = paperPx(paper, MM_PER_PX);
  const doc = M.newDoc(w, h, p.title || 'Untitled');
  if (p.title) {
    insert(doc, [textFrom({ preset: 'title', x: 40, y: 54, text: p.title })]);
    if (p.subtitle) insert(doc, [textFrom({ preset: 'subtitle', x: 40, y: 84, text: p.subtitle })]);
  }
  return doc;
}

// One entry point for both the editor and file mode. Returns { result, changed, doc }.
export function call(doc, method, p = {}) {
  switch (method) {
    case 'get_style_guide': return { result: styleGuide(), changed: false, doc };
    case 'get_drawing': return { result: summary(doc), changed: false, doc };
    case 'new_drawing': { const d = newDrawing(p); return { result: { ids: d.items.map((i) => i.id), page: summary(d).page }, changed: true, doc: d }; }
    case 'add_items': return { result: { ids: addItems(doc, p.items) }, changed: true, doc };
    case 'connect': return { result: { id: connect(doc, p) }, changed: true, doc };
    case 'update_items': return { result: { updated: updateItems(doc, p.updates) }, changed: true, doc };
    case 'delete_items': return { result: { deleted: deleteItems(doc, p.ids) }, changed: true, doc };
    case 'add_legend': return { result: { ids: addLegend(doc, p) }, changed: true, doc };
    default: throw new ApiError(`Unknown method ${method}`);
  }
}

export { M };
