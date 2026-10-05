// Document -> SVG. Pure functions (no DOM), shared by the editor, the exporter, the CLI and the tests.
// The element sequence per item mirrors the generators of the original drawings, which is what makes a converted
// drawing render pixel-identical to its original.
import { glyphMarkup, brandMark } from './glyphs.js';
import { BRANDS } from './vendor.js';
import { wrapLines } from './textmetrics.js';
import { parsePath, pointAt } from './path.js';

export const FONT_FACES = [
  ['Regular', 400], ['Medium', 500], ['SemiBold', 600], ['Bold', 700],
];

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

export function text(x, y, s, size, weight, color, anchor = 'middle', italic = false, extra = '') {
  const st = italic ? ' font-style="italic"' : '';
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ` +
    `text-anchor="${anchor}"${st}${extra}>${esc(s)}</text>`;
}

const dashAttr = (d) => (d ? ` stroke-dasharray="${attr(d)}"` : '');

// ------------------------------------------------------------------------------------------------ items
function renderText(t) {
  const lines = t.wrap ? wrapLines(t.text, t.wrap, t.size, t.weight) : String(t.text ?? '').split('\n');
  const rot = t.rotate ? ` transform="rotate(${t.rotate} ${t.x} ${t.y})"` : '';
  if (lines.length === 1) {
    return text(t.x, t.y, lines[0], t.size, t.weight, t.color, t.anchor, t.italic, rot);
  }
  const lh = t.lineHeight || Math.round(t.size * 1.35 * 10) / 10;
  const st = t.italic ? ' font-style="italic"' : '';
  const spans = lines.map((ln, i) => `<tspan x="${t.x}" y="${t.y + i * lh}">${esc(ln)}</tspan>`).join('');
  return `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="${t.weight}" fill="${t.color}" ` +
    `text-anchor="${t.anchor}"${st}${rot}>${spans}</text>`;
}

function renderZone(z) {
  const stroke = z.stroke && z.stroke !== 'none'
    ? ` stroke="${z.stroke}" stroke-width="${z.strokeWidth}"${dashAttr(z.dash)}` : '';
  let s = `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${z.rx}" fill="${z.fill}"${stroke}/>`;
  if (z.title) {
    if (z.titleAlign === 'right') s += text(z.x + z.w - z.titleDx, z.y + z.titleDy, z.title, z.titleSize, z.titleWeight, z.titleColor, 'end');
    else if (z.titleAlign === 'center') s += text(z.x + z.w / 2, z.y + z.titleDy, z.title, z.titleSize, z.titleWeight, z.titleColor, 'middle');
    else s += text(z.x + z.titleDx, z.y + z.titleDy, z.title, z.titleSize, z.titleWeight, z.titleColor, 'start');
  }
  if (z.sub) {
    const sx = z.titleAlign === 'right' ? z.x + z.w - z.titleDx : z.titleAlign === 'center' ? z.x + z.w / 2 : z.x + z.titleDx;
    const an = z.titleAlign === 'right' ? 'end' : z.titleAlign === 'center' ? 'middle' : 'start';
    s += text(sx, z.y + z.subDy, z.sub, z.subSize, z.subWeight ?? 400, z.subColor, an);
  }
  if (z.body) {
    // paragraph text wrapped inside the box (notes, text boxes)
    const dx = z.bodyDx ?? z.titleDx ?? 18;
    const size = z.bodySize ?? 14, lh = z.bodyLh ?? Math.round(size * 1.45);
    const lines = wrapLines(z.body, z.w - dx * 2, size, z.bodyWeight ?? 400);
    const x = z.titleAlign === 'center' ? z.x + z.w / 2 : z.titleAlign === 'right' ? z.x + z.w - dx : z.x + dx;
    const an = z.titleAlign === 'center' ? 'middle' : z.titleAlign === 'right' ? 'end' : 'start';
    s += `<text x="${x}" y="${z.y + (z.bodyDy ?? 56)}" font-size="${size}" font-weight="${z.bodyWeight ?? 400}" fill="${z.bodyColor ?? '#0F172A'}" ` +
      `text-anchor="${an}">${lines.map((ln, i) => `<tspan x="${x}" y="${z.y + (z.bodyDy ?? 56) + i * lh}">${esc(ln)}</tspan>`).join('')}</text>`;
  }
  return s;
}

function renderNode(n) {
  const cx = n.x, cy = n.y, r = n.r;
  let s;
  if (n.inactive) {
    s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${n.color}" stroke-width="${n.inactiveWidth ?? 2.5}" ` +
      `stroke-dasharray="${n.inactiveDash ?? '6 5'}"/>`;
    s += glyphMarkup(n.glyphSet, n.glyph, cx, cy, n.color, '#fff', n.glyphScale ?? 1);
  } else {
    s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${n.color}"${n.ring ? ` stroke="${n.ring}" stroke-width="${n.ringWidth ?? 1.5}"` : ''}/>`;
    if (n.image) s += renderNodeImage(n);
    else s += glyphMarkup(n.glyphSet, n.glyph, cx, cy, n.glyphColor || '#fff', n.color, n.glyphScale ?? 1);
  }
  const b = n.badge;
  if (b && b.brand && BRANDS[b.brand]) {
    // vendor logo badge: white disc ringed in the brand colour, with the brand mark
    const hex = BRANDS[b.brand].hex, bx = cx + b.dx, by = cy + b.dy;
    s += `<circle cx="${bx}" cy="${by}" r="${b.r}" fill="#fff" stroke="${hex}" stroke-width="${b.strokeWidth}"/>`;
    s += brandMark(b.brand, bx, by, Math.round(b.r * 1.62 * 10) / 10, hex);
  } else if (b && b.text) {
    const bc = b.color || n.color;
    s += `<circle cx="${cx + b.dx}" cy="${cy + b.dy}" r="${b.r}" fill="#fff" stroke="${bc}" stroke-width="${b.strokeWidth}"/>`;
    s += text(cx + b.dx, cy + b.dy + b.textDy, b.text, b.size, b.weight ?? 700, bc);
  }
  if (n.name) s += text(cx, cy + r + n.nameDy, n.name, n.nameSize, n.nameWeight, n.nameColor);
  if (n.sub) {
    String(n.sub).split('\n').forEach((line, i) => {
      s += text(cx, cy + r + n.subDy + i * n.subLh, line, n.subSize, n.subWeight ?? 400, n.subColor);
    });
  }
  return s;
}

function renderNodeImage(n) {
  const k = n.imageScale ?? 0.62;
  const w = n.r * 2 * k;
  return `<image href="${attr(n.image)}" x="${n.x - w / 2}" y="${n.y - w / 2}" width="${w}" height="${w}" ` +
    `preserveAspectRatio="xMidYMid meet"/>`;
}

export function markerId(color, size, start = false) {
  return `ah${start ? 's' : ''}-${String(color).replace(/[^0-9a-zA-Z]/g, '')}-${String(size).replace('.', '_')}`;
}

function renderConnector(c) {
  const mk = (c.arrowEnd ? ` marker-end="url(#${markerId(c.color, c.arrowSize)})"` : '') +
    (c.arrowStart ? ` marker-start="url(#${markerId(c.color, c.arrowSize, true)})"` : '');
  let s = `<path d="${attr(c.d)}" fill="none" stroke="${c.color}" stroke-width="${c.width}"${dashAttr(c.dash)} ` +
    `stroke-linecap="${c.linecap || 'round'}" stroke-linejoin="${c.linejoin || 'round'}"${mk}/>`;
  if (c.label) {
    const p = pointAt(parsePath(c.d), c.labelPos ?? 0.5);
    const size = c.labelSize ?? 12.5;
    s += `<text x="${round2(p.x)}" y="${round2(p.y + size * 0.35)}" font-size="${size}" font-weight="${c.labelWeight ?? 600}" ` +
      `fill="${c.labelColor || c.color}" text-anchor="middle" stroke="${c.labelBg || '#fff'}" stroke-width="5" ` +
      `stroke-linejoin="round" paint-order="stroke">${esc(c.label)}</text>`;
  }
  return s;
}

const round2 = (v) => Math.round(v * 100) / 100;

function renderBadge(b) {
  const st = b.stroke && b.stroke !== 'none' ? ` stroke="${b.stroke}" stroke-width="${b.strokeWidth}"` : '';
  return `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${b.fill}"${st}/>` +
    text(b.x, b.y + b.textDy, b.text, b.size, b.weight ?? 700, b.textColor);
}

function renderPath(p) {
  const st = p.stroke && p.stroke !== 'none' ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidth}"${dashAttr(p.dash)}` : '';
  return `<path d="${attr(p.d)}" fill="${p.fill || 'none'}"${st}/>`;
}

function renderCircle(c) {
  const st = c.stroke && c.stroke !== 'none' ? ` stroke="${c.stroke}" stroke-width="${c.strokeWidth}"${dashAttr(c.dash)}` : '';
  if (c.ry != null && c.ry !== c.r) return `<ellipse cx="${c.x}" cy="${c.y}" rx="${c.r}" ry="${c.ry}" fill="${c.fill}"${st}/>`;
  return `<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="${c.fill}"${st}/>`;
}

function renderImage(im) {
  return `<image href="${attr(im.href)}" x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" ` +
    `preserveAspectRatio="${im.keepAspect === false ? 'none' : 'xMidYMid meet'}"${im.opacity != null && im.opacity !== 1 ? ` opacity="${im.opacity}"` : ''}/>`;
}

const RENDERERS = {
  text: renderText, zone: renderZone, node: renderNode, connector: renderConnector, badge: renderBadge,
  path: renderPath, circle: renderCircle, image: renderImage,
};

export function renderItem(it) {
  const fn = RENDERERS[it.type];
  return fn ? fn(it) : '';
}

// ------------------------------------------------------------------------------------------------ document
export function markerDefs(doc) {
  const seen = new Map();
  for (const it of doc.items) {
    if (it.type !== 'connector') continue;
    if (it.arrowEnd) seen.set(markerId(it.color, it.arrowSize), [it.color, it.arrowSize, false]);
    if (it.arrowStart) seen.set(markerId(it.color, it.arrowSize, true), [it.color, it.arrowSize, true]);
  }
  return [...seen.entries()].map(([id, [color, size, start]]) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${size}" markerHeight="${size}" ` +
    `orient="${start ? 'auto-start-reverse' : 'auto'}"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`).join('');
}

export function fontFaceCSS(urlFor) {
  return FONT_FACES.map(([n, w]) =>
    `@font-face{font-family:'IBM Plex Sans';src:url('${urlFor(n)}');font-weight:${w}}`).join('');
}

// opts.wrap: wrap every item in <g data-id> (editor); opts.hit: add fat invisible hit paths for connectors;
// opts.style: CSS to embed in the SVG (e.g. base64 fonts for a portable export).
export function renderSVG(doc, opts = {}) {
  const { width: W, height: H, background, fontFamily } = doc.page;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `font-family="${attr(fontFamily)}">`);
  if (opts.style) out.push(`<style>${opts.style}</style>`);
  out.push(`<defs>${markerDefs(doc)}</defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${background}"/>`);
  for (const it of doc.items) {
    if (it.hidden) continue;
    const body = renderItem(it);
    if (opts.wrap) {
      const hit = opts.hit && it.type === 'connector'
        ? `<path class="hit" d="${attr(it.d)}" fill="none" stroke="transparent" stroke-width="${Math.max(14, it.width + 10)}"/>` : '';
      out.push(`<g data-id="${it.id}">${body}${hit}</g>`);
    } else out.push(body);
  }
  out.push('</svg>');
  return out.join('\n');
}

// ------------------------------------------------------------------------------------------------ dark export
// The same colour conversion as the dark preview on screen (CSS: invert(1) hue-rotate(180deg) brightness(.92)
// contrast(.94), computed in sRGB), applied to the colours in the SVG itself. The result stays vector, so dark
// PNG, PDF and SVG exports all match what the editor shows. Embedded images keep their own colours.
const clamp01 = (v) => Math.min(1, Math.max(0, v));
export function darkColor(hex) {
  let h = String(hex).trim().toLowerCase();
  if (h === 'white') h = '#ffffff';
  if (h === 'black') h = '#000000';
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${[...h.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-f]{6}$/.test(h)) return hex;
  let [r, g, b] = [1, 3, 5].map((i) => 1 - parseInt(h.slice(i, i + 2), 16) / 255);                        // invert(1)
  [r, g, b] = [-0.574 * r + 1.43 * g + 0.144 * b, 0.426 * r + 0.43 * g + 0.144 * b, 0.426 * r + 1.43 * g - 0.856 * b].map(clamp01);   // hue-rotate(180deg)
  [r, g, b] = [r, g, b].map((v) => clamp01(v * 0.92)).map((v) => clamp01((v - 0.5) * 0.94 + 0.5));        // brightness, contrast
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function darkSVG(svg) {
  return svg.replace(/\b(fill|stroke|stop-color)="(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|white|black)"/g, (_m, a, c) => `${a}="${darkColor(c)}"`);
}

export function renderItemWrapped(it, hit = true) {
  const h = hit && it.type === 'connector'
    ? `<path class="hit" d="${attr(it.d)}" fill="none" stroke="transparent" stroke-width="${Math.max(14, it.width + 10)}"/>` : '';
  return renderItem(it) + h;
}
