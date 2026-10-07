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

// ---- Visio export
{
  const { buildVsdx, linePattern, toSubpaths, primitives, parseMarkup } = await import('../src/js/vsdx.js');
  const { darkColor } = await import('../src/js/render.js');
  const { createRequire } = await import('node:module');
  const { zip } = createRequire(import.meta.url)('../app/zip.js');
  const zlib = await import('node:zlib');
  const fs = await import('node:fs');
  const ta = async (name, fn) => { await fn(); n++; console.log(`ok ${name}`); };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tpl = normalize(JSON.parse(fs.readFileSync(path.join(here, '../src/templates/01-network-overview.netdraw'), 'utf8')));
  const part = (r, name) => r.files.find((f) => f[0] === name)?.[1];
  // every tag closed in order, every attribute quoted: enough to catch a broken generator
  const wellFormed = (xml) => {
    const stack = [];
    for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)((?:\s+[\w:]+=(?:'[^'<]*'|"[^"<]*"))*)\s*(\/?)>/g)) {
      if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]);
    }
    return stack.length === 0 && !/<[^>]*</.test(xml.replace(/<Text>[^<]*<\/Text>/g, ''));
  };
  const S = 0.2 / 25.4;

  await ta('vsdx: package parts, well-formed XML, unique ids and names', async () => {
    const r = await buildVsdx(tpl);
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'visio/document.xml', 'visio/_rels/document.xml.rels', 'visio/pages/pages.xml',
      'visio/pages/_rels/pages.xml.rels', 'visio/pages/page1.xml', 'visio/windows.xml', 'docProps/core.xml', 'docProps/app.xml']) assert.ok(part(r, f), f);
    for (const [name, data] of r.files) if (typeof data === 'string') assert.ok(wellFormed(data), `${name} is not well-formed`);
    const page = part(r, 'visio/pages/page1.xml');
    const ids = [...page.matchAll(/<Shape ID='(\d+)'/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, r.stats.shapes);
    const names = [...page.matchAll(/ NameU='([^']+)'/g)].map((m) => m[1]);
    assert.equal(new Set(names).size, names.length);
    for (const m of page.matchAll(/Sheet\.(\d+)!/g)) assert.ok(ids.includes(m[1]), `reference to missing shape ${m[1]}`);
    const pages = part(r, 'visio/pages/pages.xml');
    assert.ok(pages.includes(`<Cell N='PageWidth' V='${Math.round(tpl.page.width * S * 1e6) / 1e6}'/>`), 'page width in inches at the print scale');
  });

  await ta('vsdx: an icon is a group at the right place, with its label as text', async () => {
    const node = { ...makeNode('firewall', 500, 300, 'overview', { name: 'Edge <FW> & co', sub: 'two\nlines' }), id: 'n1' };
    const r = await buildVsdx({ page: { width: 1000, height: 800, background: '#ffffff', mmPerPx: 0.2 }, items: [node] });
    const page = part(r, 'visio/pages/page1.xml');
    const g = /<Shape ID='1' NameU='Icon\.1' Name='Icon\.1' Type='Group'[^>]*><Cell N='PinX' V='([\d.]+)'\/><Cell N='PinY' V='([\d.]+)'\/><Cell N='Width' V='([\d.]+)'/.exec(page);
    assert.ok(g, 'group shape');
    assert.ok(Math.abs(g[1] - 500 * S) < 1e-5 && Math.abs(g[2] - (800 - 300) * S) < 1e-5 && Math.abs(g[3] - 2 * node.r * S) < 1e-5);
    assert.ok(page.includes('<Text>Edge &lt;FW&gt; &amp; co</Text>') && page.includes('<Text>two\nlines</Text>'));
    assert.ok(page.includes("<Cell N='Font' V='Segoe UI Semibold'/>"), 'weight 600 uses the semibold face');
    assert.ok(/<Section N='Connection'>(<Row T='Connection' IX='\d'>.*?<\/Row>){4}<\/Section>/.test(page), 'four connection points');
    assert.ok(page.includes("<Row T='Ellipse' IX='1'>") && page.includes("T='EllipticalArcTo'"), 'disc and rounded rectangle');
    const p2 = part(await buildVsdx({ page: { width: 1000, height: 800, background: '#ffffff' }, items: [node] }, { font: 'IBM Plex Sans' }), 'visio/pages/page1.xml');
    assert.ok(p2.includes("<Cell N='Font' V='IBM Plex Sans SemiBold'/>"));
  });

  await ta('vsdx: lines are 1-D shapes glued to the icons, arrowheads are their own geometry', async () => {
    const a = { ...makeNode('pc', 200, 300, 'overview', { name: 'A' }), id: 'a' }, b = { ...makeNode('server', 600, 300, 'overview', { name: 'B' }), id: 'b' };
    const d = route('straight', a, a.r, b, b.r);
    const c = { type: 'connector', id: 'c', d, color: '#0284C7', width: 3.2, arrowEnd: true, arrowSize: 5.2, dash: '8 6', label: 'HTTPS', from: { id: 'a', dx: 32, dy: 0 }, to: { id: 'b', dx: -36, dy: 0 } };
    const r = await buildVsdx({ page: { width: 1000, height: 800, background: '#ffffff' }, items: [a, b, c] });
    const page = part(r, 'visio/pages/page1.xml');
    assert.deepEqual(r.stats, { shapes: r.stats.shapes, lines: 1, glued: 2, images: 0 });
    assert.ok(page.includes("<Connect FromSheet='3' FromCell='BeginX' FromPart='9' ToSheet='1' ToCell='Connections.X2' ToPart='101'/>"), 'begin glued to the east point of A');
    assert.ok(page.includes("<Connect FromSheet='3' FromCell='EndX' FromPart='12' ToSheet='2' ToCell='Connections.X5' ToPart='104'/>"), 'end glued to its own point on B');
    assert.ok(page.includes("F='PAR(PNT(Sheet.2!Connections.X5,Sheet.2!Connections.Y5))'"));
    const line = /<Shape ID='3'.*?<\/Shape>/s.exec(page)[0];
    assert.ok(line.includes("<Cell N='Angle' V='0' F='ATAN2(EndY-BeginY,EndX-BeginX)'/>") && line.includes("<Cell N='LinePattern' V='9'/>"));
    assert.ok(line.includes("<Row N='EndUX'>") && line.includes("<Section N='Geometry' IX='1'>"), 'arrowhead section driven by User cells');
    // tip of the head: 0.15 of its length past the end of the line, on the line
    const endX = Number(/<Cell N='EndX' V='([\d.]+)'/.exec(line)[1]), beginX = Number(/<Cell N='BeginX' V='([\d.]+)'/.exec(line)[1]);
    const tip = /<Section N='Geometry' IX='1'>.*?<Row T='MoveTo' IX='1'><Cell N='X' V='([\d.]+)'/s.exec(line)[1];
    assert.ok(Math.abs(Number(tip) - (endX - beginX) - 0.15 * 5.2 * 3.2 * S) < 2e-6, tip);
    assert.ok(line.includes('<Text>HTTPS</Text>') && line.includes("<Cell N='TextBkgnd' V='#ffffff'/>") && line.includes("F='-Angle'"));
  });

  await ta('vsdx: dash styles map to the nearest Visio pattern', async () => {
    assert.equal(linePattern(null, 3), 1);
    for (const f of FLOW_PRESETS.filter((x) => x.dash && x.key !== 'zpadns')) assert.equal(linePattern(f.dash.split(' ').map(Number), f.width, 'round'), 9, f.key);
    assert.equal(linePattern([2, 7], 3.5, 'round'), 23);
    assert.equal(linePattern([8, 6], 1.8, 'butt'), 2);
  });

  await ta('vsdx: fill follows SVG (a shape inside a shape stays filled, a counter-wound one is a hole)', async () => {
    const ctx = { col: (c) => (c && c !== 'none' ? c : null) };
    const same = primitives({ type: 'path', d: 'M0 0 h100 v60 h-100 z M30 15 h40 v30 h-40 z', fill: '#111111' }, ctx)[0];
    const hole = primitives({ type: 'path', d: 'M0 0 h100 v60 h-100 z M30 15 v30 h40 v-30 z', fill: '#111111' }, ctx)[0];
    assert.equal(same.subs[1].noFill, true);
    assert.ok(!hole.subs[1].noFill && !hole.subs[0].noFill);
    assert.equal(toSubpaths(parsePath('M0 0 A10 10 0 0 1 20 0 Q30 10 20 20 Z'))[0].segs.every((g) => g.c === 'L' || g.c === 'C'), true);
    assert.equal(parseMarkup('<g transform="translate(1 2)"><line x1="0" y1="0" x2="5" y2="0" stroke="#fff"/></g>').kids[0].kids[0].attrs.x2, '5');
  });

  await ta('vsdx: notes keep their lines, dark colours, pictures', async () => {
    const note = { type: 'zone', id: 'z', x: 40, y: 40, w: 340, h: 170, rx: 10, fill: '#FEFCE8', stroke: '#FDE68A', strokeWidth: 1.5, title: 'Note', titleSize: 15, titleWeight: 700, titleColor: '#854D0E',
      titleAlign: 'left', titleDx: 18, titleDy: 30, body: 'Write the explanation here. Text wraps inside the box, on several lines.', bodySize: 14, bodyColor: '#422006', bodyDy: 56, bodyLh: 20 };
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    const items = [note, { type: 'image', id: 'i', href: png, x: 500, y: 100, w: 100, h: 100 }, { type: 'image', id: 's', href: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', x: 700, y: 100, w: 40, h: 40 }];
    const r = await buildVsdx({ page: { width: 1000, height: 800, background: '#ffffff' }, items });
    const page = part(r, 'visio/pages/page1.xml');
    assert.ok(/<Text>Write the explanation[^<]*\n[^<]*lines\.<\/Text>/.test(page), 'body is one text block with line breaks');
    assert.ok(page.includes(`<Cell N='SpLine' V='${Math.round((-20 / 14) * 1e6) / 1e6}'/>`), 'line pitch of the note');
    assert.ok(page.includes("F='Sheet.1!Height*1-") && page.includes("F='Sheet.1!Width*0+"), 'title keeps its distance to the top left corner');
    assert.equal(r.stats.images, 1);
    assert.ok(part(r, 'visio/media/image1.png') instanceof Uint8Array && part(r, 'visio/pages/_rels/page1.xml.rels').includes('../media/image1.png'));
    assert.ok(/<Shape ID='2'[^>]*Type='Foreign'.*?<Cell N='Width' V='([\d.]+)'\/><Cell N='Height' V='([\d.]+)'/.exec(page).slice(1).map(Number).every((v, i) => Math.abs(v - [100, 50][i] * S) < 1e-5), 'picture keeps its 2:1 shape');
    assert.equal(r.warnings.length, 1, 'the SVG picture needs the app to draw it');
    const dark = part(await buildVsdx({ page: { width: 1000, height: 800, background: '#ffffff' }, items: [note] }, { dark: true }), 'visio/pages/page1.xml');
    assert.ok(dark.includes("NameU='Background'") && dark.includes(`V='${darkColor('#FEFCE8').toLowerCase()}'`));
  });

  await ta('vsdx: odd input still gives a valid file', async () => {
    const a = { ...makeNode('pc', 200, 300, 'overview', { name: 'bad \uFFFF char \uD800 here' }), id: 'a' };
    const items = [a, { ...makeNode('pc', 500, 300, 'overview', { name: 'zero' }), r: 0, id: 'b' },
      { type: 'connector', id: 'c1', d: 'M240 300 L460 300', color: 'none', width: 3, label: 'only a label', arrowEnd: true },
      { type: 'connector', id: 'c2', d: 'M240 340 L460 340', color: '#000000', width: 0, arrowEnd: true },
      { type: 'connector', id: 'c3', d: 'M300 400 a20 20 0 1 0 0.01 0 Z', color: '#000000', width: 2, arrowEnd: true },
      { type: 'zone', id: 'z', x: 10, y: 10, w: 0, h: 50, rx: 4, fill: '#ffffff', stroke: '#000000', strokeWidth: 1, title: 'flat' },
      { type: 'circle', id: 'k', x: 50, y: 50, r: 0, fill: '#ff0000' }, { type: 'path', id: 'p', d: 'M0 0 H50', stroke: '#000000', strokeWidth: 2, dash: '5' }];
    const r = await buildVsdx({ page: { width: 800, height: 600, background: '#ffffff' }, items });
    const page = part(r, 'visio/pages/page1.xml');
    assert.ok(wellFormed(page) && !/NaN|Infinity|undefined/.test(page) && !/[\uFFFE\uFFFF\uD800-\uDFFF]/.test(page));
    assert.ok(page.includes('<Text>only a label</Text>') && page.includes('<Text>bad  char  here</Text>'));
    assert.ok(!/Width\*(NaN|Infinity)/.test(page) && !page.includes("<Cell N='Width' V='0'/>"), 'no zero-size boxes');
    assert.ok(/NameU='Shape\.\d+'[^>]*>.*?<Cell N='LinePattern' V='(?!1')\d+'/s.test(page), 'a single dash value is dashed');
    assert.ok(part(r, 'visio/document.xml').includes("<FaceNames><FaceName NameU='Segoe UI'/>"));
  });

  await ta('vsdx: the zip holds every part intact', async () => {
    const r = await buildVsdx(tpl);
    const buf = zip(r.files);
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
    const eocd = buf.length - 22;
    assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
    assert.equal(buf.readUInt16LE(eocd + 10), r.files.length);
    let off = buf.readUInt32LE(eocd + 16);
    for (const [name, data] of r.files) {
      const nlen = buf.readUInt16LE(off + 28), method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), lho = buf.readUInt32LE(off + 42);
      assert.equal(buf.subarray(off + 46, off + 46 + nlen).toString('utf8'), name);
      const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
      const raw = buf.subarray(start, start + csize);
      const got = method === 8 ? zlib.inflateRawSync(raw) : raw;
      assert.ok(got.equals(Buffer.from(data)), name);
      off += 46 + nlen;
    }
  });
}

console.log(`\n${n} tests passed`);
