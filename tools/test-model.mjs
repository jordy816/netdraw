// Unit tests for the pure modules (no browser): node tools/test-model.mjs
import assert from 'node:assert/strict';
import {
  parsePath, serializePath, moveStart, moveEnd, reverseSegs, splitSegment, route, pathBBox,
} from '../src/js/path.js';
import { normalize, followNodes, autoAttach, newDoc, refreshAttachments } from '../src/js/model.js';
import { renderSVG } from '../src/js/render.js';
import { makeNode, FLOW_PRESETS, NODE_STYLES, describePage } from '../src/js/presets.js';
import { wrapLines, measure } from '../src/js/textmetrics.js';
import { pointAt } from '../src/js/path.js';
import { GLYPHS_A, GLYPH_CATALOG } from '../src/js/glyphs.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };
const ser = (d) => serializePath(parsePath(d));

t('parse absolute/relative/H/V', () => {
  assert.equal(ser('M10 10 h5 v5 l-5 0 z'), 'M10 10 L15 10 L15 15 L10 15 Z');
  assert.equal(ser('M0 0 C10 0 20 10 30 10 S50 20 60 20'), 'M0 0 C10 0 20 10 30 10 C40 10 50 20 60 20');
});

t('arc flags without separators', () => {
  assert.equal(ser('M10 10 a5 5 0 015 5'), 'M10 10 A5 5 0 0 1 15 15');
  assert.equal(ser('M0 0 A5 5 0 0 1 5 5 5 5 0 1 0 10 10'), 'M0 0 A5 5 0 0 1 5 5 A5 5 0 1 0 10 10');
});

t('moveStart keeps a bound far end in place', () => {
  assert.equal(serializePath(moveStart(parsePath('M32 0 L164 0'), 0, 50, true)), 'M32 50 L164 0');
  assert.equal(serializePath(moveStart(parsePath('M32 0 L164 0'), 0, 50, false)), 'M32 50 L164 50');
});

t('moveStart runs along orthogonal legs and corners', () => {
  assert.equal(serializePath(moveStart(parsePath('M0 0 H100 Q118 0 118 18 V200'), 0, 30)), 'M0 30 L100 30 Q118 30 118 48 L118 200');
});

t('moveEnd mirrors moveStart', () => {
  assert.equal(serializePath(moveEnd(parsePath('M0 0 H100 Q118 0 118 18 V200'), 40, 0)), 'M0 0 L140 0 Q158 0 158 18 L158 200');
});

t('curve keeps its tangent when the start moves', () => {
  assert.equal(serializePath(moveStart(parsePath('M0 0 C50 0 50 100 100 100'), 10, 10)), 'M10 10 C60 10 50 100 100 100');
});

t('reverse twice is identity', () => {
  const d = 'M0 0 L10 0 C20 0 30 10 40 10 Q50 10 50 20';
  assert.equal(serializePath(reverseSegs(reverseSegs(parsePath(d)))), ser(d));
});

t('split a cubic keeps the end points', () => {
  const s = splitSegment(parsePath('M0 0 C0 100 100 100 100 0'), 1);
  assert.equal(s.length, 3);
  assert.deepEqual([s[2].x, s[2].y], [100, 0]);
  assert.deepEqual([s[1].x, s[1].y], [50, 75]);
});

t('orthogonal route never doubles back', () => {
  const A = { x: 0, y: 0, r: 32 };
  for (const B of [{ x: 200, y: 30, r: 32 }, { x: 200, y: -30, r: 32 }, { x: 5, y: 100, r: 32 }, { x: 300, y: 200, r: 32 }]) {
    const segs = parsePath(route('orthogonal', A, 32, B, 32, 4));
    const last = segs[segs.length - 1], prev = segs[segs.length - 2];
    const dist = (p) => Math.hypot(p.x - B.x, p.y - B.y);
    assert.ok(dist(last) <= dist(prev) + 1e-9, `last leg heads to the target (${serializePath(segs)})`);
  }
});

t('route leaves below a label when going down', () => {
  const a = makeNode('server', 0, 0, 'overview', { name: 'DC', sub: 'line 1\nline 2' });
  const b = makeNode('server', 0, 400, 'overview', { name: 'X' });
  const segs = parsePath(route('curve', a, a.r, b, b.r, 4));
  assert.ok(segs[0].y > a.r + a.subDy, `starts under the label (${segs[0].y})`);
});

t('bbox of the MPLS cloud', () => {
  const b = pathBBox(parsePath('M-150 55 H140 A55 55 0 0 0 150 -45 A75 75 0 0 0 -20 -80 A60 60 0 0 0 -120 -35 A45 45 0 0 0 -150 55 Z'));
  assert.ok(Math.abs(b.x + 182.3) < 1 && Math.abs(b.y + 149.3) < 1 && Math.abs(b.w - 360) < 1 && Math.abs(b.h - 204.3) < 1, JSON.stringify(b));
});

t('normalize fills defaults and fixes ids', () => {
  const d = normalize({ items: [{ type: 'node', x: 1, y: 2, id: 'a' }, { type: 'text', id: 'a' }, { type: 'bogus' }] });
  assert.equal(d.items.length, 2);
  assert.notEqual(d.items[0].id, d.items[1].id);
  assert.equal(d.items[0].r, 32);
  assert.equal(d.items[1].x, 0);
});

t('followNodes moves attached ends; whole path when both move', () => {
  const doc = newDoc();
  doc.items = [
    { id: 'a', ...makeNode('pc', 0, 0) }, { id: 'b', ...makeNode('pc', 200, 0) },
    { id: 'c', type: 'connector', d: 'M32 0 C80 0 120 0 164 0', color: '#000', width: 3, arrowEnd: true, arrowSize: 5 },
  ];
  assert.equal(autoAttach(doc), 2);
  followNodes(doc, new Map([['a', { dx: 0, dy: 40 }]]), new Map());
  assert.equal(doc.items[2].d, 'M32 40 C80 40 120 0 164 0');
  followNodes(doc, new Map([['a', { dx: 10, dy: 0 }], ['b', { dx: 10, dy: 0 }]]), new Map());
  assert.equal(doc.items[2].d, 'M42 40 C90 40 130 0 174 0');
  doc.items[2].d = 'M500 500 L600 600';
  refreshAttachments(doc, doc.items[2]);
  assert.ok(!doc.items[2].from && !doc.items[2].to, 'far-away ends drop their binding');
});

t('renderer is deterministic and escapes text', () => {
  const doc = newDoc(100, 50);
  doc.items = [{ id: 't', type: 'text', x: 1, y: 2, text: 'A & B <x>', size: 10, weight: 400, color: '#000', anchor: 'start' }];
  const a = renderSVG(doc), b = renderSVG(JSON.parse(JSON.stringify(doc)));
  assert.equal(a, b);
  assert.ok(a.includes('A &amp; B &lt;x&gt;'));
});

t('text wraps within the width', () => {
  const lines = wrapLines('one two three four five six seven eight nine ten', 120, 14);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(measure(l, 14) <= 120 || !l.includes(' '), l);
  assert.deepEqual(wrapLines('a\n\nb', 100, 14), ['a', '', 'b']);
});

t('point along a path', () => {
  const p = pointAt(parsePath('M0 0 L100 0 L100 100'), 0.75);
  assert.ok(Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y - 50) < 1e-6, JSON.stringify(p));
});

t('every catalogue icon renders', () => {
  for (const [k] of GLYPH_CATALOG) {
    const s = GLYPHS_A[k](100, 100, '#fff', '#000');
    assert.ok(s.length > 20 && !/NaN|undefined/.test(s), k);
  }
});

t('page description knows paper sizes', () => {
  assert.equal(describePage({ width: 2100, height: 1485 }).exact.key, 'A3-landscape');
  assert.equal(describePage({ width: 2800, height: 1540 }).fits.key, 'A2-landscape');
});

t('optional render features leave plain items unchanged', () => {
  const doc = newDoc(200, 100);
  doc.items = [{ id: 'c', type: 'connector', d: 'M0 0 L100 0', color: '#000', width: 3, arrowEnd: true, arrowSize: 5 }];
  const plain = renderSVG(doc);
  assert.ok(!plain.includes('<text'));
  doc.items[0].label = 'IPsec';
  assert.ok(renderSVG(doc).includes('>IPsec</text>'));
});

t('Python library mirrors the app presets', () => {
  const py = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'python');
  let out = null;
  for (const exe of ['python3', 'python']) {
    try {
      out = JSON.parse(execFileSync(exe, ['-c',
        'import json, netdraw as n; print(json.dumps({"flows": n.FLOWS, "styles": n.NODE_STYLES}))'], { cwd: py }).toString());
      break;
    } catch { /* try the next interpreter */ }
  }
  if (!out) { console.log('   (skipped: no Python)'); return; }
  for (const f of FLOW_PRESETS) {
    const p = out.flows[f.key];
    assert.ok(p, `flow ${f.key} missing in netdraw.py`);
    assert.equal(p.label, f.label, f.key);
    assert.equal(p.color, f.color, f.key);
    assert.equal(p.width, f.width, f.key);
    assert.equal(p.dash || '', f.dash || '', f.key);
    assert.equal(!!p.arrow, !!f.arrowEnd, f.key);
  }
  for (const [k, st] of Object.entries(NODE_STYLES)) {
    const p = out.styles[k];
    for (const key of ['glyphSet', 'r', 'nameSize', 'nameWeight', 'nameDy', 'subSize', 'subDy', 'subLh']) assert.equal(p[key], st[key], `${k}.${key}`);
  }
});

{
  const { makeDevice, setVendor, VENDOR_DEVICES, BRANDS } = await import('../src/js/presets.js');
  const { MSICONS } = await import('../src/js/vendor.js');
  t('vendor icons render without errors', () => {
    const doc = newDoc(800, 400);
    doc.items = [
      ...Object.keys(BRANDS).map((k, i) => ({ ...makeNode(k, 50 + i * 10, 50), id: `b${i}` })),
      ...Object.keys(MSICONS).map((k, i) => ({ ...makeNode(k, 50 + i * 10, 150), id: `m${i}` })),
      ...VENDOR_DEVICES.map((d, i) => ({ ...makeDevice(d, 50 + i * 10, 250), id: `d${i}` })),
    ];
    const svg = renderSVG(doc);
    assert.ok(!/NaN|undefined/.test(svg));
    assert.ok(doc.items.find((i) => i.glyph.startsWith('ms-')).ring);
  });
  t('setVendor gives brand colour and logo badge', () => {
    const n = makeNode('firewall', 0, 0);
    assert.ok(setVendor(n, 'fortinet'));
    assert.equal(n.color, BRANDS['b-fortinet'].hex);
    assert.equal(n.badge.brand, 'b-fortinet');
    assert.ok(!setVendor(n, 'nonexistent'));
  });
}

{
  const { darkColor, darkSVG } = await import('../src/js/render.js');
  t('dark colour conversion matches the preview filter', () => {
    assert.equal(darkColor('#fff'), '#080808');
    assert.equal(darkColor('#FFFFFF'), '#080808');
    assert.equal(darkColor('none'), 'none');
    const ink = darkColor('#0F172A');
    assert.ok(parseInt(ink.slice(1, 3), 16) > 180, ink);          // dark ink becomes light
    const out = darkSVG('<rect fill="#fff" stroke="#CBD5E1"/><image href="data:image/png;base64,AAAA"/>');
    assert.ok(out.includes('fill="#080808"') && out.includes('base64,AAAA'));
  });
}

console.log(`\n${n} tests passed`);
