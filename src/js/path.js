// SVG path helpers: parse to absolute segments, serialise, transform, bounding box, endpoint editing.
// Segment shapes: {c:'M'|'L', x, y} · {c:'C', x1, y1, x2, y2, x, y} · {c:'Q', x1, y1, x, y}
//                 {c:'A', rx, ry, rot, large, sweep, x, y} · {c:'Z'}

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function parsePath(d) {
  const segs = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m, cx = 0, cy = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const n = (m[2].match(NUM) || []).map(Number);
    let arcs = null;
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' ? 1 : 0;
    const C = cmd.toUpperCase();
    let i = 0;
    const take = (k) => { const v = n.slice(i, i + k); i += k; return v; };
    do {
      if (C === 'Z') { segs.push({ c: 'Z' }); cx = sx; cy = sy; lastC = lastQ = null; break; }
      if (C === 'M') {
        const [x, y] = take(2);
        cx = rel ? cx + x : x; cy = rel ? cy + y : y; sx = cx; sy = cy;
        segs.push({ c: segs.length && i > 2 ? 'L' : 'M', x: cx, y: cy });
        lastC = lastQ = null;
      } else if (C === 'L') {
        const [x, y] = take(2); cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        segs.push({ c: 'L', x: cx, y: cy }); lastC = lastQ = null;
      } else if (C === 'H') {
        const [x] = take(1); cx = rel ? cx + x : x; segs.push({ c: 'L', x: cx, y: cy }); lastC = lastQ = null;
      } else if (C === 'V') {
        const [y] = take(1); cy = rel ? cy + y : y; segs.push({ c: 'L', x: cx, y: cy }); lastC = lastQ = null;
      } else if (C === 'C' || C === 'S') {
        let x1, y1, x2, y2, x, y;
        if (C === 'C') {
          [x1, y1, x2, y2, x, y] = take(6);
          if (rel) { x1 += cx; y1 += cy; }
        } else {
          [x2, y2, x, y] = take(4);
          x1 = lastC ? 2 * cx - lastC[0] : cx; y1 = lastC ? 2 * cy - lastC[1] : cy;
        }
        if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
        segs.push({ c: 'C', x1, y1, x2, y2, x, y }); cx = x; cy = y; lastC = [x2, y2]; lastQ = null;
      } else if (C === 'Q' || C === 'T') {
        let x1, y1, x, y;
        if (C === 'Q') { [x1, y1, x, y] = take(4); if (rel) { x1 += cx; y1 += cy; } }
        else { [x, y] = take(2); x1 = lastQ ? 2 * cx - lastQ[0] : cx; y1 = lastQ ? 2 * cy - lastQ[1] : cy; }
        if (rel) { x += cx; y += cy; }
        segs.push({ c: 'Q', x1, y1, x, y }); cx = x; cy = y; lastQ = [x1, y1]; lastC = null;
      } else if (C === 'A') {
        if (!arcs) { arcs = arcArgs(m[2]); i = 0; }
        if (arcs.length - i < 7) break;
        const [rx, ry, rot, large, sweep, x0, y0] = arcs.slice(i, i + 7); i += 7;
        const x = rel ? cx + x0 : x0, y = rel ? cy + y0 : y0;
        segs.push({ c: 'A', rx, ry, rot, large, sweep, x, y }); cx = x; cy = y; lastC = lastQ = null;
      }
    } while (i < (arcs ? arcs.length : n.length));
  }
  return segs;
}

// Arc arguments: flags are single 0/1 characters and may be written without separators ("0 015 5").
function arcArgs(str) {
  const out = [];
  let k = 0;
  const skip = () => { while (k < str.length && /[\s,]/.test(str[k])) k++; };
  const num = () => { skip(); const r = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(str.slice(k)); if (!r) return null; k += r[0].length; return Number(r[0]); };
  const flag = () => { skip(); const c = str[k]; if (c !== '0' && c !== '1') return null; k++; return Number(c); };
  for (;;) {
    const rx = num(); if (rx == null) break;
    const v = [rx, num(), num(), flag(), flag(), num(), num()];
    if (v.some((x) => x == null)) break;
    out.push(...v);
  }
  return out;
}

export const fmt = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function serializePath(segs) {
  return segs.map((s) => {
    switch (s.c) {
      case 'M': case 'L': return `${s.c}${fmt(s.x)} ${fmt(s.y)}`;
      case 'C': return `C${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)}`;
      case 'Q': return `Q${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x)} ${fmt(s.y)}`;
      case 'A': return `A${fmt(s.rx)} ${fmt(s.ry)} ${fmt(s.rot)} ${s.large} ${s.sweep} ${fmt(s.x)} ${fmt(s.y)}`;
      default: return 'Z';
    }
  }).join(' ');
}

export function translateSegs(segs, dx, dy) {
  for (const s of segs) {
    if ('x' in s) { s.x += dx; s.y += dy; }
    if ('x1' in s) { s.x1 += dx; s.y1 += dy; }
    if ('x2' in s) { s.x2 += dx; s.y2 += dy; }
  }
  return segs;
}

export function translatePathD(d, dx, dy) {
  if (!dx && !dy) return d;
  return serializePath(translateSegs(parsePath(d), dx, dy));
}

export function scaleSegs(segs, ox, oy, sx, sy) {
  const X = (v) => ox + (v - ox) * sx, Y = (v) => oy + (v - oy) * sy;
  for (const s of segs) {
    if ('x' in s) { s.x = X(s.x); s.y = Y(s.y); }
    if ('x1' in s) { s.x1 = X(s.x1); s.y1 = Y(s.y1); }
    if ('x2' in s) { s.x2 = X(s.x2); s.y2 = Y(s.y2); }
    if (s.c === 'A') {
      s.rx *= Math.abs(sx); s.ry *= Math.abs(sy);
      if (sx * sy < 0) s.sweep = s.sweep ? 0 : 1;
    }
  }
  return segs;
}

// ---- sampling (for bounding boxes and hit tests)
function arcCenter(x1, y1, s) {
  // SVG spec F.6.5 endpoint -> centre parameterisation
  let { rx, ry } = s;
  const phi = (s.rot * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - s.x) / 2, dy = (y1 - s.y) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (s.large === s.sweep) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + s.x) / 2, cy = sin * cxp + cos * cyp + (y1 + s.y) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!s.sweep && dt > 0) dt -= 2 * Math.PI;
  if (s.sweep && dt < 0) dt += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, t1, dt };
}

export function samplePath(segs, per = 16) {
  const pts = [];
  let px = 0, py = 0, sx = 0, sy = 0;
  for (const s of segs) {
    if (s.c === 'M') { px = sx = s.x; py = sy = s.y; pts.push([px, py]); continue; }
    if (s.c === 'Z') { pts.push([sx, sy]); px = sx; py = sy; continue; }
    if (s.c === 'L') pts.push([s.x, s.y]);
    else if (s.c === 'C') {
      for (let i = 1; i <= per; i++) {
        const t = i / per, u = 1 - t;
        pts.push([u * u * u * px + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x,
          u * u * u * py + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y]);
      }
    } else if (s.c === 'Q') {
      for (let i = 1; i <= per; i++) {
        const t = i / per, u = 1 - t;
        pts.push([u * u * px + 2 * u * t * s.x1 + t * t * s.x, u * u * py + 2 * u * t * s.y1 + t * t * s.y]);
      }
    } else if (s.c === 'A') {
      if (!s.rx || !s.ry) pts.push([s.x, s.y]);
      else {
        const a = arcCenter(px, py, s);
        for (let i = 1; i <= per; i++) {
          const t = a.t1 + (a.dt * i) / per;
          const ex = a.rx * Math.cos(t), ey = a.ry * Math.sin(t);
          pts.push([a.cx + Math.cos(a.phi) * ex - Math.sin(a.phi) * ey, a.cy + Math.sin(a.phi) * ex + Math.cos(a.phi) * ey]);
        }
      }
    }
    px = s.x; py = s.y;
  }
  return pts;
}

// Point at fraction t (0..1) of the path length.
export function pointAt(segs, t) {
  const pts = samplePath(segs, 24);
  if (pts.length < 2) return { x: pts[0]?.[0] ?? 0, y: pts[0]?.[1] ?? 0 };
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = Math.max(0, Math.min(1, t)) * len[len.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (len[i] >= target) {
      const f = (target - len[i - 1]) / ((len[i] - len[i - 1]) || 1);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f };
    }
  }
  const l = pts[pts.length - 1];
  return { x: l[0], y: l[1] };
}

// Fraction (0..1) of the path length closest to a point.
export function nearestT(segs, x, y) {
  const pts = samplePath(segs, 24);
  let total = 0, best = 0, bd = Infinity;
  const len = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(total); }
  pts.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = len[i]; } });
  return total ? best / total : 0.5;
}

export function pathBBox(segs) {
  const pts = samplePath(segs);
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function startPoint(segs) { return segs.length ? { x: segs[0].x, y: segs[0].y } : { x: 0, y: 0 }; }
export function endPoint(segs) {
  for (let i = segs.length - 1; i >= 0; i--) if ('x' in segs[i]) return { x: segs[i].x, y: segs[i].y };
  return { x: 0, y: 0 };
}

const EPS = 0.01;

// Move the first point of a path by (dx, dy) and let the change run along axis-aligned legs, so an orthogonal
// route stays orthogonal and a curve keeps its departure tangent.
// pinEnd: the far end is bound to something and must not move (a single straight leg then simply tilts).
export function moveStart(segs, dx, dy, pinEnd = true) {
  if (!segs.length) return segs;
  let cx = dx, cy = dy;
  let prev = { x: segs[0].x, y: segs[0].y };
  segs[0].x += dx; segs[0].y += dy;
  const last = segs.length - 1;
  for (let i = 1; i < segs.length && (cx || cy); i++) {
    const s = segs[i];
    const old = { x: s.x, y: s.y };
    if (pinEnd && i === last && s.c !== 'C') break;
    if (s.c === 'L') {
      if (Math.abs(old.y - prev.y) < EPS && Math.abs(old.x - prev.x) >= EPS) { s.y += cy; cx = 0; }
      else if (Math.abs(old.x - prev.x) < EPS && Math.abs(old.y - prev.y) >= EPS) { s.x += cx; cy = 0; }
      else break;
    } else if (s.c === 'Q') {
      const corner = (Math.abs(s.x1 - prev.x) < EPS || Math.abs(s.y1 - prev.y) < EPS) &&
        (Math.abs(s.x1 - s.x) < EPS || Math.abs(s.y1 - s.y) < EPS);
      if (!corner) { s.x1 += cx / 2; s.y1 += cy / 2; break; }
      s.x1 += cx; s.y1 += cy; s.x += cx; s.y += cy;
    } else if (s.c === 'C') { s.x1 += cx; s.y1 += cy; break; }
    else break;
    prev = old;
  }
  return segs;
}

export function moveEnd(segs, dx, dy, pinStart = true) {
  const rev = reverseSegs(segs);
  moveStart(rev, dx, dy, pinStart);
  const back = reverseSegs(rev);
  segs.length = 0; segs.push(...back);
  return segs;
}

// Reverse a path made of M/L/C/Q/A segments (no Z inside).
export function reverseSegs(segs) {
  const pts = [];
  for (const s of segs) if ('x' in s) pts.push(s);
  if (!pts.length) return [];
  const out = [{ c: 'M', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }];
  for (let i = segs.length - 1; i >= 1; i--) {
    const s = segs[i];
    const p = segs[i - 1];
    if (s.c === 'L' || s.c === 'M') out.push({ c: 'L', x: p.x, y: p.y });
    else if (s.c === 'C') out.push({ c: 'C', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: p.x, y: p.y });
    else if (s.c === 'Q') out.push({ c: 'Q', x1: s.x1, y1: s.y1, x: p.x, y: p.y });
    else if (s.c === 'A') out.push({ c: 'A', rx: s.rx, ry: s.ry, rot: s.rot, large: s.large, sweep: s.sweep ? 0 : 1, x: p.x, y: p.y });
  }
  return out;
}

// Split segment i (1-based index into segs) at t = 0.5, inserting a new anchor.
export function splitSegment(segs, i) {
  const s = segs[i], p = segs[i - 1];
  if (!s || !p) return segs;
  if (s.c === 'L') segs.splice(i, 0, { c: 'L', x: (p.x + s.x) / 2, y: (p.y + s.y) / 2 });
  else if (s.c === 'C') {
    const m = (a, b) => (a + b) / 2;
    const ax = m(p.x, s.x1), ay = m(p.y, s.y1), bx = m(s.x1, s.x2), by = m(s.y1, s.y2), cx = m(s.x2, s.x), cy = m(s.y2, s.y);
    const dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy), fx = m(dx, ex), fy = m(dy, ey);
    segs.splice(i, 1, { c: 'C', x1: ax, y1: ay, x2: dx, y2: dy, x: fx, y: fy }, { c: 'C', x1: ex, y1: ey, x2: cx, y2: cy, x: s.x, y: s.y });
  } else if (s.c === 'Q') {
    const ax = (p.x + s.x1) / 2, ay = (p.y + s.y1) / 2, bx = (s.x1 + s.x) / 2, by = (s.y1 + s.y) / 2;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    segs.splice(i, 1, { c: 'Q', x1: ax, y1: ay, x: mx, y: my }, { c: 'Q', x1: bx, y1: by, x: s.x, y: s.y });
  }
  return segs;
}

// Index of the segment closest to point (x, y), for "add point here".
export function nearestSegment(segs, x, y) {
  let best = -1, bd = Infinity;
  for (let i = 1; i < segs.length; i++) {
    if (!('x' in segs[i])) continue;
    const pts = samplePath([{ c: 'M', x: segs[i - 1].x, y: segs[i - 1].y }, segs[i]], 24);
    for (const [px, py] of pts) {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

// Distance from a node's centre to just below its label: vertical routes leave and enter there, so lines do
// not cross the label text.
export function labelBelow(n) {
  if (!n || n.type !== 'node') return n?.r || 0;
  const lines = n.sub ? String(n.sub).split('\n').length : 0;
  if (!n.name && !lines) return n.r;
  const base = lines ? n.subDy + (lines - 1) * n.subLh + n.subSize * 0.3 : n.nameDy + n.nameSize * 0.3;
  return n.r + base + 8;
}

// ---- routing for new connectors between two discs
export function route(style, a, ra, b, rb, gapEnd = 4) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  // leaving downwards / arriving from below happens under the label
  const aDown = a.type === 'node' ? labelBelow(a) : ra, bDown = b.type === 'node' ? labelBelow(b) : rb;
  if (style === 'straight') {
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const steep = Math.abs(uy) > 0.8;
    const s0 = steep && uy > 0 ? aDown / uy : ra, s1 = steep && uy < 0 ? -bDown / uy : rb;
    return `M${fmt(a.x + ux * s0)} ${fmt(a.y + uy * s0)} L${fmt(b.x - ux * (s1 + gapEnd))} ${fmt(b.y - uy * (s1 + gapEnd))}`;
  }
  if (style === 'orthogonal') {
    const R = 18;
    const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
    if (horiz) {
      const x0 = a.x + sx * ra, x1 = b.x - sx * (rb + gapEnd);
      if (Math.abs(dy) < 2) return `M${fmt(x0)} ${fmt(a.y)} H${fmt(x1)}`;
      const y1 = sy > 0 ? b.y - (rb + gapEnd) : b.y + bDown + gapEnd;
      if ((y1 - a.y) * sy > R) {
        // one corner: along, then into the target from above/below
        return `M${fmt(x0)} ${fmt(a.y)} H${fmt(b.x - sx * R)} Q${fmt(b.x)} ${fmt(a.y)} ${fmt(b.x)} ${fmt(a.y + sy * R)} V${fmt(y1)}`;
      }
      // small offset: step across halfway (two corners)
      const mx = (x0 + x1) / 2, r = Math.min(R, Math.abs(dy) / 2, Math.abs(x1 - x0) / 4);
      return `M${fmt(x0)} ${fmt(a.y)} H${fmt(mx - sx * r)} Q${fmt(mx)} ${fmt(a.y)} ${fmt(mx)} ${fmt(a.y + sy * r)} ` +
        `V${fmt(b.y - sy * r)} Q${fmt(mx)} ${fmt(b.y)} ${fmt(mx + sx * r)} ${fmt(b.y)} H${fmt(x1)}`;
    }
    const y0 = sy > 0 ? a.y + aDown : a.y - ra;
    const y1 = sy > 0 ? b.y - (rb + gapEnd) : b.y + bDown + gapEnd;
    if (Math.abs(dx) < 2) return `M${fmt(a.x)} ${fmt(y0)} V${fmt(y1)}`;
    const x1 = b.x - sx * (rb + gapEnd);
    if ((x1 - a.x) * sx > R) {
      return `M${fmt(a.x)} ${fmt(y0)} V${fmt(b.y - sy * R)} Q${fmt(a.x)} ${fmt(b.y)} ${fmt(a.x + sx * R)} ${fmt(b.y)} H${fmt(x1)}`;
    }
    const my = (y0 + y1) / 2, r = Math.min(R, Math.abs(dx) / 2, Math.abs(y1 - y0) / 4);
    return `M${fmt(a.x)} ${fmt(y0)} V${fmt(my - sy * r)} Q${fmt(a.x)} ${fmt(my)} ${fmt(a.x + sx * r)} ${fmt(my)} ` +
      `H${fmt(b.x - sx * r)} Q${fmt(b.x)} ${fmt(my)} ${fmt(b.x)} ${fmt(my + sy * r)} V${fmt(y1)}`;
  }
  // curve: cubic with axis-aligned tangents, as in the original drawings
  if (horiz) {
    const sx = Math.sign(dx) || 1;
    const x0 = a.x + sx * ra, x1 = b.x - sx * (rb + gapEnd);
    const k = Math.max(40, Math.abs(x1 - x0) * 0.45);
    return `M${fmt(x0)} ${fmt(a.y)} C${fmt(x0 + sx * k)} ${fmt(a.y)} ${fmt(x1 - sx * k)} ${fmt(b.y)} ${fmt(x1)} ${fmt(b.y)}`;
  }
  const sy = Math.sign(dy) || 1;
  const y0 = sy > 0 ? a.y + aDown : a.y - ra, y1 = sy > 0 ? b.y - (rb + gapEnd) : b.y + bDown + gapEnd;
  const k = Math.max(40, Math.abs(y1 - y0) * 0.45);
  return `M${fmt(a.x)} ${fmt(y0)} C${fmt(a.x)} ${fmt(y0 + sy * k)} ${fmt(b.x)} ${fmt(y1 - sy * k)} ${fmt(b.x)} ${fmt(y1)}`;
}

// Route from a disc to a free point (used while dragging a new connector).
export function routeToPoint(style, a, ra, p) {
  return route(style, a, ra, p, 0, 0);
}
