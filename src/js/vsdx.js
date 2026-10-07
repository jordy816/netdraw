// NetDraw document -> Visio drawing (.vsdx). Pure (no DOM, no Node): buildVsdx() returns the parts of the
// package and the caller zips them (app/zip.js).
//
// Every item becomes real Visio shapes: an icon or a container is a group of editable shapes, text stays text,
// and a line is a 1-D shape glued to the icons it is attached to, so it follows them when they move in Visio.
// The shapes are read back from the same SVG the renderer makes for each item, which keeps positions, sizes and
// colours equal to the other exports. Visio draws arrowheads, dashes and text with its own engine, so those are
// close, not identical.
import { renderItem, darkColor } from './render.js';
import { parsePath } from './path.js';
import { measure } from './textmetrics.js';

// ------------------------------------------------------------------------------------------------ small helpers
const num = (v) => {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
};
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');   // also half a surrogate pair
const xt = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xa = (s) => xt(s).replace(/'/g, '&apos;');
const cell = (n, v, f, u) => `<Cell N='${n}' V='${typeof v === 'number' ? num(v) : xa(v)}'${u ? ` U='${u}'` : ''}${f ? ` F='${xa(f)}'` : ''}/>`;

function hex(c) {
  let h = String(c ?? '').trim().toLowerCase();
  if (!h || h === 'none' || h === 'transparent') return null;
  if (h === 'white') return '#ffffff';
  if (h === 'black') return '#000000';
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${[...h.slice(1)].map((x) => x + x).join('')}`;
  return /^#[0-9a-f]{6}$/.test(h) ? h : '#000000';
}

// ------------------------------------------------------------------------------------------------ SVG subset
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseMarkup(s) {
  const root = { tag: '#root', attrs: {}, kids: [], text: '' };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const cur = stack[stack.length - 1];
    if (m[5] != null) { cur.text += unesc(m[5]); continue; }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const node = { tag: m[2], attrs: {}, kids: [], text: '' };
    for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) node.attrs[a[1]] = unesc(a[2]);
    cur.kids.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}

const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

function parseTransform(s) {
  let m = IDENT;
  for (const t of String(s || '').matchAll(/(translate|scale|rotate|matrix)\(([^)]*)\)/g)) {
    const a = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let k;
    if (t[1] === 'translate') k = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (t[1] === 'scale') k = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (t[1] === 'rotate') {
      const r = (a[0] * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      k = [c, sn, -sn, c, 0, 0];
      if (a.length > 2) k = mul(mul([1, 0, 0, 1, a[1], a[2]], k), [1, 0, 0, 1, -a[1], -a[2]]);
    } else k = a.length === 6 ? a : IDENT;
    m = mul(m, k);
  }
  return m;
}

// SVG elliptical arc -> cubic Béziers of at most a quarter turn each (error about 0.03 % of the radius).
function arcToCubics(x0, y0, rx0, ry0, rotDeg, large, sweep, x, y) {
  let rx = Math.abs(rx0), ry = Math.abs(ry0);
  if (!rx || !ry || (x0 === x && y0 === y)) return [{ c: 'L', x, y }];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = den ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)) : 0;
  if (!!large === !!sweep) co = -co;
  const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (x0 + x) / 2, cy = sp * cxp + cp * cyp + (y0 + y) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const d = dt / n, k = (4 / 3) * Math.tan(d / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * d, b = a + d;
    const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    out.push({ c: 'C', x1: ax + k * dax, y1: ay + k * day, x2: bx - k * dbx, y2: by - k * dby, x: i === n - 1 ? x : bx, y: i === n - 1 ? y : by });
  }
  return out;
}

// Path segments -> sub-paths of lines and cubics only, in page pixels.
export function toSubpaths(segs, m = IDENT) {
  const subs = [];
  let cur = null, cx = 0, cy = 0;
  const open = (x, y) => { cur = { start: { x, y }, segs: [], closed: false }; subs.push(cur); cx = x; cy = y; };
  for (const s of segs) {
    if (s.c === 'M') { open(s.x, s.y); continue; }
    if (!cur) open(cx, cy);
    if (s.c === 'Z') {
      cur.closed = true;
      const { x, y } = cur.start;
      cur = null; cx = x; cy = y;
      continue;
    }
    if (s.c === 'L') cur.segs.push({ c: 'L', x: s.x, y: s.y });
    else if (s.c === 'C') cur.segs.push({ c: 'C', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, x: s.x, y: s.y });
    else if (s.c === 'Q') {
      cur.segs.push({
        c: 'C', x1: cx + (2 / 3) * (s.x1 - cx), y1: cy + (2 / 3) * (s.y1 - cy),
        x2: s.x + (2 / 3) * (s.x1 - s.x), y2: s.y + (2 / 3) * (s.y1 - s.y), x: s.x, y: s.y,
      });
    } else if (s.c === 'A') cur.segs.push(...arcToCubics(cx, cy, s.rx, s.ry, s.rot, s.large, s.sweep, s.x, s.y));
    cx = s.x; cy = s.y;
  }
  const P = (x, y) => { const [a, b] = apply(m, x, y); return { x: a, y: b }; };
  return subs.filter((s) => s.segs.length).map((s) => ({
    start: P(s.start.x, s.start.y), closed: s.closed,
    segs: s.segs.map((g) => {
      const e = P(g.x, g.y);
      if (g.c === 'L') return { c: 'L', ...e };
      const a = P(g.x1, g.y1), b = P(g.x2, g.y2);
      return { c: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...e };
    }),
  }));
}

function cubicExtrema(p0, p1, p2, p3) {
  const out = [];
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const at = (t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) { const t = -c / b; if (t > 0 && t < 1) out.push(at(t)); } return out; }
  const d = b * b - 4 * a * c;
  if (d < 0) return out;
  for (const t of [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)]) if (t > 0 && t < 1) out.push(at(t));
  return out;
}

function boxOf(subs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const addX = (x) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); };
  const addY = (y) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const s of subs) {
    let px = s.start.x, py = s.start.y;
    addX(px); addY(py);
    for (const g of s.segs) {
      addX(g.x); addY(g.y);
      if (g.c === 'C') {
        cubicExtrema(px, g.x1, g.x2, g.x).forEach(addX);
        cubicExtrema(py, g.y1, g.y2, g.y).forEach(addY);
      }
      px = g.x; py = g.y;
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

const flat = (s, per = 8) => {
  const pts = [[s.start.x, s.start.y]];
  let px = s.start.x, py = s.start.y;
  for (const g of s.segs) {
    if (g.c === 'L') pts.push([g.x, g.y]);
    else {
      for (let i = 1; i <= per; i++) {
        const t = i / per, u = 1 - t;
        pts.push([u * u * u * px + 3 * u * u * t * g.x1 + 3 * u * t * t * g.x2 + t * t * t * g.x,
          u * u * u * py + 3 * u * u * t * g.y1 + 3 * u * t * t * g.y2 + t * t * t * g.y]);
      }
    }
    px = g.x; py = g.y;
  }
  return pts;
};
const areaOf = (s) => { const p = flat(s); let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
const endOf = (s) => (s.segs.length ? s.segs[s.segs.length - 1] : s.start);
const unionBox = (bs) => {
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};

// SVG fills by the non-zero rule, Visio leaves every overlap of two outlines open (even-odd). The two agree once
// the outlines that do not change anything under non-zero (a shape drawn inside another one, in the same
// direction) are kept out of the fill: those get noFill and are only stroked.
function markFillRule(subs) {
  const polys = subs.map((s) => flat(s));
  const sign = polys.map((p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.sign(a); });
  const inside = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  subs.forEach((s, i) => {
    if (!sign[i]) { s.noFill = true; return; }
    const pt = polys[i][0];
    let out = 0;
    polys.forEach((poly, j) => { if (j !== i && sign[j] && inside(pt, poly)) out += sign[j]; });
    if ((out !== 0) === (out + sign[i] !== 0)) s.noFill = true;
  });
}

// ------------------------------------------------------------------------------------------------ primitives
function geoPrim(node, m, ctx) {
  const a = node.attrs, k = scaleOf(m);
  const upright = Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && m[0] > 0 && m[3] > 0;
  const p = {
    kind: 'geo', fill: ctx.col(a.fill ?? '#000'), stroke: ctx.col(a.stroke),
    sw: (a['stroke-width'] != null ? Number(a['stroke-width']) : 1) * k, cap: a['stroke-linecap'] || 'butt',
    dash: a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((v) => v >= 0).map((v) => v * k) : null,
  };
  if (!p.stroke || !(p.sw > 0)) { p.stroke = null; p.sw = 0; }
  if (p.dash && !p.dash.some((v) => v > 0)) p.dash = null;
  let segs;
  if (node.tag === 'rect') {
    const x = Number(a.x) || 0, y = Number(a.y) || 0, w = Number(a.width) || 0, h = Number(a.height) || 0;
    const r = Math.max(0, Math.min(Number(a.rx) || 0, w / 2, h / 2));
    if (upright) { const [X, Y] = apply(m, x, y); p.rect = { x: X, y: Y, w: w * m[0], h: h * m[3], r: r * k }; }
    segs = parsePath(r
      ? `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} ` +
        `A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
      : `M${x} ${y} H${x + w} V${y + h} H${x} Z`);
  } else if (node.tag === 'circle' || node.tag === 'ellipse') {
    const cx = Number(a.cx) || 0, cy = Number(a.cy) || 0, rx = Number(a.r ?? a.rx) || 0, ry = Number(a.r ?? a.ry) || 0;
    if (upright) { const [X, Y] = apply(m, cx, cy); p.ellipse = { cx: X, cy: Y, rx: rx * m[0], ry: ry * m[3] }; }
    segs = parsePath(`M${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy} ` +
      `A${rx} ${ry} 0 0 1 ${cx} ${cy - ry} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy} Z`);
  } else if (node.tag === 'line') {
    segs = parsePath(`M${Number(a.x1) || 0} ${Number(a.y1) || 0} L${Number(a.x2) || 0} ${Number(a.y2) || 0}`);
  } else if (node.tag === 'polyline' || node.tag === 'polygon') {
    const n = String(a.points || '').split(/[\s,]+/).filter(Boolean).map(Number);
    segs = parsePath(n.length >= 4 ? `M${n[0]} ${n[1]} L${n.slice(2).join(' ')}${node.tag === 'polygon' ? ' Z' : ''}` : '');
  } else segs = parsePath(a.d || '');
  p.subs = toSubpaths(segs, m);
  // SVG fills an open path as if it were closed; a path without area (plain lines) has nothing to fill
  if (p.fill && !p.rect && !p.ellipse && !p.subs.some((s) => areaOf(s) > 0.05)) p.fill = null;
  if (p.fill && p.subs.length > 1) markFillRule(p.subs);
  p.box = p.rect ? { x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h }
    : p.ellipse ? { x: p.ellipse.cx - p.ellipse.rx, y: p.ellipse.cy - p.ellipse.ry, w: p.ellipse.rx * 2, h: p.ellipse.ry * 2 } : boxOf(p.subs);
  return p;
}

function textPrim(node, m, ctx) {
  const a = node.attrs, k = scaleOf(m);
  const spans = node.kids.filter((t) => t.tag === 'tspan');
  const [x, y] = apply(m, Number(a.x) || 0, Number(a.y) || 0);
  const size = (Number(a['font-size']) || 14) * k;
  return {
    kind: 'text', lines: spans.length ? spans.map((s) => s.text) : [node.text], x, y, size,
    weight: Number(a['font-weight']) || 400, italic: a['font-style'] === 'italic', color: ctx.col(a.fill ?? '#000') || '#000000',
    anchor: a['text-anchor'] || 'start', rot: Math.atan2(m[1], m[0]),
    pitch: spans.length > 1 ? (Number(spans[1].attrs.y) - Number(spans[0].attrs.y)) * k : 0,
    halo: a.stroke && a['paint-order'] === 'stroke' ? ctx.col(a.stroke) : null,
  };
}

function imagePrim(node, m) {
  const a = node.attrs;
  const [x, y] = apply(m, Number(a.x) || 0, Number(a.y) || 0);
  return {
    kind: 'image', href: a.href || a['xlink:href'] || '', box: { x, y, w: (Number(a.width) || 0) * Math.abs(m[0]), h: (Number(a.height) || 0) * Math.abs(m[3]) },
    meet: (a.preserveAspectRatio || 'xMidYMid meet') !== 'none', opacity: a.opacity != null ? Number(a.opacity) : 1,
  };
}

function collect(node, m, ctx, out) {
  const mm = node.attrs.transform ? mul(m, parseTransform(node.attrs.transform)) : m;
  switch (node.tag) {
    case '#root': case 'g': for (const k of node.kids) collect(k, mm, ctx, out); break;
    case 'rect': case 'circle': case 'ellipse': case 'path': case 'line': case 'polyline': case 'polygon': {
      const p = geoPrim(node, mm, ctx);
      const empty = (p.rect || p.ellipse || ['rect', 'circle', 'ellipse'].includes(node.tag)) && !(p.box.w > 0 && p.box.h > 0);   // SVG draws nothing either
      if ((p.fill || p.stroke) && !empty) out.push(p);
      break;
    }
    case 'text': { const p = textPrim(node, mm, ctx); if (p.lines.some((l) => l.trim())) out.push(p); break; }
    case 'image': { const p = imagePrim(node, mm); if (p.href && p.box.w > 0 && p.box.h > 0) out.push(p); break; }
    default: break;
  }
  return out;
}

export function primitives(it, ctx) {
  const out = collect(parseMarkup(renderItem(it)), IDENT, ctx, []);
  // a picture inside an icon sits on the disc: flattened onto the disc colour it needs no transparency, which
  // some importers lose
  if (it.type === 'node') for (const p of out) if (p.kind === 'image') p.bg = ctx.col(it.inactive ? '#ffffff' : it.color) || '#ffffff';
  // lines of one paragraph that the renderer wrote as separate texts (the description under an icon) become one
  // text block again, so they are edited as one in Visio
  const merged = [];
  for (const p of out) {
    const q = merged[merged.length - 1];
    const same = q && q.kind === 'text' && p.kind === 'text' && p.lines.length === 1 && !q.rot && !p.rot && !q.halo && !p.halo &&
      q.x === p.x && q.anchor === p.anchor && q.size === p.size && q.weight === p.weight && q.color === p.color && q.italic === p.italic;
    const step = same ? p.y - (q.y + (q.lines.length - 1) * q.pitch) : 0;
    if (same && step > 0 && step < p.size * 2.5 && (q.lines.length === 1 || Math.abs(step - q.pitch) < 0.01)) { q.lines.push(p.lines[0]); q.pitch = step; }
    else merged.push(p);
  }
  return merged;
}

// ------------------------------------------------------------------------------------------------ Visio look-ups
// Fonts: Visio has one bold switch, so the in-between weights use the font family's own named faces.
// asc/desc are the font's typographic ascender and descender (OS/2 sTypoAscender, sTypoDescender) per em.
const FACES = {
  'segoe ui': { 400: ['Segoe UI', 0], 500: ['Segoe UI Semibold', 0], 600: ['Segoe UI Semibold', 0], 700: ['Segoe UI', 1], asc: 1491 / 2048, desc: 431 / 2048 },
  'ibm plex sans': { 400: ['IBM Plex Sans', 0], 500: ['IBM Plex Sans Medium', 0], 600: ['IBM Plex Sans SemiBold', 0], 700: ['IBM Plex Sans', 1], asc: 0.78, desc: 0.22 },
};
function face(font, weight) {
  const w = [400, 500, 600, 700].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), 400);
  const f = FACES[String(font).toLowerCase()];
  if (f) return { name: f[w][0], bold: f[w][1], asc: f.asc, desc: f.desc };
  return { name: font, bold: w >= 600 ? 1 : 0, asc: 1491 / 2048, desc: 431 / 2048 };      // Arial's values, typical for a sans-serif
}

// Distance from the top of a text block to the baseline of its first line, for a line pitch p (page pixels).
// Visio centres the font's typographic ascender + descender in the pitch. Measured in Visio 2024 with Segoe UI:
// with these values text of 12 to 32 px lands within a fraction of a pixel of NetDraw's baseline.
export const baselineOffset = (f, size, p) => p / 2 + ((f.asc - f.desc) / 2) * size;
// Visio's built-in line patterns as [number, dash and gap lengths in line widths]; the nearest one is used.
// Visio draws dashes with flat ends, so a round-capped SVG dash counts as one line width longer.
const LINE_PATTERNS = [
  [2, [6, 3]], [3, [1, 3]], [9, [3, 2]], [10, [1, 2]], [16, [11, 5]], [17, [1, 5]], [23, [2, 2]],
  [4, [6, 3, 1, 3]], [11, [3, 2, 1, 2]], [18, [11, 5, 1, 5]],
];
export function linePattern(dash, sw, cap = 'butt') {
  if (!dash || !(sw > 0)) return 1;
  let d = dash.map((v) => v / sw);
  if (d.length % 2) d = [...d, ...d];
  if (cap !== 'butt') d = d.map((v, i) => (i % 2 ? Math.max(0.2, v - 1) : v + 1));
  const n = d.length >= 4 && (Math.abs(d[0] - d[2]) > 0.3 || Math.abs(d[1] - d[3]) > 0.3) ? 4 : 2;
  let best = 2, bd = Infinity;
  for (const [k, pat] of LINE_PATTERNS) {
    if (pat.length !== n) continue;
    const e = pat.reduce((sum, v, i) => sum + (i % 2 ? 0.6 : 1) * Math.abs(Math.log((v + 0.3) / (d[i] + 0.3))), 0);   // the dash length matters most
    if (e < bd) { bd = e; best = k; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ shape XML
const NO_STYLE = "LineStyle='0' FillStyle='0' TextStyle='0'";
const SECTION_FLAGS = (noFill, noLine) =>
  `${cell('NoFill', noFill ? 1 : 0)}${cell('NoLine', noLine ? 1 : 0)}${cell('NoShow', 0)}${cell('NoSnap', 0)}${cell('NoQuickDrag', 0)}`;
const MIN_BOX = 2;   // page pixels: a line has no height of its own, Visio still wants a box

function padBox(b) {
  const o = { ...b };
  if (o.w < MIN_BOX) { o.x -= (MIN_BOX - o.w) / 2; o.w = MIN_BOX; }
  if (o.h < MIN_BOX) { o.y -= (MIN_BOX - o.h) / 2; o.h = MIN_BOX; }
  return o;
}

// Position and size cells of a shape with box b (page pixels). Inside a group the cells follow the group
// (par), so resizing the group in Visio resizes its members with it. `pin` overrides how the centre follows:
// {mode: 'edge', ax, ay} keeps a fixed distance to one side of the group (titles, labels).
function xform(ctx, b, par, pin, angle = 0, loc = null) {
  const { S } = ctx;
  const cx = loc ? loc.x : b.x + b.w / 2, cy = loc ? loc.y : b.y + b.h / 2;
  let s;
  if (!par) {
    s = cell('PinX', cx * S) + cell('PinY', (ctx.PH - cy) * S) + cell('Width', b.w * S) + cell('Height', b.h * S);
  } else {
    const ref = `Sheet.${par.id}!`;
    const lx = cx - par.box.x, ly = par.box.y + par.box.h - cy;      // group-local, y up
    let fx = `${ref}Width*${num(lx / par.box.w)}`, fy = `${ref}Height*${num(ly / par.box.h)}`;
    if (pin && pin.mode === 'edge') {
      const off = (d) => `${d < 0 ? '-' : '+'}${num(Math.abs(d) * S)}DL`;
      fx = `${ref}Width*${pin.ax}${off(lx - pin.ax * par.box.w)}`;
      fy = `${ref}Height*${pin.ay}${off(ly - pin.ay * par.box.h)}`;
    }
    s = cell('PinX', lx * S, fx) + cell('PinY', ly * S, fy);
    if (pin && pin.mode === 'edge') s += cell('Width', b.w * S) + cell('Height', b.h * S);
    else s += cell('Width', b.w * S, `${ref}Width*${num(b.w / par.box.w)}`) + cell('Height', b.h * S, `${ref}Height*${num(b.h / par.box.h)}`);
  }
  if (loc) {
    const fx = (loc.x - b.x) / b.w, fy = (b.y + b.h - loc.y) / b.h;
    s += cell('LocPinX', fx * b.w * S, `Width*${num(fx)}`) + cell('LocPinY', fy * b.h * S, `Height*${num(fy)}`);
  } else s += cell('LocPinX', (b.w * S) / 2, 'Width*0.5') + cell('LocPinY', (b.h * S) / 2, 'Height*0.5');
  return `${s}${cell('Angle', angle)}${cell('FlipX', 0)}${cell('FlipY', 0)}${cell('ResizeMode', 0)}`;
}

function lineCells(ctx, p) {
  if (!p.stroke) return cell('LinePattern', 0);
  return cell('LineWeight', p.sw * ctx.S) + cell('LineColor', p.stroke) + cell('LinePattern', linePattern(p.dash, p.sw, p.cap)) +
    cell('LineCap', p.cap === 'round' ? 0 : p.cap === 'square' ? 2 : 1);
}
const fillCells = (p) => (p.fill ? cell('FillForegnd', p.fill) + cell('FillBkgnd', p.fill) + cell('FillPattern', 1) : cell('FillPattern', 0));

// One Geometry section per sub-path: Visio leaves the overlap of two sections unfilled, which is how the holes
// in a logo or a letter stay open.
function geometry(subs, b, { fill, stroke }, firstIx = 0) {
  const rx = (x) => num((x - b.x) / b.w), ry = (y) => num(1 - (y - b.y) / b.h);
  let out = '', ix = firstIx;
  const section = (s, close, noFill, noLine) => {
    let r = 1;
    let rows = `<Row T='RelMoveTo' IX='${r++}'>${cell('X', rx(s.start.x))}${cell('Y', ry(s.start.y))}</Row>`;
    for (const g of s.segs) {
      rows += g.c === 'L'
        ? `<Row T='RelLineTo' IX='${r++}'>${cell('X', rx(g.x))}${cell('Y', ry(g.y))}</Row>`
        : `<Row T='RelCubBezTo' IX='${r++}'>${cell('X', rx(g.x))}${cell('Y', ry(g.y))}${cell('A', rx(g.x1))}${cell('B', ry(g.y1))}${cell('C', rx(g.x2))}${cell('D', ry(g.y2))}</Row>`;
    }
    const e = endOf(s);
    if (close && (Math.abs(e.x - s.start.x) > 1e-6 || Math.abs(e.y - s.start.y) > 1e-6)) {
      rows += `<Row T='RelLineTo' IX='${r++}'>${cell('X', rx(s.start.x))}${cell('Y', ry(s.start.y))}</Row>`;
    }
    out += `<Section N='Geometry' IX='${ix++}'>${SECTION_FLAGS(noFill, noLine)}${rows}</Section>`;
  };
  for (const s of subs) {
    const f = fill && !s.noFill;
    if (!f && !stroke) continue;
    if (f && stroke && !s.closed) { section(s, true, false, true); section(s, false, true, false); }   // filled like SVG, outlined as drawn
    else section(s, s.closed || !!f, !f, !stroke);
  }
  return out;
}

const rectRows = () => `<Row T='RelMoveTo' IX='1'>${cell('X', 0)}${cell('Y', 0)}</Row><Row T='RelLineTo' IX='2'>${cell('X', 1)}${cell('Y', 0)}</Row>` +
  `<Row T='RelLineTo' IX='3'>${cell('X', 1)}${cell('Y', 1)}</Row><Row T='RelLineTo' IX='4'>${cell('X', 0)}${cell('Y', 1)}</Row><Row T='RelLineTo' IX='5'>${cell('X', 0)}${cell('Y', 0)}</Row>`;

// Rounded rectangle with corners of a fixed radius: the straight sides follow Width and Height, the corners keep
// their size when the shape is resized in Visio. (The Rounding cell would do the same, but importers other
// than Visio ignore it.)
function roundRectRows(w, h, r) {
  const q = r * (1 - Math.SQRT1_2);
  const R = `${num(r)}DL`, Q = `${num(q)}DL`;
  const line = (i, x, fx, y, fy) => `<Row T='LineTo' IX='${i}'>${cell('X', x, fx)}${cell('Y', y, fy)}</Row>`;
  const arc = (i, x, fx, y, fy, a, fa, b, fb) => `<Row T='EllipticalArcTo' IX='${i}'>${cell('X', x, fx)}${cell('Y', y, fy)}` +
    `${cell('A', a, fa, 'DL')}${cell('B', b, fb, 'DL')}${cell('C', 0)}${cell('D', 1)}</Row>`;
  return `<Row T='MoveTo' IX='1'>${cell('X', r)}${cell('Y', 0)}</Row>` +
    line(2, w - r, `Width-${R}`, 0) + arc(3, w, 'Width*1', r, null, w - q, `Width-${Q}`, q) +
    line(4, w, 'Width*1', h - r, `Height-${R}`) + arc(5, w - r, `Width-${R}`, h, 'Height*1', w - q, `Width-${Q}`, h - q, `Height-${Q}`) +
    line(6, r, null, h, 'Height*1') + arc(7, 0, null, h - r, `Height-${R}`, q, null, h - q, `Height-${Q}`) +
    line(8, 0, null, r) + arc(9, r, null, 0, null, q, null, q);
}

function geoShape(ctx, p, id, par, name) {
  const b = padBox(p.box);
  let geo;
  if (p.rect) {
    const rows = p.rect.r > 0.01 ? roundRectRows(b.w * ctx.S, b.h * ctx.S, Math.min(p.rect.r, b.w / 2, b.h / 2) * ctx.S) : rectRows();
    geo = `<Section N='Geometry' IX='0'>${SECTION_FLAGS(!p.fill, !p.stroke)}${rows}</Section>`;
  } else if (p.ellipse) {
    const w = b.w * ctx.S, h = b.h * ctx.S;
    geo = `<Section N='Geometry' IX='0'>${SECTION_FLAGS(!p.fill, !p.stroke)}<Row T='Ellipse' IX='1'>${cell('X', w / 2, 'Width*0.5')}${cell('Y', h / 2, 'Height*0.5')}` +
      `${cell('A', w, 'Width*1')}${cell('B', h / 2, 'Height*0.5')}${cell('C', w / 2, 'Width*0.5')}${cell('D', h, 'Height*1')}</Row></Section>`;
  } else geo = geometry(p.subs, b, p);
  return `<Shape ID='${id}'${name} Type='Shape' ${NO_STYLE}>${xform(ctx, b, par)}${lineCells(ctx, p)}${fillCells(p)}${geo}</Shape>`;
}

// Text block: a box around the lines, top-aligned without margins, so the first baseline lands where SVG has it.
function textLayout(ctx, t) {
  const f = face(ctx.font, t.weight);
  ctx.faces.add(f.name);
  const n = t.lines.length, pitch = n > 1 && t.pitch > 0 ? t.pitch : t.size * 1.2;
  const w = Math.max(...t.lines.map((l) => measure(l, t.size, t.weight))) * 1.25 + t.size * 0.8;
  const top = t.y - baselineOffset(f, t.size, pitch);
  const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { f, pitch, box: { x, y: top, w, h: n * pitch } };
}

function textSections(ctx, t, lay) {
  const style = (lay.f.bold ? 1 : 0) | (t.italic ? 2 : 0);
  return `<Section N='Character'><Row IX='0'>${cell('Font', lay.f.name)}${cell('Color', t.color)}${cell('Style', style)}${cell('Size', t.size * ctx.S)}</Row></Section>` +
    `<Section N='Paragraph'><Row IX='0'>${cell('SpLine', -lay.pitch / t.size)}${cell('HorzAlign', t.anchor === 'middle' ? 1 : t.anchor === 'end' ? 2 : 0)}</Row></Section>`;
}
const textBlockCells = (t) => cell('LeftMargin', 0) + cell('RightMargin', 0) + cell('TopMargin', 0) + cell('BottomMargin', 0) + cell('VerticalAlign', 0) +
  (t.halo ? cell('TextBkgnd', t.halo) : '');
const textElement = (t) => `<Text>${xt(t.lines.join('\n'))}</Text>`;

function textShape(ctx, t, id, par, pin, name) {
  const lay = textLayout(ctx, t);
  const rotated = Math.abs(t.rot) > 1e-6;
  const xf = xform(ctx, lay.box, par, pin, rotated ? -t.rot : 0, rotated ? { x: t.x, y: t.y } : null);
  return `<Shape ID='${id}'${name} Type='Shape' ${NO_STYLE}>${xf}${cell('LinePattern', 0)}${cell('FillPattern', 0)}${textBlockCells(t)}` +
    `${textSections(ctx, t, lay)}<Section N='Geometry' IX='0'>${SECTION_FLAGS(true, true)}${rectRows()}</Section>${textElement(t)}</Shape>`;
}

// ---- images: PNG and JPEG are embedded as they are, anything else (SVG) goes through the caller's rasteriser
const b64bytes = (s) => { const bin = atob(s.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
function imageSize(u, type) {
  if (type === 'png' && u.length > 24) return { w: (u[16] << 24 | u[17] << 16 | u[18] << 8 | u[19]) >>> 0, h: (u[20] << 24 | u[21] << 16 | u[22] << 8 | u[23]) >>> 0 };
  if (type === 'jpeg') {
    for (let i = 2; i + 9 < u.length;) {
      if (u[i] !== 0xff) { i++; continue; }
      const mk = u[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { w: u[i + 7] << 8 | u[i + 8], h: u[i + 5] << 8 | u[i + 6] };
      i += 2 + (u[i + 2] << 8 | u[i + 3]);
    }
  }
  return null;
}

async function loadImage(ctx, p) {
  const key = `${p.href}|${Math.round(p.box.w)}x${Math.round(p.box.h)}|${p.bg || ''}`;
  if (ctx.media.has(key)) return ctx.media.get(key);
  let rec = null;
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/is.exec(p.href);
  try {
    if (ctx.rasterize && (!m || p.bg)) {
      // four device pixels per page pixel: about 500 dpi at the print scale
      const data = await ctx.rasterize(p.href, p.box.w, p.box.h, 4, p.bg || null);
      if (data && data.length) rec = { type: 'png', data: data instanceof Uint8Array ? data : new Uint8Array(data), size: null };
    }
    if (!rec && m) {
      const type = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg', data = b64bytes(m[2]);
      rec = { type, data, size: imageSize(data, type) };
    }
  } catch (e) { ctx.warnings.push(`image skipped: ${e.message || e}`); }
  if (!rec) ctx.warnings.push('An image could not be converted and was left out.');
  else { rec.n = ctx.media.size + 1; rec.name = `image${rec.n}.${rec.type === 'png' ? 'png' : 'jpeg'}`; }
  ctx.media.set(key, rec);
  return rec;
}

async function imageShape(ctx, p, id, par, name) {
  const rec = await loadImage(ctx, p);
  if (!rec) return '';
  let b = p.box;
  if (p.meet && rec.size && rec.size.w && rec.size.h) {
    const k = Math.min(b.w / rec.size.w, b.h / rec.size.h), w = rec.size.w * k, h = rec.size.h * k;
    b = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
  }
  const W = b.w * ctx.S, H = b.h * ctx.S;
  return `<Shape ID='${id}'${name} Type='Foreign' ${NO_STYLE}>${xform(ctx, b, par)}` +
    `${cell('ImgOffsetX', 0, 'ImgWidth*0')}${cell('ImgOffsetY', 0, 'ImgHeight*0')}${cell('ImgWidth', W, 'Width*1')}${cell('ImgHeight', H, 'Height*1')}` +
    `${cell('LinePattern', 0)}${cell('FillPattern', 0)}${p.opacity < 1 ? cell('Transparency', 1 - p.opacity) : ''}` +
    `<Section N='Geometry' IX='0'>${SECTION_FLAGS(true, true)}${rectRows()}</Section>` +
    `<ForeignData ForeignType='Bitmap' CompressionType='${rec.type === 'png' ? 'PNG' : 'JPEG'}'><Rel r:id='rId${rec.n}'/></ForeignData></Shape>`;
}

const primBox = (ctx, p) => (p.kind === 'text' ? textLayout(ctx, p).box : padBox(p.box));

async function primShape(ctx, p, id, par, pin, name = '') {
  if (p.kind === 'geo') return geoShape(ctx, p, id, par, name);
  if (p.kind === 'text') return textShape(ctx, p, id, par, pin, name);
  return imageShape(ctx, p, id, par, name);
}

// ------------------------------------------------------------------------------------------------ items
const LABELS = { node: 'Icon', zone: 'Container', connector: 'Line', text: 'Text', badge: 'Marker', path: 'Shape', circle: 'Shape', image: 'Picture' };
const nameAttr = (it, id) => { const n = `${LABELS[it.type] || 'Shape'}.${id}`; return ` NameU='${n}' Name='${n}'`; };

// How a text inside a group follows the group when it is resized in Visio.
function textPin(it, t, box) {
  if (it.type === 'zone') return { mode: 'edge', ax: t.anchor === 'middle' ? 0.5 : t.anchor === 'end' ? 1 : 0, ay: 1 };
  if (it.type === 'node') {
    if (t.y > box.y + box.h) return { mode: 'edge', ax: 0.5, ay: 0 };      // label under the disc
    if (t.y < box.y) return { mode: 'edge', ax: 0.5, ay: 1 };
  }
  return null;
}

async function groupShape(ctx, it, prims, id, box, conns) {
  const par = { id, box };
  let kids = '';
  for (const p of prims) kids += await primShape(ctx, p, ctx.nextId++, par, p.kind === 'text' ? textPin(it, p, box) : null);
  let cs = '';
  if (conns && conns.length) {
    cs = `<Section N='Connection'>${conns.map((c, i) => {
      const fx = (c.x - box.x) / box.w, fy = (box.y + box.h - c.y) / box.h;
      return `<Row T='Connection' IX='${i}'>${cell('X', fx * box.w * ctx.S, `Width*${num(fx)}`)}${cell('Y', fy * box.h * ctx.S, `Height*${num(fy)}`)}` +
        `${cell('DirX', 0)}${cell('DirY', 0)}${cell('Type', 0)}${cell('AutoGen', 0)}${cell('Prompt', '', 'No Formula')}</Row>`;
    }).join('')}</Section>`;
  }
  return `<Shape ID='${id}'${nameAttr(it, id)} Type='Group' ${NO_STYLE}>${xform(ctx, box, null)}${cs}<Shapes>${kids}</Shapes></Shape>`;
}

// ---- connectors
const unit = (ax, ay, bx, by) => { const l = Math.hypot(bx - ax, by - ay); return l > 1e-6 ? [(bx - ax) / l, (by - ay) / l] : null; };

// The point just before the end of a sub-path (or just after its start): it sets the direction of the arrowhead.
function neighbour(s, atEnd) {
  const pts = [[s.start.x, s.start.y]];
  for (const g of s.segs) { if (g.c === 'C') pts.push([g.x1, g.y1], [g.x2, g.y2]); pts.push([g.x, g.y]); }
  if (!atEnd) pts.reverse();
  const e = pts[pts.length - 1];
  for (let i = pts.length - 2; i >= 0; i--) if (Math.hypot(pts[i][0] - e[0], pts[i][1] - e[1]) > 1e-3) return { x: pts[i][0], y: pts[i][1] };
  return null;
}

// NetDraw's arrowhead (the SVG marker): a triangle as long and as wide as arrowSize x line width, whose tip
// reaches 0.15 of that length past the end of the line.
function arrowTriangle(end, from, len) {
  const u = unit(from.x, from.y, end.x, end.y);
  if (!u) return null;
  const P = (along, across) => ({ x: end.x + along * u[0] - across * u[1], y: end.y + along * u[1] + across * u[0] });
  const tip = P(0.15 * len, 0), a = P(-0.85 * len, len / 2), b = P(-0.85 * len, -len / 2);
  return { start: tip, closed: true, segs: [{ c: 'L', ...a }, { c: 'L', ...b }, { c: 'L', ...tip }] };
}

function connectorPath(it) {
  const subs = toSubpaths(parsePath(it.d || ''));
  if (subs.length !== 1 || subs[0].closed) return null;
  const s = subs[0], a = s.start, b = endOf(s);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return null;      // a loop has no direction to hang a 1-D shape on
  return { sub: s, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

function connectorShape(ctx, it, id, cp, prims, glue) {
  const { S, PH } = ctx;
  const line = prims.find((p) => p.kind === 'geo'), label = prims.find((p) => p.kind === 'text');
  const P = (x, y) => [x * S, (PH - y) * S];                    // page pixels -> Visio inches, y up
  const [bx, by] = P(cp.a.x, cp.a.y), [ex, ey] = P(cp.b.x, cp.b.y);
  const L = Math.hypot(ex - bx, ey - by), ang = Math.atan2(ey - by, ex - bx), ca = Math.cos(ang), sa = Math.sin(ang);
  // local frame of a 1-D shape: u along the line from begin to end, v across it
  const loc = (x, y) => { const [X, Y] = P(x, y); return [(X - bx) * ca + (Y - by) * sa, -(X - bx) * sa + (Y - by) * ca]; };
  let vmax = 0;
  for (const [x, y] of flat(cp.sub, 12)) vmax = Math.max(vmax, Math.abs(loc(x, y)[1]));
  const H = Math.max(2 * vmax, MIN_BOX * S);
  const U = (x, y) => num(loc(x, y)[0] / L), V = (x, y) => num(loc(x, y)[1] / H + 0.5);
  let r = 1;
  let rows = `<Row T='RelMoveTo' IX='${r++}'>${cell('X', 0)}${cell('Y', 0.5)}</Row>`;
  cp.sub.segs.forEach((g, i) => {
    const last = i === cp.sub.segs.length - 1;
    const X = last ? '1' : U(g.x, g.y), Y = last ? '0.5' : V(g.x, g.y);
    rows += g.c === 'L' ? `<Row T='RelLineTo' IX='${r++}'>${cell('X', X)}${cell('Y', Y)}</Row>`
      : `<Row T='RelCubBezTo' IX='${r++}'>${cell('X', X)}${cell('Y', Y)}${cell('A', U(g.x1, g.y1))}${cell('B', V(g.x1, g.y1))}${cell('C', U(g.x2, g.y2))}${cell('D', V(g.x2, g.y2))}</Row>`;
  });
  let geo = `<Section N='Geometry' IX='0'>${SECTION_FLAGS(true, false)}${rows}</Section>`;

  // Arrowheads are a second, filled outline in the same shape. Their cells follow the direction in which the
  // line arrives (User.*), so the head keeps its shape and turns with the line when an icon is moved in Visio.
  let user = '', heads = 0;
  const A = (it.arrowSize || 5.2) * (it.width || 2) * S;
  const head = (key, atEnd) => {
    const nb = neighbour(cp.sub, atEnd);
    if (!nb) return;
    const [nu, nv] = loc(nb.x, nb.y);
    const ox = atEnd ? L : 0, base = atEnd ? 'Width' : 'Width*0';
    const dx = ox - nu, dy = -nv, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const row = (n, v, f) => `<Row N='${key}${n}'>${cell('Value', v, f)}${cell('Prompt', '', 'No Formula')}</Row>`;
    user += row('DX', dx, `Width*${num((atEnd ? 1 : 0) - nu / L)}`) + row('DY', dy, `Height*${num(-nv / H)}`) +
      row('Len', len, `SQRT(User.${key}DX^2+User.${key}DY^2)`) + row('UX', ux, `User.${key}DX/User.${key}Len`) + row('UY', uy, `User.${key}DY/User.${key}Len`);
    const term = (k, name) => (Math.abs(k) < 1e-9 ? '' : `${k < 0 ? '-' : '+'}${num(Math.abs(k))}DL*User.${key}${name}`);
    const pt = (i, type, along, across) => `<Row T='${type}' IX='${i}'>` +
      `${cell('X', ox + along * ux - across * uy, `${base}${term(along, 'UX')}${term(-across, 'UY')}`)}` +
      `${cell('Y', H / 2 + along * uy + across * ux, `Height*0.5${term(along, 'UY')}${term(across, 'UX')}`)}</Row>`;
    geo += `<Section N='Geometry' IX='${++heads}'>${SECTION_FLAGS(false, true)}${pt(1, 'MoveTo', 0.15 * A, 0)}${pt(2, 'LineTo', -0.85 * A, A / 2)}` +
      `${pt(3, 'LineTo', -0.85 * A, -A / 2)}${pt(4, 'LineTo', 0.15 * A, 0)}</Section>`;
  };
  if (it.arrowEnd) head('End', true);
  if (it.arrowStart) head('Beg', false);

  const glued = (k) => (glue[k] ? `PAR(PNT(Sheet.${glue[k].sheet}!Connections.X${glue[k].row + 1},Sheet.${glue[k].sheet}!Connections.Y${glue[k].row + 1}))` : null);
  let s = cell('PinX', (bx + ex) / 2, '(BeginX+EndX)/2') + cell('PinY', (by + ey) / 2, '(BeginY+EndY)/2') +
    cell('Width', L, 'SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)') + cell('Height', H) + cell('LocPinX', L / 2, 'Width*0.5') + cell('LocPinY', H / 2, 'Height*0.5') +
    cell('Angle', ang, 'ATAN2(EndY-BeginY,EndX-BeginX)') + cell('FlipX', 0) + cell('FlipY', 0) + cell('ResizeMode', 0) +
    cell('BeginX', bx, glued('from')) + cell('BeginY', by, glued('from')) + cell('EndX', ex, glued('to')) + cell('EndY', ey, glued('to'));
  let sections = user ? `<Section N='User'>${user}</Section>` : '', text = '';
  if (label) {
    const lay = textLayout(ctx, label);
    const [tu, tv] = loc(label.x, lay.box.y + lay.box.h / 2);
    s += cell('TxtPinX', tu, `Width*${num(tu / L)}`) + cell('TxtPinY', tv + H / 2, `Height*${num(tv / H + 0.5)}`) +
      cell('TxtWidth', lay.box.w * S) + cell('TxtHeight', lay.box.h * S) + cell('TxtLocPinX', (lay.box.w * S) / 2, 'TxtWidth*0.5') +
      cell('TxtLocPinY', (lay.box.h * S) / 2, 'TxtHeight*0.5') + cell('TxtAngle', -ang, '-Angle') + textBlockCells(label);
    sections += textSections(ctx, label, lay);
    text = textElement(label);
  }
  // the heads take the colour of the line, also after it is recoloured in Visio
  s += lineCells(ctx, line) + (heads ? cell('FillForegnd', line.stroke, 'LineColor') + cell('FillBkgnd', line.stroke, 'LineColor') + cell('FillPattern', 1) : cell('FillPattern', 0)) +
    cell('ObjType', 4);
  return `<Shape ID='${id}'${nameAttr(it, id)} Type='Shape' ${NO_STYLE}>${s}${sections}${geo}${text}</Shape>`;
}

// A line that cannot be a 1-D shape (a closed loop, several pieces): its arrowheads become plain shapes.
function looseArrows(it, ctx) {
  const out = [], col = ctx.col(it.color);
  const len = (it.arrowSize || 5.2) * (it.width || 2);
  if (!col || !(it.width > 0)) return out;      // SVG draws no marker on an invisible line
  for (const s of toSubpaths(parsePath(it.d || ''))) {
    for (const atEnd of [true, false]) {
      if (!(atEnd ? it.arrowEnd : it.arrowStart)) continue;
      const nb = neighbour(s, atEnd), e = atEnd ? endOf(s) : s.start;
      const tri = nb && arrowTriangle({ x: e.x, y: e.y }, nb, len);
      if (tri) out.push({ kind: 'geo', fill: col, stroke: null, sw: 0, cap: 'butt', dash: null, subs: [tri], box: boxOf([tri]) });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ package
// Visio's default style ("No Style"): every cell a shape does not set itself comes from here.
const STYLE0 = 'EnableLineProps=1;EnableFillProps=1;EnableTextProps=1;HideForApply=0;LineWeight=0.01041666666666667;LineColor=0;LinePattern=1;Rounding=0;EndArrowSize=2;BeginArrow=0;EndArrow=0;LineCap=0;BeginArrowSize=2;LineColorTrans=0;CompoundType=0;FillForegnd=1;FillBkgnd=0;FillPattern=1;ShdwForegnd=0;ShdwPattern=0;FillForegndTrans=0;FillBkgndTrans=0;ShdwForegndTrans=0;ShapeShdwType=0;ShapeShdwOffsetX=0;ShapeShdwOffsetY=0;ShapeShdwObliqueAngle=0;ShapeShdwScaleFactor=1;ShapeShdwBlur=0;ShapeShdwShow=0;LeftMargin=0;RightMargin=0;TopMargin=0;BottomMargin=0;VerticalAlign=1;TextBkgnd=0;DefaultTabStop=0.5905511811023622;TextDirection=0;TextBkgndTrans=0;LockWidth=0;LockHeight=0;LockMoveX=0;LockMoveY=0;LockAspect=0;LockDelete=0;LockBegin=0;LockEnd=0;LockRotate=0;LockCrop=0;LockVtxEdit=0;LockTextEdit=0;LockFormat=0;LockGroup=0;LockCalcWH=0;LockSelect=0;LockCustProp=0;LockFromGroupFormat=0;LockThemeColors=0;LockThemeEffects=0;LockThemeConnectors=0;LockThemeFonts=0;LockThemeIndex=0;LockReplace=0;LockVariation=0;NoObjHandles=0;NonPrinting=0;NoCtlHandles=0;NoAlignBox=0;UpdateAlignBox=0;HideText=0;DynFeedback=0;GlueType=0;WalkPreference=0;BegTrigger=0||No Formula;EndTrigger=0||No Formula;ObjType=0;Comment=;IsDropSource=0;NoLiveDynamics=0;LocalizeMerge=0;NoProofing=0;Calendar=0;LangID=en-US;ShapeKeywords=;DropOnPageScale=1;TheData=0||No Formula;TheText=0||No Formula;EventDblClick=0||No Formula;EventXFMod=0||No Formula;EventDrop=0||No Formula;EventMultiDrop=0||No Formula;HelpTopic=;Copyright=;LayerMember=;XRulerDensity=32;YRulerDensity=32;XRulerOrigin=0;YRulerOrigin=0;XGridDensity=8;YGridDensity=8;XGridSpacing=0;YGridSpacing=0;XGridOrigin=0;YGridOrigin=0;Gamma=1;Contrast=0.5;Brightness=0.5;Sharpen=0;Blur=0;Denoise=0;Transparency=0;SelectMode=1;DisplayMode=2;IsDropTarget=0;IsSnapTarget=1;IsTextEditTarget=1;DontMoveChildren=0;ShapePermeableX=0;ShapePermeableY=0;ShapePermeablePlace=0;Relationships=0;ShapeFixedCode=0;ShapePlowCode=0;ShapeRouteStyle=0;ShapePlaceStyle=0;ConFixedCode=0;ConLineJumpCode=0;ConLineJumpStyle=0;ConLineJumpDirX=0;ConLineJumpDirY=0;ShapePlaceFlip=0;ConLineRouteExt=0;ShapeSplit=0;ShapeSplittable=0;DisplayLevel=0;ResizePage=0;EnableGrid=0;DynamicsOff=0;CtrlAsInput=0;AvoidPageBreaks=0;PlaceStyle=0;RouteStyle=0;PlaceDepth=0;PlowCode=0;LineJumpCode=1;LineJumpStyle=0;PageLineJumpDirX=0;PageLineJumpDirY=0;LineToNodeX=0.09842519685039369;LineToNodeY=0.09842519685039369;BlockSizeX=0.1968503937007874;BlockSizeY=0.1968503937007874;AvenueSizeX=0.2952755905511811;AvenueSizeY=0.2952755905511811;LineToLineX=0.09842519685039369;LineToLineY=0.09842519685039369;LineJumpFactorX=0.66666666666667;LineJumpFactorY=0.66666666666667;LineAdjustFrom=0;LineAdjustTo=0;PlaceFlip=0;LineRouteExt=0;PageShapeSplit=0;PageLeftMargin=0.25;PageRightMargin=0.25;PageTopMargin=0.25;PageBottomMargin=0.25;ScaleX=1;ScaleY=1;PagesX=1;PagesY=1;CenterX=0;CenterY=0;OnPage=0;PrintGrid=0;PrintPageOrientation=1;PaperKind=9;PaperSource=7;QuickStyleLineColor=100;QuickStyleFillColor=100;QuickStyleShadowColor=100;QuickStyleFontColor=100;QuickStyleLineMatrix=100;QuickStyleFillMatrix=100;QuickStyleEffectsMatrix=100;QuickStyleFontMatrix=100;QuickStyleType=0;QuickStyleVariation=0;LineGradientDir=0;LineGradientAngle=1.5707963267949;FillGradientDir=0;FillGradientAngle=1.5707963267949;LineGradientEnabled=0;FillGradientEnabled=0;RotateGradientWithShape=1;UseGroupGradient=0;BevelTopType=0;BevelTopWidth=0;BevelTopHeight=0;BevelBottomType=0;BevelBottomWidth=0;BevelBottomHeight=0;BevelDepthColor=1;BevelDepthSize=0;BevelContourColor=0;BevelContourSize=0;BevelMaterialType=0;BevelLightingType=0;BevelLightingAngle=0;RotationXAngle=0;RotationYAngle=0;RotationZAngle=0;RotationType=0;Perspective=0;DistanceFromGround=0;KeepTextFlat=0;ReflectionTrans=0;ReflectionSize=0;ReflectionDist=0;ReflectionBlur=0;GlowColor=1;GlowColorTrans=0;GlowSize=0;SoftEdgesSize=0;SketchSeed=0;SketchEnabled=0;SketchAmount=5;SketchLineWeight=0.04166666666666666|PT;SketchLineChange=0.14;SketchFillChange=0.1;ColorSchemeIndex=0;EffectSchemeIndex=0;ConnectorSchemeIndex=0;FontSchemeIndex=0;ThemeIndex=0;VariationColorIndex=0;VariationStyleIndex=0;EmbellishmentIndex=0;ReplaceLockShapeData=0;ReplaceLockText=0;ReplaceLockFormat=0;ReplaceCopyCells=0|BOOL|No Formula;PageWidth=0||No Formula;PageHeight=0||No Formula;ShdwOffsetX=0||No Formula;ShdwOffsetY=0||No Formula;PageScale=0|MM|No Formula;DrawingScale=0|MM|No Formula;DrawingSizeType=0||No Formula;DrawingScaleType=0||No Formula;InhibitSnap=0||No Formula;PageLockReplace=0|BOOL|No Formula;PageLockDuplicate=0|BOOL|No Formula;UIVisibility=0||No Formula;ShdwType=0||No Formula;ShdwObliqueAngle=0||No Formula;ShdwScaleFactor=0||No Formula;DrawingResizeType=0||No Formula';

const XML = "<?xml version='1.0' encoding='utf-8' ?>\n";
const NS = "xmlns='http://schemas.microsoft.com/office/visio/2012/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xml:space='preserve'";

function documentXml(font, faces) {
  const cells = STYLE0.split(';').map((c) => { const [nv, u, f] = c.split('|'); const i = nv.indexOf('='); return cell(nv.slice(0, i), nv.slice(i + 1), f, u); }).join('');
  const sheet = (id, name, body) => `<StyleSheet ID='${id}' NameU='${name}' IsCustomNameU='1' Name='${name}' IsCustomName='1' ${NO_STYLE}>` +
    `${cell('EnableLineProps', 1)}${cell('EnableFillProps', 1)}${cell('EnableTextProps', 1)}${cell('HideForApply', 0)}${body}</StyleSheet>`;
  return `${XML}<VisioDocument ${NS}><DocumentSettings TopPage='0' DefaultTextStyle='3' DefaultLineStyle='3' DefaultFillStyle='3' DefaultGuideStyle='4'>` +
    '<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions><SnapAngles/><DynamicGridEnabled>1</DynamicGridEnabled>' +
    '<ProtectStyles>0</ProtectStyles><ProtectShapes>0</ProtectShapes><ProtectMasters>0</ProtectMasters><ProtectBkgnds>0</ProtectBkgnds></DocumentSettings>' +
    `<Colors><ColorEntry IX='24' RGB='#7F7F7F'/><ColorEntry IX='25' RGB='#FFFFFF'/></Colors>` +
    `<FaceNames>${[...new Set([font, ...faces])].map((f) => `<FaceName NameU='${xa(f)}'/>`).join('')}</FaceNames><StyleSheets>` +
    `<StyleSheet ID='0' NameU='No Style' IsCustomNameU='1' Name='No Style' IsCustomName='1'>${cells}` +
    `<Section N='Character'><Row IX='0'>${cell('Font', font)}${cell('Color', 0)}${cell('Style', 0)}${cell('Case', 0)}${cell('Pos', 0)}${cell('FontScale', 1)}${cell('Size', 0.1666666666666667)}` +
    `${cell('DblUnderline', 0)}${cell('Overline', 0)}${cell('Strikethru', 0)}${cell('DoubleStrikethrough', 0)}${cell('Letterspace', 0)}${cell('ColorTrans', 0)}` +
    `${cell('AsianFont', 0)}${cell('ComplexScriptFont', 0)}${cell('ComplexScriptSize', -1)}${cell('LangID', 'en-US')}</Row></Section>` +
    `<Section N='Paragraph'><Row IX='0'>${cell('IndFirst', 0)}${cell('IndLeft', 0)}${cell('IndRight', 0)}${cell('SpLine', -1.2)}${cell('SpBefore', 0)}${cell('SpAfter', 0)}` +
    `${cell('HorzAlign', 1)}${cell('Bullet', 0)}${cell('BulletStr', '')}${cell('BulletFont', 0)}${cell('BulletFontSize', -1)}${cell('TextPosAfterBullet', 0)}${cell('Flags', 0)}</Row></Section>` +
    "<Section N='Tabs'><Row IX='0'/></Section></StyleSheet>" +
    sheet(1, 'Text Only', cell('LinePattern', 0) + cell('FillPattern', 0) + cell('VerticalAlign', 0)) +
    sheet(2, 'None', cell('LinePattern', 0) + cell('FillPattern', 0)) +
    sheet(3, 'Normal', ['Left', 'Right', 'Top', 'Bottom'].map((k) => cell(`${k}Margin`, 0.05555555555555555, null, 'PT')).join('')) +
    sheet(4, 'Guide', cell('LineWeight', 0, null, 'PT') + cell('LineColor', '#7f7f7f') + cell('LinePattern', 23) + cell('FillPattern', 0)) +
    "</StyleSheets><DocumentSheet NameU='TheDoc' IsCustomNameU='1' Name='TheDoc' IsCustomName='1' LineStyle='0' FillStyle='0' TextStyle='0'>" +
    `${cell('OutputFormat', 0)}${cell('LockPreview', 0)}${cell('AddMarkup', 0)}${cell('ViewMarkup', 0)}${cell('DocLockReplace', 0, null, 'BOOL')}${cell('NoCoauth', 0, null, 'BOOL')}` +
    `${cell('DocLockDuplicatePage', 0, null, 'BOOL')}${cell('PreviewQuality', 0)}${cell('PreviewScope', 0)}${cell('DocLangID', 'en-US')}</DocumentSheet></VisioDocument>`;
}

// Windows paper numbers for the print setup, so "Print" in Visio picks the right sheet.
const PAPER_KINDS = [[297, 210, 9], [420, 297, 8], [594, 420, 66]];

function pagesXml(W, H, title) {
  const wmm = W * 25.4, hmm = H * 25.4, long = Math.max(wmm, hmm), short = Math.min(wmm, hmm);
  const kind = PAPER_KINDS.find(([a, b]) => Math.abs(a - long) < 1 && Math.abs(b - short) < 1);
  const name = xa(String(title || '').replace(/[\\/:*?"<>|[\]]/g, ' ').trim().slice(0, 31) || 'Page-1');
  return `${XML}<Pages ${NS}><Page ID='0' NameU='Page-1' Name='${name}' ViewScale='-1' ViewCenterX='${num(W / 2)}' ViewCenterY='${num(H / 2)}'>` +
    `<PageSheet ${NO_STYLE}>${cell('PageWidth', W)}${cell('PageHeight', H)}${cell('ShdwOffsetX', 0.1181102362204724)}${cell('ShdwOffsetY', -0.1181102362204724)}` +
    `${cell('PageScale', 0.03937007874015748, null, 'MM')}${cell('DrawingScale', 0.03937007874015748, null, 'MM')}${cell('DrawingSizeType', 3)}${cell('DrawingScaleType', 0)}` +
    `${cell('InhibitSnap', 0)}${cell('PageLockReplace', 0, null, 'BOOL')}${cell('PageLockDuplicate', 0, null, 'BOOL')}${cell('UIVisibility', 0)}${cell('ShdwType', 0)}` +
    `${cell('ShdwObliqueAngle', 0)}${cell('ShdwScaleFactor', 1)}${cell('DrawingResizeType', 1)}${cell('PageShapeSplit', 1)}` +
    `${cell('PrintPageOrientation', W > H ? 2 : 1)}${kind ? cell('PaperKind', kind[2]) : ''}</PageSheet><Rel r:id='rId1'/></Page></Pages>`;
}

const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const rels = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${REL}">` +
  `${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;

// Build the parts of a .vsdx. opts: {font, dark, rasterize(href, w, h, scale, background) -> PNG bytes, title, creator}.
// Returns {files: [[name, string | Uint8Array]], warnings: [string], stats}.
export async function buildVsdx(doc, opts = {}) {
  const page = doc.page;
  const S = (page.mmPerPx || 0.2) / 25.4;
  const ctx = {
    S, PH: page.height, font: opts.font || 'Segoe UI', rasterize: opts.rasterize, media: new Map(), warnings: [], nextId: 1, faces: new Set(),
    col: (c) => { const h = hex(c); return h && opts.dark ? darkColor(h).toLowerCase() : h; },
  };
  const items = doc.items.filter((it) => !it.hidden);
  const ids = new Map(items.map((it) => [it, ctx.nextId++]));
  const nodes = new Map(items.filter((it) => it.type === 'node').map((n) => [n.id, n]));
  const nodeBox = (n) => ({ x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 });

  // connection points on the icons: the four sides, plus the exact spot where every attached line ends
  const conns = new Map([...nodes.values()].map((n) => [n, [{ x: n.x, y: n.y - n.r }, { x: n.x + n.r, y: n.y }, { x: n.x, y: n.y + n.r }, { x: n.x - n.r, y: n.y }]]));
  const paths = new Map(), glues = new Map();
  for (const it of items) {
    if (it.type !== 'connector') continue;
    const cp = it.color && String(it.color).toLowerCase() !== 'none' && it.width > 0 ? connectorPath(it) : null;
    paths.set(it, cp);
    if (!cp) continue;
    const glue = {};
    for (const [key, pt] of [['from', cp.a], ['to', cp.b]]) {
      const n = it[key] && nodes.get(it[key].id);
      if (!n) continue;
      const list = conns.get(n);
      let row = list.findIndex((c) => Math.abs(c.x - pt.x) < 0.01 && Math.abs(c.y - pt.y) < 0.01);
      if (row < 0) { list.push({ x: pt.x, y: pt.y }); row = list.length - 1; }
      glue[key] = { sheet: ids.get(n), row };
    }
    glues.set(it, glue);
  }

  const shapes = [], connects = [];
  const bg = ctx.col(page.background || '#ffffff');
  if (bg && bg !== '#ffffff') {
    shapes.push(geoShape(ctx, { kind: 'geo', fill: bg, stroke: null, sw: 0, rect: { x: 0, y: 0, w: page.width, h: page.height, r: 0 }, box: { x: 0, y: 0, w: page.width, h: page.height } },
      ctx.nextId++, null, " NameU='Background' Name='Background'"));
  }
  for (const it of items) {
    const id = ids.get(it), prims = primitives(it, ctx);
    if (it.type === 'connector' && !paths.get(it)) prims.push(...looseArrows(it, ctx));
    if (!prims.length) continue;
    if (it.type === 'connector' && paths.get(it) && prims.some((p) => p.kind === 'geo')) {
      const glue = glues.get(it) || {};
      shapes.push(connectorShape(ctx, it, id, paths.get(it), prims, glue));
      if (glue.from) connects.push(`<Connect FromSheet='${id}' FromCell='BeginX' FromPart='9' ToSheet='${glue.from.sheet}' ToCell='Connections.X${glue.from.row + 1}' ToPart='${100 + glue.from.row}'/>`);
      if (glue.to) connects.push(`<Connect FromSheet='${id}' FromCell='EndX' FromPart='12' ToSheet='${glue.to.sheet}' ToCell='Connections.X${glue.to.row + 1}' ToPart='${100 + glue.to.row}'/>`);
    } else if (it.type === 'node') shapes.push(await groupShape(ctx, it, prims, id, padBox(nodeBox(it)), conns.get(it)));
    else if (prims.length === 1) shapes.push(await primShape(ctx, prims[0], id, null, null, nameAttr(it, id)));
    else {
      const box = padBox(it.type === 'zone' ? { x: it.x, y: it.y, w: it.w, h: it.h } : unionBox(prims.map((p) => primBox(ctx, p))));
      shapes.push(await groupShape(ctx, it, prims, id, box, null));
    }
  }

  const W = page.width * S, H = page.height * S;
  const media = [...ctx.media.values()].filter(Boolean);
  const title = opts.title || page.title || 'NetDraw drawing';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>' +
      '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>' +
      '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>' +
      '<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
    ['_rels/.rels', rels([
      ['rId1', 'http://schemas.microsoft.com/visio/2010/relationships/document', 'visio/document.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties', 'docProps/app.xml'],
    ])],
    ['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xt(title)}</dc:title><dc:creator>${xt(opts.creator || 'NetDraw')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
    ['docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>NetDraw</Application></Properties>'],
    ['visio/document.xml', documentXml(face(ctx.font, 400).name, ctx.faces)],
    ['visio/_rels/document.xml.rels', rels([
      ['rId1', 'http://schemas.microsoft.com/visio/2010/relationships/pages', 'pages/pages.xml'],
      ['rId2', 'http://schemas.microsoft.com/visio/2010/relationships/windows', 'windows.xml'],
    ])],
    ['visio/windows.xml', `${XML}<Windows ClientWidth='1600' ClientHeight='900' ${NS}><Window ID='0' WindowType='Drawing' WindowState='1073741824' WindowLeft='0' WindowTop='0' ` +
      `WindowWidth='1600' WindowHeight='900' ContainerType='Page' Page='0' ViewScale='-1' ViewCenterX='${num(W / 2)}' ViewCenterY='${num(H / 2)}'>` +
      '<ShowRulers>1</ShowRulers><ShowGrid>0</ShowGrid><ShowPageBreaks>0</ShowPageBreaks><ShowGuides>1</ShowGuides><ShowConnectionPoints>1</ShowConnectionPoints>' +
      '<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions><SnapAngles/><DynamicGridEnabled>1</DynamicGridEnabled>' +
      '<TabSplitterPos>0.5</TabSplitterPos></Window></Windows>'],
    ['visio/pages/pages.xml', pagesXml(W, H, title)],
    ['visio/pages/_rels/pages.xml.rels', rels([['rId1', 'http://schemas.microsoft.com/visio/2010/relationships/page', 'page1.xml']])],
    ['visio/pages/page1.xml', `${XML}<PageContents ${NS}><Shapes>${shapes.join('')}</Shapes>${connects.length ? `<Connects>${connects.join('')}</Connects>` : ''}</PageContents>`],
  ];
  if (media.length) {
    files.push(['visio/pages/_rels/page1.xml.rels', rels(media.map((m) => [`rId${m.n}`, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `../media/${m.name}`]))]);
    for (const m of media) files.push([`visio/media/${m.name}`, m.data]);
  }
  return { files, warnings: [...new Set(ctx.warnings)], stats: { shapes: ctx.nextId - 1, lines: paths.size, glued: connects.length, images: media.length } };
}
