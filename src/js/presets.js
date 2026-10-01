// Visual vocabulary of NetDraw: palette, node styles, containers, line styles, annotations and paper sizes.
// The core presets reproduce the exact numbers of the reference drawings the house style came from; do not tweak
// them, or new drawings stop matching the existing ones.

export const PALETTE = {
  client: '#2563EB', dc: '#16A34A', wan: '#0F766E', bc: '#7C3AED', ztb: '#4F46E5', zia: '#0284C7',
  zpa: '#D97706', appc: '#EA580C', azure: '#0078D4', inet: '#64748B', sap: '#0891B2', fw: '#B91C1C',
  warn: '#DC2626', ink: '#0F172A', muted: '#475569', line: '#CBD5E1', lan: '#94A3B8',
};

export const SWATCHES = [
  '#2563EB', '#0078D4', '#0284C7', '#0891B2', '#0F766E', '#16A34A', '#4F46E5', '#7C3AED',
  '#D97706', '#EA580C', '#B91C1C', '#DC2626', '#64748B', '#94A3B8', '#475569', '#0F172A',
  '#CBD5E1', '#E2E8F0', '#BAE6FD', '#BFDBFE', '#F8FAFC', '#F0F9FF', '#EFF6FF', '#F0FDFA', '#FFFFFF',
];

// Default disc colour per glyph.
export const GLYPH_COLOR = {
  pc: 'client', laptop: 'client', user: 'client', users: 'client', phone: 'client', tablet: 'client', display: 'client',
  headset: 'client', server: 'dc', vm: 'azure', container: 'azure', sap: 'sap', db: 'sap', router: 'wan', switch: 'wan',
  firewall: 'fw', gateway: 'wan', lb: 'wan', modem: 'wan', sdwan: 'wan', wlc: 'sap', ap: 'sap', antenna: 'sap',
  satellite: 'inet', isp: 'zia', vpn: 'wan', proxy: 'zia', globe: 'inet', dns: 'inet', dhcp: 'inet', ntp: 'inet',
  cloud: 'zia', mail: 'client', chat: 'client', video: 'client', zia: 'zia', zpa: 'zpa', bc: 'bc', ztb: 'ztb',
  appc: 'appc', gear: 'ztb', shield: 'zia', lock: 'zpa', key: 'zpa', cert: 'ztb', idcard: 'ztb', mfa: 'ztb', eye: 'fw',
  waf: 'fw', bug: 'warn', siem: 'ztb', k8s: 'azure', fn: 'azure', webapp: 'azure', api: 'azure', app: 'azure',
  rack: 'dc', storage: 'sap', backup: 'dc', bucket: 'sap', queue: 'azure', chart: 'azure', building: 'inet',
  home: 'client', store: 'inet', factory: 'inet', datacenter: 'dc', printer: 'inet', ipphone: 'inet', camera: 'inet',
  iot: 'sap', plc: 'inet', alert: 'warn', info: 'client', check: 'dc', cross: 'warn', question: 'inet', clock: 'inet',
  pin: 'warn', link: 'inet', sync: 'azure', power: 'inet', star: 'zpa', search: 'inet', folder: 'zpa', doc: 'inet',
  nodc: 'line',
};

export const NODE_STYLES = {
  overview: {
    label: 'Overview', glyphSet: 'A', r: 32, nameSize: 14, nameWeight: 600, nameDy: 20, subSize: 12, subDy: 37,
    subLh: 15, badge: { r: 12, strokeWidth: 2.3, size: 10, textDy: 4, k: [0.78, -0.72] },
  },
  flow: {
    label: 'Flow', glyphSet: 'B', r: 34, nameSize: 15, nameWeight: 600, nameDy: 22, subSize: 12.5, subDy: 40,
    subLh: 16, badge: { r: 13, strokeWidth: 2.5, size: 11, textDy: 4.5, d: [26, -24] },
  },
  document: {
    label: 'Document', glyphSet: 'A', r: 36, nameSize: 20, nameWeight: 600, nameDy: 26, subSize: 17, subDy: 50,
    subLh: 21, badge: { r: 13, strokeWidth: 2.5, size: 11, textDy: 4.5, k: [0.78, -0.72] },
  },
};

export function nodeStyleOf(n) {
  if (n.glyphSet === 'B') return 'flow';
  if (n.nameSize >= 18) return 'document';
  return 'overview';
}

export function makeBadge(styleKey, r, txt = 'AD') {
  const b = NODE_STYLES[styleKey].badge;
  const [dx, dy] = b.k ? [r * b.k[0], r * b.k[1]] : b.d;
  return { text: txt, dx, dy, r: b.r, strokeWidth: b.strokeWidth, size: b.size, textDy: b.textDy };
}

export function makeNode(glyph, x, y, styleKey = 'overview', over = {}) {
  const st = NODE_STYLES[styleKey];
  const color = over.color || PALETTE[GLYPH_COLOR[glyph] || 'client'];
  const n = {
    type: 'node', x, y, r: st.r, color, glyph, glyphSet: st.glyphSet, name: '', nameSize: st.nameSize,
    nameWeight: st.nameWeight, nameColor: PALETTE.ink, nameDy: st.nameDy, sub: '', subSize: st.subSize,
    subColor: PALETTE.muted, subDy: st.subDy, subLh: st.subLh, ...over,
  };
  if (glyph === 'nodc') { n.inactive = true; n.color = PALETTE.line; n.nameColor = PALETTE.muted; }
  return n;
}

// ------------------------------------------------------------------------------------------------ containers
const ZONE_BASE = {
  type: 'zone', rx: 16, strokeWidth: 1.6, titleSize: 15, titleWeight: 700, titleColor: PALETTE.muted,
  titleAlign: 'left', titleDx: 18, titleDy: 28, sub: '', subSize: 12.5, subColor: PALETTE.muted, subDy: 48,
};

export const ZONE_PRESETS = [
  { key: 'site', label: 'Site', w: 710, h: 390, z: { fill: '#F8FAFC', stroke: '#CBD5E1', title: 'SITE NAME', sub: 'Short description' } },
  { key: 'zscaler', label: 'Cloud service', w: 580, h: 580, z: { fill: '#F0F9FF', stroke: '#BAE6FD', title: 'CLOUD SERVICE', titleAlign: 'right' } },
  { key: 'azure', label: 'Cloud hub', w: 1330, h: 850, z: { fill: '#EFF6FF', stroke: '#BFDBFE', title: 'CLOUD HUB', sub: 'Region' } },
  { key: 'dc', label: 'Data centre', w: 1330, h: 440, z: { fill: '#F8FAFC', stroke: '#CBD5E1', title: 'DATA CENTRE', sub: 'Hosting' } },
  { key: 'internet', label: 'Internet', w: 580, h: 210, z: { fill: '#F8FAFC', stroke: '#CBD5E1', title: 'INTERNET', titleAlign: 'right' } },
  {
    key: 'band', label: 'Section band', w: 1760, h: 540,
    z: { fill: '#FFFFFF', stroke: '#E2E8F0', strokeWidth: 2, rx: 18, title: 'Section title', titleSize: 21, titleWeight: 700, titleColor: PALETTE.ink, titleDx: 24, titleDy: 38, sub: 'One-line explanation', subSize: 14, subDy: 62 },
  },
  {
    key: 'column', label: 'Flow column', w: 330, h: 330,
    z: { fill: '#F0F9FF', stroke: '#CBD5E1', strokeWidth: 1.5, rx: 14, title: 'COLUMN', titleWeight: 600, subDy: 47 },
  },
  { key: 'card', label: 'Card', w: 640, h: 76, z: { fill: '#F8FAFC', stroke: '#CBD5E1', strokeWidth: 1.8, rx: 12, title: '' } },
  { key: 'dashed', label: 'Dashed box', w: 400, h: 240, z: { fill: '#FFFFFF', stroke: '#94A3B8', strokeWidth: 1.8, rx: 12, dash: '8 6', title: 'PLANNED' } },
  { key: 'dmz', label: 'DMZ', w: 500, h: 300, z: { fill: '#FEF2F2', stroke: '#FECACA', title: 'DMZ', titleColor: '#B91C1C' } },
  { key: 'trusted', label: 'Trusted zone', w: 500, h: 300, z: { fill: '#F0FDF4', stroke: '#BBF7D0', title: 'TRUSTED ZONE', titleColor: '#15803D' } },
  { key: 'mgmt', label: 'Management', w: 500, h: 300, z: { fill: '#F5F3FF', stroke: '#DDD6FE', title: 'MANAGEMENT', titleColor: '#6D28D9' } },
  {
    key: 'note', label: 'Note', w: 340, h: 170,
    z: { fill: '#FEFCE8', stroke: '#FDE68A', strokeWidth: 1.5, rx: 10, title: 'Note', titleSize: 15, titleWeight: 700, titleColor: '#854D0E', titleDy: 30, body: 'Write the explanation here. Text wraps inside the box.', bodySize: 14, bodyColor: '#422006', bodyDy: 56, bodyLh: 20 },
  },
  {
    key: 'textbox', label: 'Text box', w: 360, h: 140,
    z: { fill: '#FFFFFF', stroke: '#CBD5E1', strokeWidth: 1.5, rx: 10, title: '', body: 'Paragraph text that wraps inside the box.', bodySize: 14, bodyColor: '#0F172A', bodyDy: 30, bodyLh: 20 },
  },
  { key: 'pill', label: 'Pill', w: 180, h: 36, z: { fill: '#0284C7', stroke: 'none', rx: 18, title: 'Label', titleAlign: 'center', titleSize: 17, titleWeight: 600, titleColor: '#fff', titleDy: 24 } },
];

export function makeZone(preset, x, y) {
  return { ...ZONE_BASE, x, y, w: preset.w, h: preset.h, ...preset.z };
}

// ------------------------------------------------------------------------------------------------ flows
// Keys are stable (files and the Python library refer to them); labels are generic so the styles fit any
// architecture, not one vendor.
export const FLOW_PRESETS = [
  { key: 'wan', label: 'WAN / private line', color: '#0F766E', width: 3.2, arrowEnd: false },
  { key: 'zia', label: 'Internet traffic (inspected)', color: '#0284C7', width: 3.2, arrowEnd: true },
  { key: 'zpa', label: 'Private app access', color: '#D97706', width: 3.2, arrowEnd: true },
  { key: 'appc', label: 'Connector tunnel (dashed)', color: '#D97706', width: 3.2, dash: '8 6', arrowEnd: true },
  { key: 'inet', label: 'Internet', color: '#64748B', width: 3.2, arrowEnd: true },
  { key: 'lan', label: 'Local network', color: '#94A3B8', width: 2.6, arrowEnd: false },
  { key: 'bgp', label: 'Control / routing (dashed)', color: '#0F766E', width: 2.4, dash: '6 5', arrowEnd: false },
  { key: 'vpn', label: 'VPN / IPsec tunnel', color: '#0891B2', width: 3.2, dash: '10 5', arrowEnd: true, arrowStart: true },
  { key: 'mgmt', label: 'Management', color: '#7C3AED', width: 2.6, dash: '6 5', arrowEnd: true },
  { key: 'repl', label: 'Replication / sync', color: '#4F46E5', width: 3.2, dash: '9 7', arrowEnd: true, arrowStart: true },
  { key: 'deny', label: 'Blocked / denied', color: '#DC2626', width: 3.2, dash: '6 5', arrowEnd: true },
  { key: 'local', label: 'Stays local', color: '#16A34A', width: 3.5, arrowEnd: true, arrowSize: 5.5 },
  { key: 'zs', label: 'Via cloud service', color: '#D97706', width: 3.5, arrowEnd: true, arrowSize: 5.5 },
  { key: 'zpadns', label: 'Answered by the service (dotted)', color: '#D97706', width: 3.5, dash: '2 7', arrowEnd: true, arrowSize: 5.5 },
  { key: 'backup', label: 'Backup path (dashed)', color: '#D97706', width: 3.5, dash: '9 7', arrowEnd: true, arrowSize: 5.5 },
  { key: 'dns', label: 'Name resolution', color: '#64748B', width: 3.5, arrowEnd: true, arrowSize: 5.5 },
];

export function makeConnector(flow, d) {
  return {
    type: 'connector', d, color: flow.color, width: flow.width, arrowEnd: !!flow.arrowEnd,
    arrowSize: flow.arrowSize || 5.2, ...(flow.dash ? { dash: flow.dash } : {}), ...(flow.arrowStart ? { arrowStart: true } : {}),
  };
}

// Name of the line style a connector uses (preset or the user's own), for legends.
export function flowLabel(c, custom = []) {
  const same = (f) => f.color.toLowerCase() === String(c.color).toLowerCase() && (f.dash || '') === (c.dash || '') &&
    !!f.arrowEnd === !!c.arrowEnd;
  return (custom.find(same) || FLOW_PRESETS.find(same))?.label || null;
}

// ------------------------------------------------------------------------------------------------ paper
// Print scale: 1 page pixel = 0.2 mm (127 px per inch). A3 landscape is then 2100 x 1485 px, and 14 px text prints
// at 2.8 mm (8 pt). PNG "for print" uses this to reach 300 dpi.
export const MM_PER_PX = 0.2;
const PAPER_MM = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
export const PAPER_SIZES = [
  ...Object.entries(PAPER_MM).flatMap(([k, [w, h]]) => [
    { key: `${k}-landscape`, label: `${k} landscape`, mm: [w, h] },
    { key: `${k}-portrait`, label: `${k} portrait`, mm: [h, w] },
  ]),
  { key: 'slide', label: 'Slide 16:9 (1920 × 1080)', px: [1920, 1080] },
  { key: 'wide', label: 'Wide overview (2800 × 1540)', px: [2800, 1540] },
];

export function paperPx(p, mmPerPx = MM_PER_PX) {
  return p.px || [Math.round(p.mm[0] / mmPerPx), Math.round(p.mm[1] / mmPerPx)];
}

// The paper size a page matches (exactly, or the smallest A-size it fits on).
export function describePage(page) {
  const k = page.mmPerPx || MM_PER_PX;
  const wmm = page.width * k, hmm = page.height * k;
  const exact = PAPER_SIZES.find((p) => { const [w, h] = paperPx(p, k); return w === page.width && h === page.height; });
  const fits = PAPER_SIZES.filter((p) => p.mm).sort((a, b) => a.mm[0] * a.mm[1] - b.mm[0] * b.mm[1])
    .find((p) => p.mm[0] >= wmm - 0.5 && p.mm[1] >= hmm - 0.5);
  return { wmm, hmm, exact, fits };
}

export const DASHES = [
  ['', 'Solid'], ['8 6', 'Dashed 8 6'], ['9 7', 'Dashed 9 7'], ['6 5', 'Dashed 6 5'], ['2 7', 'Dotted 2 7'],
  ['12 6', 'Long dash'], ['2 4', 'Fine dots'],
];

// ------------------------------------------------------------------------------------------------ text & markers
export const TEXT_PRESETS = [
  { key: 'title', label: 'Title', t: { text: 'Diagram title', size: 32, weight: 700, color: PALETTE.ink, anchor: 'start' } },
  { key: 'subtitle', label: 'Subtitle', t: { text: 'Current state · date', size: 15, weight: 400, color: PALETTE.muted, anchor: 'start' } },
  { key: 'heading', label: 'Section heading', t: { text: 'Section · location', size: 21, weight: 700, color: PALETTE.ink, anchor: 'start' } },
  { key: 'label', label: 'Label', t: { text: 'Label', size: 14, weight: 600, color: PALETTE.ink, anchor: 'middle' } },
  { key: 'wire', label: 'Line label', t: { text: '10.0.0.0/24', size: 11.5, weight: 600, color: PALETTE.wan, anchor: 'middle' } },
  { key: 'note', label: 'Note text', t: { text: 'Explanation of the numbered step.', size: 14, weight: 400, color: PALETTE.ink, anchor: 'start' } },
  { key: 'small', label: 'Small grey', t: { text: 'detail', size: 12, weight: 400, color: PALETTE.muted, anchor: 'middle' } },
  { key: 'foot', label: 'Footnote', t: { text: 'Source and caveats.', size: 12.5, weight: 400, color: PALETTE.muted, anchor: 'start', italic: true } },
];

export function makeText(p, x, y) { return { type: 'text', x, y, ...p.t }; }

export const BADGE_PRESETS = [
  { key: 'n-green', label: 'Step (green)', b: { text: '1', fill: '#16A34A' } },
  { key: 'n-orange', label: 'Step (orange)', b: { text: '1', fill: '#D97706' } },
  { key: 'n-slate', label: 'Step (slate)', b: { text: '1', fill: '#64748B' } },
  { key: 'n-blue', label: 'Step (blue)', b: { text: '1', fill: '#0284C7' } },
  { key: 'n-teal', label: 'Step (teal)', b: { text: '1', fill: '#0F766E' } },
  { key: 'q', label: 'To confirm (?)', b: { text: '?', fill: '#DC2626', size: 16, textDy: 5.5 } },
  { key: 'w', label: 'Warning (!)', b: { text: '!', fill: '#DC2626', size: 15, textDy: 5.5 } },
];

export function makeBadge2(p, x, y) {
  return { type: 'badge', x, y, r: 14, fill: '#16A34A', stroke: '#fff', strokeWidth: 2.5, size: 14, weight: 700, textColor: '#fff', textDy: 5, ...p.b };
}

export function cloudPath(cx, cy) {
  return `M${cx - 150} ${cy + 55} H${cx + 140} A55 55 0 0 0 ${cx + 150} ${cy - 45} A75 75 0 0 0 ${cx - 20} ${cy - 80} ` +
    `A60 60 0 0 0 ${cx - 120} ${cy - 35} A45 45 0 0 0 ${cx - 150} ${cy + 55} Z`;
}
