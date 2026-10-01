// Icon glyphs drawn inside a node disc. Every glyph is a function (cx, cy, g, bg) -> SVG markup, where g is the
// glyph colour (white on a filled disc, the node colour when inactive) and bg the disc colour behind it.
//
// Set A reproduces the compact glyphs of the overview drawing and the document figures; set B reproduces the
// larger glyphs of the flow diagrams. Both are byte-for-byte ports of the generators that made the originals,
// so do not "tidy" the numbers: exact output depends on them.

import { BRANDS, MSICONS, VENDOR_GROUPS } from './vendor.js';
import { parsePath, pathBBox } from './path.js';

const SW = 'stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"';

export const GLYPHS_A = {
  pc: (cx, cy, g) =>
    `<rect x="${cx - 15}" y="${cy - 13}" width="30" height="20" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy + 7} V${cy + 12} M${cx - 9} ${cy + 13} H${cx + 9}" stroke="${g}" ${SW}/>`,
  laptop: (cx, cy, g) =>
    `<rect x="${cx - 13}" y="${cy - 12}" width="26" height="17" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 18} ${cy + 10} H${cx + 18}" stroke="${g}" ${SW}/>`,
  server: (cx, cy, g) =>
    `<rect x="${cx - 11}" y="${cy - 16}" width="22" height="32" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 11} ${cy - 5} H${cx + 11} M${cx - 11} ${cy + 5} H${cx + 11}" stroke="${g}" stroke-width="2.2"/>` +
    `<circle cx="${cx + 5}" cy="${cy - 10}" r="1.8" fill="${g}"/>`,
  bc: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 12}" width="34" height="24" rx="5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 9} ${cy - 4} H${cx + 8} M${cx + 4} ${cy - 8} L${cx + 8} ${cy - 4} L${cx + 4} ${cy}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 9} ${cy + 5} H${cx - 8} M${cx - 4} ${cy + 1} L${cx - 8} ${cy + 5} L${cx - 4} ${cy + 9}" fill="none" stroke="${g}" ${SW}/>`,
  ztb: (cx, cy, g) =>
    `<rect x="${cx - 18}" y="${cy - 10}" width="36" height="20" rx="4" fill="none" stroke="${g}" ${SW}/>` +
    [0, 1, 2].map((i) => `<circle cx="${cx - 9 + i * 9}" cy="${cy}" r="2.6" fill="${g}"/>`).join(''),
  router: (cx, cy, g) =>
    `<path d="M${cx - 14} ${cy} H${cx + 14} M${cx} ${cy - 14} V${cy + 14}" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 9} ${cy - 5} L${cx + 14} ${cy} L${cx + 9} ${cy + 5} M${cx - 9} ${cy - 5} L${cx - 14} ${cy} L${cx - 9} ${cy + 5} ` +
    `M${cx - 5} ${cy - 9} L${cx} ${cy - 14} L${cx + 5} ${cy - 9} M${cx - 5} ${cy + 9} L${cx} ${cy + 14} L${cx + 5} ${cy + 9}" ` +
    `fill="none" stroke="${g}" ${SW}/>`,
  switch: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 9}" width="34" height="18" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${cx - 12 + i * 7}" y="${cy - 2}" width="4" height="5" fill="${g}"/>`).join(''),
  firewall: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 12}" width="32" height="24" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 16} ${cy} H${cx + 16} M${cx - 4} ${cy - 12} V${cy} M${cx + 6} ${cy} V${cy + 12} M${cx - 10} ${cy} V${cy + 12}" ` +
    `stroke="${g}" stroke-width="2.2"/>`,
  wlc: (cx, cy, g) =>
    `<path d="M${cx - 15} ${cy - 3} A21 21 0 0 1 ${cx + 15} ${cy - 3} M${cx - 9} ${cy + 3} A13 13 0 0 1 ${cx + 9} ${cy + 3}" ` +
    `fill="none" stroke="${g}" ${SW}/><circle cx="${cx}" cy="${cy + 10}" r="3" fill="${g}"/>`,
  sap: (cx, cy, g) =>
    `<ellipse cx="${cx}" cy="${cy - 10}" rx="13" ry="5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 13} ${cy - 10} V${cy + 10} A13 5 0 0 0 ${cx + 13} ${cy + 10} V${cy - 10} M${cx - 13} ${cy} A13 5 0 0 0 ` +
    `${cx + 13} ${cy}" fill="none" stroke="${g}" ${SW}/>`,
  appc: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 7}" width="12" height="14" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx + 4}" y="${cy - 7}" width="12" height="14" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 4} ${cy} H${cx + 4}" stroke="${g}" ${SW}/>`,
  zia: (cx, cy, g, bg) => cloudA(cx, cy, g) +
    `<path d="M${cx} ${cy - 6} L${cx + 6} ${cy - 3} V${cy + 2} Q${cx + 6} ${cy + 7} ${cx} ${cy + 9} Q${cx - 6} ${cy + 7} ${cx - 6} ` +
    `${cy + 2} V${cy - 3} Z" fill="${bg}"/>`,
  zpa: (cx, cy, g, bg) => cloudA(cx, cy, g) +
    `<rect x="${cx - 6}" y="${cy - 1}" width="12" height="9" rx="2" fill="${bg}"/><path d="M${cx - 4} ${cy - 1} ` +
    `V${cy - 4} A4 4 0 0 1 ${cx + 4} ${cy - 4} V${cy - 1}" fill="none" stroke="${bg}" stroke-width="2.3"/>`,
  globe: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="6.5" ry="15" fill="none" stroke="${g}" stroke-width="2"/>` +
    `<path d="M${cx - 15} ${cy} H${cx + 15} M${cx - 12} ${cy - 8} H${cx + 12} M${cx - 12} ${cy + 8} H${cx + 12}" stroke="${g}" ` +
    `stroke-width="1.7"/>`,
  isp: (cx, cy, g) =>
    [0, 1, 2, 3].map((i) =>
      `<rect x="${cx - 13 + i * 9}" y="${cy + 8 - (i + 1) * 6}" width="6" height="${(i + 1) * 6}" rx="1.5" fill="${g}"/>`).join(''),
  gateway: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 15} V${cy + 15}" stroke="${g}" stroke-width="3.2"/>` +
    `<path d="M${cx - 15} ${cy} H${cx + 13} M${cx + 7} ${cy - 6} L${cx + 13} ${cy} L${cx + 7} ${cy + 6}" fill="none" stroke="${g}" ${SW}/>`,
  building: (cx, cy, g) =>
    `<rect x="${cx - 12}" y="${cy - 14}" width="24" height="28" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    [0, 1, 2, 3, 4, 5].map((i) =>
      `<rect x="${cx - 7 + (i % 2) * 9}" y="${cy - 9 + Math.floor(i / 2) * 8}" width="5" height="4" fill="${g}"/>`).join(''),
  gear: (cx, cy, g) =>
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) =>
      `<rect x="${cx - 2.5}" y="${cy - 17}" width="5" height="8" rx="1" fill="${g}" transform="rotate(${a} ${cx} ${cy})"/>`).join('') +
    `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${g}" stroke-width="4"/>`,

  // ---- additions beyond the original drawings (same visual language: 2.8 round strokes, ~36 px box)
  user: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy - 7}" r="7" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 13} ${cy + 15} Q${cx - 13} ${cy + 3} ${cx} ${cy + 3} Q${cx + 13} ${cy + 3} ${cx + 13} ${cy + 15}" fill="none" stroke="${g}" ${SW}/>`,
  users: (cx, cy, g) =>
    `<circle cx="${cx - 5}" cy="${cy - 7}" r="6" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 16} ${cy + 13} Q${cx - 16} ${cy + 2} ${cx - 5} ${cy + 2} Q${cx + 6} ${cy + 2} ${cx + 6} ${cy + 13}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 7} ${cy - 13} A6 6 0 0 1 ${cx + 9} ${cy - 1} M${cx + 11} ${cy + 3} Q${cx + 17} ${cy + 5} ${cx + 17} ${cy + 13}" fill="none" stroke="${g}" ${SW}/>`,
  cloud: (cx, cy, g) => cloudA(cx, cy, g),
  lock: (cx, cy, g, bg) =>
    `<rect x="${cx - 12}" y="${cy - 3}" width="24" height="18" rx="3" fill="${g}"/>` +
    `<path d="M${cx - 7} ${cy - 3} V${cy - 8} A7 7 0 0 1 ${cx + 7} ${cy - 8} V${cy - 3}" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<circle cx="${cx}" cy="${cy + 5}" r="2.6" fill="${bg}"/>`,
  shield: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 16} L${cx + 13} ${cy - 10} V${cy} Q${cx + 13} ${cy + 11} ${cx} ${cy + 16} Q${cx - 13} ${cy + 11} ${cx - 13} ${cy} V${cy - 10} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 6} ${cy} L${cx - 1} ${cy + 5} L${cx + 7} ${cy - 5}" fill="none" stroke="${g}" ${SW}/>`,
  mail: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 11}" width="32" height="22" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 15} ${cy - 9} L${cx} ${cy + 2} L${cx + 15} ${cy - 9}" fill="none" stroke="${g}" ${SW}/>`,
  printer: (cx, cy, g) =>
    `<path d="M${cx - 9} ${cy - 6} V${cy - 15} H${cx + 9} V${cy - 6}" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 16}" y="${cy - 6}" width="32" height="14" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 9}" y="${cy + 3}" width="18" height="11" fill="none" stroke="${g}" ${SW}/>`,
  phone: (cx, cy, g) =>
    `<rect x="${cx - 9}" y="${cy - 16}" width="18" height="32" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 3} ${cy + 11} H${cx + 3}" stroke="${g}" ${SW}/>`,
  ap: (cx, cy, g) =>
    `<rect x="${cx - 14}" y="${cy + 4}" width="28" height="9" rx="4.5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 9} ${cy - 5} A12 12 0 0 1 ${cx + 9} ${cy - 5} M${cx - 4} ${cy - 1} A6 6 0 0 1 ${cx + 4} ${cy - 1}" fill="none" stroke="${g}" ${SW}/>`,
  lb: (cx, cy, g) =>
    `<path d="M${cx - 15} ${cy} H${cx - 5} M${cx - 5} ${cy} L${cx + 9} ${cy - 10} M${cx - 5} ${cy} H${cx + 9} M${cx - 5} ${cy} L${cx + 9} ${cy + 10}" fill="none" stroke="${g}" ${SW}/>` +
    [-10, 0, 10].map((d) => `<circle cx="${cx + 12}" cy="${cy + d}" r="3" fill="${g}"/>`).join(''),
  key: (cx, cy, g) =>
    `<circle cx="${cx - 7}" cy="${cy}" r="7" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy} H${cx + 16} M${cx + 10} ${cy} V${cy + 6} M${cx + 15} ${cy} V${cy + 5}" fill="none" stroke="${g}" ${SW}/>`,
  doc: (cx, cy, g) =>
    `<path d="M${cx - 11} ${cy - 16} H${cx + 5} L${cx + 12} ${cy - 9} V${cy + 16} H${cx - 11} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 6} ${cy - 2} H${cx + 7} M${cx - 6} ${cy + 5} H${cx + 7}" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>`,
  container: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 16} L${cx + 15} ${cy - 8} V${cy + 8} L${cx} ${cy + 16} L${cx - 15} ${cy + 8} V${cy - 8} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 15} ${cy - 8} L${cx} ${cy} L${cx + 15} ${cy - 8} M${cx} ${cy} V${cy + 16}" fill="none" stroke="${g}" ${SW}/>`,
  vm: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 13}" width="32" height="26" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 16} ${cy - 6} H${cx + 16}" stroke="${g}" stroke-width="2.2"/>` +
    `<path d="M${cx - 8} ${cy + 1} L${cx - 3} ${cy + 6} L${cx - 8} ${cy + 11} M${cx} ${cy + 10} H${cx + 7}" fill="none" stroke="${g}" ${SW}/>`,
  dns: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<text x="${cx}" y="${cy + 4}" font-size="11" font-weight="700" fill="${g}" text-anchor="middle">DNS</text>`,
  alert: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 15} L${cx + 16} ${cy + 13} H${cx - 16} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy - 5} V${cy + 3}" stroke="${g}" ${SW}/><circle cx="${cx}" cy="${cy + 8.5}" r="1.8" fill="${g}"/>`,
  nodc: (cx, cy, g) => GLYPHS_B.nodc(cx, cy, g),

  // ---- generic library (v1.1)
  db: (cx, cy, g, bg) => GLYPHS_A.sap(cx, cy, g, bg),
  tablet: (cx, cy, g) =>
    `<rect x="${cx - 12}" y="${cy - 16}" width="24" height="32" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 3} ${cy + 11} H${cx + 3}" stroke="${g}" ${SW}/>`,
  display: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 13}" width="34" height="21" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 8} ${cy + 14} H${cx + 8} M${cx} ${cy + 8} V${cy + 14}" stroke="${g}" ${SW}/>`,
  headset: (cx, cy, g) =>
    `<path d="M${cx - 13} ${cy + 3} V${cy - 1} A13 13 0 0 1 ${cx + 13} ${cy - 1} V${cy + 3}" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 16}" y="${cy - 1}" width="6" height="11" rx="2" fill="${g}"/><rect x="${cx + 10}" y="${cy - 1}" width="6" height="11" rx="2" fill="${g}"/>` +
    `<path d="M${cx + 13} ${cy + 10} Q${cx + 13} ${cy + 15} ${cx + 4} ${cy + 15}" fill="none" stroke="${g}" ${SW}/>`,
  modem: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 3}" width="32" height="14" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 9} ${cy - 3} L${cx - 12} ${cy - 15} M${cx + 9} ${cy - 3} L${cx + 12} ${cy - 15}" stroke="${g}" ${SW}/>` +
    [-8, -2, 4].map((d) => `<circle cx="${cx + d}" cy="${cy + 4}" r="1.8" fill="${g}"/>`).join(''),
  antenna: (cx, cy, g) =>
    `<path d="M${cx - 8} ${cy + 16} L${cx} ${cy - 4} L${cx + 8} ${cy + 16} M${cx - 5} ${cy + 8} H${cx + 5}" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx}" cy="${cy - 8}" r="2.6" fill="${g}"/>` +
    `<path d="M${cx - 7} ${cy - 14} A9 9 0 0 0 ${cx - 7} ${cy - 2} M${cx + 7} ${cy - 14} A9 9 0 0 1 ${cx + 7} ${cy - 2} ` +
    `M${cx - 12} ${cy - 18} A15 15 0 0 0 ${cx - 12} ${cy + 2} M${cx + 12} ${cy - 18} A15 15 0 0 1 ${cx + 12} ${cy + 2}" fill="none" stroke="${g}" ${SW}/>`,
  satellite: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 18}" y="${cy - 5}" width="9" height="10" fill="none" stroke="${g}" stroke-width="2.2"/>` +
    `<rect x="${cx + 9}" y="${cy - 5}" width="9" height="10" fill="none" stroke="${g}" stroke-width="2.2"/>` +
    `<path d="M${cx - 13.5} ${cy - 5} V${cy + 5} M${cx + 13.5} ${cy - 5} V${cy + 5} M${cx + 4} ${cy + 9} A9 9 0 0 1 ${cx - 4} ${cy + 15}" fill="none" stroke="${g}" stroke-width="1.8" stroke-linecap="round"/>`,
  sdwan: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 11}" width="34" height="22" rx="4" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 9} ${cy + 4} C${cx - 3} ${cy + 4} ${cx - 3} ${cy - 4} ${cx + 3} ${cy - 4} H${cx + 9}" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx - 10}" cy="${cy + 4}" r="2.4" fill="${g}"/><circle cx="${cx + 10}" cy="${cy - 4}" r="2.4" fill="${g}"/>`,
  vpn: (cx, cy, g) =>
    `<ellipse cx="${cx - 11}" cy="${cy}" rx="4" ry="9" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 11} ${cy - 9} H${cx + 12} A4 9 0 0 1 ${cx + 12} ${cy + 9} H${cx - 11}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 4} ${cy} H${cx + 9} M${cx + 5} ${cy - 4} L${cx + 9} ${cy} L${cx + 5} ${cy + 4}" fill="none" stroke="${g}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  proxy: (cx, cy, g) =>
    `<rect x="${cx - 6}" y="${cy - 10}" width="12" height="20" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 17} ${cy} H${cx - 6} M${cx + 6} ${cy} H${cx + 16} M${cx + 12} ${cy - 4} L${cx + 16} ${cy} L${cx + 12} ${cy + 4}" fill="none" stroke="${g}" ${SW}/>`,
  dhcp: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<text x="${cx}" y="${cy + 3.5}" font-size="8.6" font-weight="700" fill="${g}" text-anchor="middle">DHCP</text>`,
  ntp: (cx, cy, g) => GLYPHS_A.clock(cx, cy, g),
  clock: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy - 8} V${cy} L${cx + 6} ${cy + 4}" fill="none" stroke="${g}" ${SW}/>`,
  chat: (cx, cy, g) =>
    `<path d="M${cx - 15} ${cy - 12} H${cx + 15} V${cy + 6} H${cx - 4} L${cx - 11} ${cy + 13} V${cy + 6} H${cx - 15} Z" fill="none" stroke="${g}" ${SW}/>` +
    [-7, 0, 7].map((d) => `<circle cx="${cx + d}" cy="${cy - 3}" r="1.8" fill="${g}"/>`).join(''),
  video: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 9}" width="22" height="18" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 6} ${cy - 3} L${cx + 16} ${cy - 9} V${cy + 9} L${cx + 6} ${cy + 3}" fill="none" stroke="${g}" ${SW}/>`,
  cert: (cx, cy, g) =>
    `<rect x="${cx - 15}" y="${cy - 13}" width="30" height="21" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 10} ${cy - 7} H${cx + 10} M${cx - 10} ${cy - 1} H${cx + 1}" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="${cx + 8}" cy="${cy + 6}" r="5" fill="${g}"/>` +
    `<path d="M${cx + 5} ${cy + 10} L${cx + 4} ${cy + 16} M${cx + 11} ${cy + 10} L${cx + 12} ${cy + 16}" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>`,
  idcard: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 11}" width="34" height="22" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx - 8}" cy="${cy - 3}" r="3.5" fill="none" stroke="${g}" stroke-width="2.2"/>` +
    `<path d="M${cx - 13} ${cy + 7} Q${cx - 8} ${cy + 1} ${cx - 3} ${cy + 7} M${cx + 2} ${cy - 4} H${cx + 12} M${cx + 2} ${cy + 2} H${cx + 9}" fill="none" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>`,
  mfa: (cx, cy, g) =>
    `<rect x="${cx - 15}" y="${cy - 15}" width="16" height="30" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 10} ${cy + 10} H${cx - 4}" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 4} ${cy + 1} L${cx + 8} ${cy + 5} L${cx + 16} ${cy - 5}" fill="none" stroke="${g}" ${SW}/>`,
  eye: (cx, cy, g) =>
    `<path d="M${cx - 17} ${cy} Q${cx} ${cy - 16} ${cx + 17} ${cy} Q${cx} ${cy + 16} ${cx - 17} ${cy} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="${g}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="2" fill="${g}"/>`,
  waf: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 16} L${cx + 13} ${cy - 10} V${cy} Q${cx + 13} ${cy + 11} ${cx} ${cy + 16} Q${cx - 13} ${cy + 11} ${cx - 13} ${cy} V${cy - 10} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 8} ${cy - 3} H${cx + 8} M${cx - 6} ${cy + 4} H${cx + 6} M${cx - 2} ${cy - 3} V${cy + 4} M${cx + 3} ${cy - 10} V${cy - 3}" stroke="${g}" stroke-width="2" stroke-linecap="round"/>`,
  bug: (cx, cy, g) =>
    `<ellipse cx="${cx}" cy="${cy + 3}" rx="8" ry="10" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx}" cy="${cy - 10}" r="4" fill="${g}"/>` +
    `<path d="M${cx} ${cy - 6} V${cy + 12} M${cx - 8} ${cy - 1} L${cx - 15} ${cy - 5} M${cx - 8} ${cy + 4} H${cx - 16} M${cx - 7} ${cy + 9} L${cx - 14} ${cy + 14} ` +
    `M${cx + 8} ${cy - 1} L${cx + 15} ${cy - 5} M${cx + 8} ${cy + 4} H${cx + 16} M${cx + 7} ${cy + 9} L${cx + 14} ${cy + 14}" fill="none" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>`,
  siem: (cx, cy, g) =>
    `<path d="M${cx - 15} ${cy - 11} H${cx + 7} M${cx - 15} ${cy - 4} H${cx + 1} M${cx - 15} ${cy + 3} H${cx - 4} M${cx - 15} ${cy + 10} H${cx - 6}" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx + 7}" cy="${cy + 4}" r="6.5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 11.5} ${cy + 8.5} L${cx + 16} ${cy + 13}" stroke="${g}" stroke-width="3.2" stroke-linecap="round"/>`,
  k8s: (cx, cy, g) => {
    const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
      return [Math.round((cx + 15 * Math.cos(a)) * 100) / 100, Math.round((cy + 15 * Math.sin(a)) * 100) / 100];
    });
    return `<path d="M${pts.map((p) => p.join(' ')).join(' L')} Z" fill="none" stroke="${g}" ${SW}/>` +
      `<circle cx="${cx}" cy="${cy}" r="4.5" fill="none" stroke="${g}" stroke-width="2.4"/>` +
      `<path d="${pts.map(([x, y]) => `M${cx + (x - cx) * 0.33} ${cy + (y - cy) * 0.33} L${cx + (x - cx) * 0.72} ${cy + (y - cy) * 0.72}`).join(' ')}" stroke="${g}" stroke-width="2" stroke-linecap="round"/>`;
  },
  fn: (cx, cy, g) =>
    `<path d="M${cx - 9} ${cy - 15} H${cx - 6} Q${cx - 2} ${cy - 15} ${cx} ${cy - 10} L${cx + 10} ${cy + 14} M${cx + 1} ${cy - 5} L${cx - 9} ${cy + 14}" fill="none" stroke="${g}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  webapp: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 13}" width="34" height="26" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 17} ${cy - 6} H${cx + 17}" stroke="${g}" stroke-width="2.2"/>` +
    `<circle cx="${cx - 12.5}" cy="${cy - 9.5}" r="1.4" fill="${g}"/><circle cx="${cx - 8.5}" cy="${cy - 9.5}" r="1.4" fill="${g}"/>` +
    `<path d="M${cx - 11} ${cy + 1} H${cx + 11} M${cx - 11} ${cy + 7} H${cx + 3}" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>`,
  api: (cx, cy, g) =>
    `<path d="M${cx - 6} ${cy - 14} Q${cx - 11} ${cy - 14} ${cx - 11} ${cy - 9} V${cy - 4} Q${cx - 11} ${cy} ${cx - 15} ${cy} Q${cx - 11} ${cy} ${cx - 11} ${cy + 4} V${cy + 9} Q${cx - 11} ${cy + 14} ${cx - 6} ${cy + 14} ` +
    `M${cx + 6} ${cy - 14} Q${cx + 11} ${cy - 14} ${cx + 11} ${cy - 9} V${cy - 4} Q${cx + 11} ${cy} ${cx + 15} ${cy} Q${cx + 11} ${cy} ${cx + 11} ${cy + 4} V${cy + 9} Q${cx + 11} ${cy + 14} ${cx + 6} ${cy + 14}" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx - 3.5}" cy="${cy}" r="1.8" fill="${g}"/><circle cx="${cx + 3.5}" cy="${cy}" r="1.8" fill="${g}"/>`,
  app: (cx, cy, g) =>
    [[-14, -14], [2, -14], [-14, 2], [2, 2]].map(([x, y], i) => (i === 3
      ? `<circle cx="${cx + 8}" cy="${cy + 8}" r="6" fill="none" stroke="${g}" stroke-width="2.6"/>`
      : `<rect x="${cx + x}" y="${cy + y}" width="12" height="12" rx="3" fill="none" stroke="${g}" stroke-width="2.6"/>`)).join(''),
  rack: (cx, cy, g) =>
    `<rect x="${cx - 12}" y="${cy - 17}" width="24" height="34" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 12} ${cy - 8.5} H${cx + 12} M${cx - 12} ${cy} H${cx + 12} M${cx - 12} ${cy + 8.5} H${cx + 12}" stroke="${g}" stroke-width="2"/>` +
    [-12.7, -4.2, 4.3, 12.8].map((d) => `<circle cx="${cx + 7}" cy="${cy + d}" r="1.5" fill="${g}"/>`).join(''),
  storage: (cx, cy, g) =>
    `<rect x="${cx - 16}" y="${cy - 12}" width="32" height="10" rx="3" fill="none" stroke="${g}" stroke-width="2.6"/>` +
    `<rect x="${cx - 16}" y="${cy + 2}" width="32" height="10" rx="3" fill="none" stroke="${g}" stroke-width="2.6"/>` +
    `<circle cx="${cx + 10}" cy="${cy - 7}" r="1.8" fill="${g}"/><circle cx="${cx + 10}" cy="${cy + 7}" r="1.8" fill="${g}"/>` +
    `<path d="M${cx - 11} ${cy - 7} H${cx + 2} M${cx - 11} ${cy + 7} H${cx + 2}" stroke="${g}" stroke-width="2" stroke-linecap="round"/>`,
  backup: (cx, cy, g) =>
    `<path d="M${cx - 13} ${cy + 1} A13 13 0 1 0 ${cx - 9} ${cy - 9}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 9} ${cy - 16} V${cy - 9} H${cx - 2}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy - 6} V${cy + 1} L${cx + 5} ${cy + 5}" fill="none" stroke="${g}" ${SW}/>`,
  bucket: (cx, cy, g) =>
    `<ellipse cx="${cx}" cy="${cy - 9}" rx="14" ry="4.5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 14} ${cy - 9} L${cx - 10} ${cy + 13} Q${cx} ${cy + 17} ${cx + 10} ${cy + 13} L${cx + 14} ${cy - 9}" fill="none" stroke="${g}" ${SW}/>`,
  queue: (cx, cy, g) =>
    [-17, -5, 7].map((x) => `<rect x="${cx + x}" y="${cy - 7}" width="9" height="14" rx="2" fill="${x === 7 ? g : 'none'}" stroke="${g}" stroke-width="2.6"/>`).join('') +
    `<path d="M${cx - 15} ${cy + 13} H${cx + 13} M${cx + 9} ${cy + 10} L${cx + 13} ${cy + 13} L${cx + 9} ${cy + 16}" fill="none" stroke="${g}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  chart: (cx, cy, g) =>
    `<path d="M${cx - 15} ${cy - 15} V${cy + 14} H${cx + 16}" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 10}" y="${cy + 1}" width="5" height="10" rx="1" fill="${g}"/><rect x="${cx - 2}" y="${cy - 6}" width="5" height="17" rx="1" fill="${g}"/>` +
    `<rect x="${cx + 6}" y="${cy - 12}" width="5" height="23" rx="1" fill="${g}"/>`,
  home: (cx, cy, g) =>
    `<path d="M${cx - 16} ${cy - 1} L${cx} ${cy - 15} L${cx + 16} ${cy - 1} M${cx - 11} ${cy - 5} V${cy + 14} H${cx + 11} V${cy - 5}" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 3.5}" y="${cy + 4}" width="7" height="10" fill="${g}"/>`,
  store: (cx, cy, g) =>
    `<path d="M${cx - 16} ${cy - 5} L${cx - 13} ${cy - 14} H${cx + 13} L${cx + 16} ${cy - 5} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 13} ${cy - 5} V${cy + 14} H${cx + 13} V${cy - 5}" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 4}" y="${cy + 4}" width="8" height="10" fill="${g}"/>`,
  factory: (cx, cy, g) =>
    `<path d="M${cx - 16} ${cy + 14} V${cy - 2} L${cx - 8} ${cy + 3} V${cy - 2} L${cx} ${cy + 3} V${cy - 2} L${cx + 8} ${cy + 3} V${cy - 15} H${cx + 15} V${cy + 14} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 10} ${cy + 9} H${cx - 6} M${cx - 2} ${cy + 9} H${cx + 2}" stroke="${g}" stroke-width="2.4" stroke-linecap="round"/>`,
  datacenter: (cx, cy, g) =>
    [-15, 2].map((x) => `<rect x="${cx + x}" y="${cy - 15}" width="13" height="30" rx="2" fill="none" stroke="${g}" stroke-width="2.6"/>` +
      `<path d="M${cx + x} ${cy - 6} H${cx + x + 13} M${cx + x} ${cy + 3} H${cx + x + 13}" stroke="${g}" stroke-width="1.8"/>` +
      `<circle cx="${cx + x + 9}" cy="${cy - 10.5}" r="1.4" fill="${g}"/><circle cx="${cx + x + 9}" cy="${cy - 1.5}" r="1.4" fill="${g}"/>`).join(''),
  ipphone: (cx, cy, g) =>
    `<path d="M${cx - 14} ${cy - 5} Q${cx - 14} ${cy - 14} ${cx} ${cy - 14} Q${cx + 14} ${cy - 14} ${cx + 14} ${cy - 5}" fill="none" stroke="${g}" stroke-width="3.6" stroke-linecap="round"/>` +
    `<rect x="${cx - 13}" y="${cy - 1}" width="26" height="15" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    [-5, 0, 5].flatMap((x) => [4, 9].map((y) => `<circle cx="${cx + x}" cy="${cy + y}" r="1.4" fill="${g}"/>`)).join(''),
  camera: (cx, cy, g) =>
    `<rect x="${cx - 15}" y="${cy - 11}" width="22" height="12" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 7} ${cy - 8} L${cx + 15} ${cy - 12} V${cy + 2} L${cx + 7} ${cy - 2}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 6} ${cy + 1} V${cy + 8} H${cx - 14} M${cx - 14} ${cy + 3} V${cy + 13}" fill="none" stroke="${g}" ${SW}/>`,
  iot: (cx, cy, g) =>
    `<rect x="${cx - 10}" y="${cy - 10}" width="20" height="20" rx="3" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="1" fill="${g}"/>` +
    `<path d="${[-5, 0, 5].map((d) => `M${cx + d} ${cy - 10} V${cy - 15} M${cx + d} ${cy + 10} V${cy + 15} M${cx - 10} ${cy + d} H${cx - 15} M${cx + 10} ${cy + d} H${cx + 15}`).join(' ')}" stroke="${g}" stroke-width="2" stroke-linecap="round"/>`,
  plc: (cx, cy, g) =>
    `<rect x="${cx - 15}" y="${cy - 13}" width="30" height="26" rx="2" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 15} ${cy - 5} H${cx + 15}" stroke="${g}" stroke-width="2"/>` +
    [-9, -3, 3, 9].map((d) => `<circle cx="${cx + d}" cy="${cy - 9}" r="1.5" fill="${g}"/>`).join('') +
    `<rect x="${cx - 10}" y="${cy}" width="7" height="8" rx="1" fill="${g}"/><rect x="${cx - 1}" y="${cy}" width="7" height="8" rx="1" fill="${g}"/>` +
    `<path d="M${cx + 10} ${cy} V${cy + 8}" stroke="${g}" stroke-width="2.4" stroke-linecap="round"/>`,
  info: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx} ${cy - 1} V${cy + 7}" stroke="${g}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy - 6.5}" r="1.9" fill="${g}"/>`,
  check: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 7} ${cy} L${cx - 2} ${cy + 5} L${cx + 7} ${cy - 5}" fill="none" stroke="${g}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 6} ${cy - 6} L${cx + 6} ${cy + 6} M${cx + 6} ${cy - 6} L${cx - 6} ${cy + 6}" stroke="${g}" stroke-width="3" stroke-linecap="round"/>`,
  question: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 5} ${cy - 4} A5.2 5.2 0 1 1 ${cx + 1.5} ${cy + 1} Q${cx} ${cy + 2} ${cx} ${cy + 4}" fill="none" stroke="${g}" stroke-width="2.8" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy + 8.5}" r="1.9" fill="${g}"/>`,
  pin: (cx, cy, g) =>
    `<path d="M${cx} ${cy + 16} Q${cx - 13} ${cy + 2} ${cx - 13} ${cy - 4} A13 13 0 0 1 ${cx + 13} ${cy - 4} Q${cx + 13} ${cy + 2} ${cx} ${cy + 16} Z" fill="none" stroke="${g}" ${SW}/>` +
    `<circle cx="${cx}" cy="${cy - 4}" r="4.5" fill="none" stroke="${g}" stroke-width="2.4"/>`,
  link: (cx, cy, g) =>
    `<g transform="rotate(-45 ${cx} ${cy})"><rect x="${cx - 16}" y="${cy - 5}" width="18" height="10" rx="5" fill="none" stroke="${g}" ${SW}/>` +
    `<rect x="${cx - 2}" y="${cy - 5}" width="18" height="10" rx="5" fill="none" stroke="${g}" ${SW}/></g>`,
  sync: (cx, cy, g) =>
    `<path d="M${cx + 13} ${cy - 3} A13 13 0 0 0 ${cx - 10} ${cy - 8} M${cx - 13} ${cy + 3} A13 13 0 0 0 ${cx + 10} ${cy + 8}" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx - 11} ${cy - 15} L${cx - 10} ${cy - 8} L${cx - 3} ${cy - 9} M${cx + 11} ${cy + 15} L${cx + 10} ${cy + 8} L${cx + 3} ${cy + 9}" fill="none" stroke="${g}" ${SW}/>`,
  power: (cx, cy, g) =>
    `<path d="M${cx} ${cy - 15} V${cy - 3}" stroke="${g}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M${cx - 8} ${cy - 10} A12 12 0 1 0 ${cx + 8} ${cy - 10}" fill="none" stroke="${g}" ${SW}/>`,
  star: (cx, cy, g) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 6.5 : 15, a = -Math.PI / 2 + (i * Math.PI) / 5;
      p.push(`${Math.round((cx + r * Math.cos(a)) * 100) / 100} ${Math.round((cy + 1 + r * Math.sin(a)) * 100) / 100}`);
    }
    return `<path d="M${p.join(' L')} Z" fill="none" stroke="${g}" ${SW}/>`;
  },
  search: (cx, cy, g) =>
    `<circle cx="${cx - 3}" cy="${cy - 3}" r="9.5" fill="none" stroke="${g}" ${SW}/>` +
    `<path d="M${cx + 4} ${cy + 4} L${cx + 14} ${cy + 14}" stroke="${g}" stroke-width="3.4" stroke-linecap="round"/>`,
  folder: (cx, cy, g) =>
    `<path d="M${cx - 16} ${cy - 11} H${cx - 5} L${cx - 2} ${cy - 7} H${cx + 16} V${cy + 12} H${cx - 16} Z" fill="none" stroke="${g}" ${SW}/>`,
};

function cloudA(cx, cy, g) {
  return `<path d="M${cx - 19} ${cy + 11} H${cx + 17} A9 9 0 0 0 ${cx + 19} ${cy - 6} A12 12 0 0 0 ${cx - 3} ${cy - 12} ` +
    `A9 9 0 0 0 ${cx - 17} ${cy - 4} A7 7 0 0 0 ${cx - 19} ${cy + 11} Z" fill="${g}"/>`;
}

function cloudB(cx, cy) {
  return `M${cx - 21} ${cy + 12} H${cx + 19} A10 10 0 0 0 ${cx + 21} ${cy - 7} A13 13 0 0 0 ${cx - 3} ${cy - 13} ` +
    `A10 10 0 0 0 ${cx - 19} ${cy - 4} A8 8 0 0 0 ${cx - 21} ${cy + 12} Z`;
}

export const GLYPHS_B = {
  pc: (cx, cy, g) =>
    `<rect x="${cx - 17}" y="${cy - 15}" width="34" height="23" rx="3" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<line x1="${cx}" y1="${cy + 8}" x2="${cx}" y2="${cy + 14}" stroke="${g}" stroke-width="3"/>` +
    `<line x1="${cx - 10}" y1="${cy + 15}" x2="${cx + 10}" y2="${cy + 15}" stroke="${g}" stroke-width="3" stroke-linecap="round"/>`,
  server: (cx, cy, g) =>
    `<rect x="${cx - 12}" y="${cy - 18}" width="24" height="36" rx="3" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<line x1="${cx - 12}" y1="${cy - 6}" x2="${cx + 12}" y2="${cy - 6}" stroke="${g}" stroke-width="2.5"/>` +
    `<line x1="${cx - 12}" y1="${cy + 5}" x2="${cx + 12}" y2="${cy + 5}" stroke="${g}" stroke-width="2.5"/>` +
    `<circle cx="${cx + 6}" cy="${cy - 12}" r="2" fill="${g}"/><circle cx="${cx + 6}" cy="${cy}" r="2" fill="${g}"/>`,
  bc: (cx, cy, g) =>
    `<rect x="${cx - 19}" y="${cy - 13}" width="38" height="26" rx="5" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<path d="M${cx - 10} ${cy - 4} H${cx + 9} M${cx + 4} ${cy - 8} L${cx + 9} ${cy - 4} L${cx + 4} ${cy}" fill="none" stroke="${g}" ` +
    `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${cx + 10} ${cy + 5} H${cx - 9} M${cx - 4} ${cy + 1} L${cx - 9} ${cy + 5} L${cx - 4} ${cy + 9}" fill="none" stroke="${g}" ` +
    `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  zia: (cx, cy, g, bg) =>
    `<path d="${cloudB(cx, cy)}" fill="${g}"/>` +
    `<path d="M${cx} ${cy - 7} L${cx + 7} ${cy - 4} V${cy + 2} Q${cx + 7} ${cy + 8} ${cx} ${cy + 10} Q${cx - 7} ${cy + 8} ${cx - 7} ${cy + 2} ` +
    `V${cy - 4} Z" fill="${bg}"/>`,
  zpa: (cx, cy, g, bg) =>
    `<path d="${cloudB(cx, cy)}" fill="${g}"/>` +
    `<rect x="${cx - 7}" y="${cy - 1}" width="14" height="10" rx="2" fill="${bg}"/>` +
    `<path d="M${cx - 4.5} ${cy - 1} V${cy - 4} A4.5 4.5 0 0 1 ${cx + 4.5} ${cy - 4} V${cy - 1}" fill="none" stroke="${bg}" ` +
    `stroke-width="2.5"/>`,
  appc: (cx, cy, g) =>
    `<rect x="${cx - 18}" y="${cy - 8}" width="14" height="16" rx="3" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<rect x="${cx + 4}" y="${cy - 8}" width="14" height="16" rx="3" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<line x1="${cx - 4}" y1="${cy}" x2="${cx + 4}" y2="${cy}" stroke="${g}" stroke-width="3"/>`,
  globe: (cx, cy, g) =>
    `<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${g}" stroke-width="2.5"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="17" fill="none" stroke="${g}" stroke-width="2.2"/>` +
    `<line x1="${cx - 17}" y1="${cy}" x2="${cx + 17}" y2="${cy}" stroke="${g}" stroke-width="2.2"/>` +
    `<path d="M${cx - 14} ${cy - 9} H${cx + 14} M${cx - 14} ${cy + 9} H${cx + 14}" stroke="${g}" stroke-width="1.8"/>`,
  // "No DC on site": a crossed-out server. Drawn on an inactive (dashed, white) disc in the originals.
  nodc: (cx, cy, g) =>
    `<rect x="${cx - 12}" y="${cy - 18}" width="24" height="36" rx="3" fill="none" stroke="${g}" stroke-width="3"/>` +
    `<path d="M${cx - 20} ${cy - 20} L${cx + 20} ${cy + 20} M${cx + 20} ${cy - 20} L${cx - 20} ${cy + 20}" stroke="#DC2626" ` +
    `stroke-width="3.5" stroke-linecap="round"/>`,
};

// Palette groups (generic names, so the library is not tied to one vendor).
export const GLYPH_GROUPS = [
  ['Users & clients', ['pc', 'laptop', 'tablet', 'phone', 'display', 'user', 'users', 'headset']],
  ['Network', ['router', 'switch', 'firewall', 'gateway', 'lb', 'modem', 'wlc', 'ap', 'antenna', 'satellite', 'isp', 'sdwan', 'vpn', 'proxy', 'globe', 'cloud']],
  ['Network services', ['dns', 'dhcp', 'ntp', 'mail', 'chat', 'video']],
  ['Security', ['shield', 'lock', 'key', 'cert', 'idcard', 'mfa', 'eye', 'waf', 'bug', 'siem']],
  ['Cloud security (SSE / SASE)', ['zia', 'zpa', 'bc', 'ztb', 'appc', 'gear']],
  ['Servers & apps', ['server', 'vm', 'container', 'k8s', 'fn', 'webapp', 'api', 'app', 'rack']],
  ['Data & storage', ['db', 'sap', 'storage', 'backup', 'bucket', 'queue', 'chart']],
  ['Places', ['building', 'home', 'store', 'factory', 'datacenter']],
  ['Devices & OT', ['printer', 'ipphone', 'camera', 'iot', 'plc']],
  ['Symbols', ['alert', 'info', 'check', 'cross', 'question', 'clock', 'pin', 'link', 'sync', 'power', 'star', 'search', 'folder', 'doc', 'nodc']],
];

export const GLYPH_LABEL = {
  pc: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', phone: 'Mobile phone', display: 'Screen / TV', user: 'User', users: 'Users',
  headset: 'Support desk', router: 'Router', switch: 'Switch', firewall: 'Firewall', gateway: 'Gateway', lb: 'Load balancer',
  modem: 'Modem / CPE', wlc: 'Wireless controller', ap: 'Access point', antenna: 'Cellular / 5G', satellite: 'Satellite',
  isp: 'Internet line', sdwan: 'SD-WAN edge', vpn: 'VPN tunnel', proxy: 'Proxy', globe: 'Internet', cloud: 'Cloud', dns: 'DNS',
  dhcp: 'DHCP', ntp: 'Time server', mail: 'Mail', chat: 'Chat', video: 'Video meeting', shield: 'Security', lock: 'Encryption',
  key: 'Key / secret', cert: 'Certificate', idcard: 'Identity provider', mfa: 'MFA', eye: 'Inspection / IDS', waf: 'Web app firewall',
  bug: 'Malware', siem: 'SIEM / logging', zia: 'Secure web gateway', zpa: 'Private access', bc: 'Edge connector',
  ztb: 'Branch appliance', appc: 'App connector', gear: 'Controller', server: 'Server', vm: 'Virtual machine', container: 'Container',
  k8s: 'Cluster', fn: 'Function', webapp: 'Web app', api: 'API', app: 'Application', rack: 'Server rack', db: 'Database',
  sap: 'ERP / SAP', storage: 'Storage / NAS', backup: 'Backup', bucket: 'Object storage', queue: 'Message queue', chart: 'Analytics',
  building: 'Office / partner', home: 'Home office', store: 'Shop / branch', factory: 'Factory / OT', datacenter: 'Data centre',
  printer: 'Printer', ipphone: 'Desk phone', camera: 'Camera', iot: 'IoT device', plc: 'PLC / OT controller', alert: 'Warning',
  info: 'Info', check: 'Allowed / OK', cross: 'Blocked', question: 'Unknown', clock: 'Time / schedule', pin: 'Location', link: 'Link',
  sync: 'Sync / replication', power: 'Power', star: 'Highlight', search: 'Search / lookup', folder: 'File share', doc: 'Document',
  nodc: 'Not present',
};

// Brand marks (single colour, drawn like the other glyphs) and Microsoft's full-colour architecture icons.
// Each mark is scaled so its bounding box fits a circle of diameter D (wide wordmarks get the full width).
const BRAND_BOX = {};
const fitMark = (key, cx, cy, D, fill) => {
  const b = BRANDS[key];
  const bb = BRAND_BOX[key] || (BRAND_BOX[key] = pathBBox(parsePath(b.d)));
  const k = Math.round((D / Math.hypot(bb.w, bb.h)) * 10000) / 10000;
  const tx = Math.round((cx - (bb.x + bb.w / 2) * k) * 100) / 100, ty = Math.round((cy - (bb.y + bb.h / 2) * k) * 100) / 100;
  return `<path d="${b.d}" fill="${fill}" transform="translate(${tx} ${ty}) scale(${k})"/>`;
};
for (const [k, b] of Object.entries(BRANDS)) {
  GLYPHS_A[k] = (cx, cy, g) => fitMark(k, cx, cy, 40, g);
  GLYPH_LABEL[k] = b.title;
}
for (const [k, m] of Object.entries(MSICONS)) {
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m.svg)}`;
  GLYPHS_A[k] = (cx, cy) => `<image href="${uri}" x="${cx - 20}" y="${cy - 20}" width="40" height="40"/>`;
  GLYPH_LABEL[k] = m.title;
}
export { VENDOR_GROUPS };
export const ALL_GROUPS = [...GLYPH_GROUPS, ...VENDOR_GROUPS];
export const brandMark = (key, cx, cy, diameter, color) => (BRANDS[key] ? fitMark(key, cx, cy, diameter, color || BRANDS[key].hex) : '');

// Catalogue shown in the properties panel: key, label.
export const GLYPH_CATALOG = GLYPH_GROUPS.flatMap(([, keys]) => keys).map((k) => [k, GLYPH_LABEL[k] || k]);

export const LEGACY_CATALOG = [
  ['pc', 'Client'], ['laptop', 'Laptop'], ['user', 'User'], ['users', 'Users'], ['phone', 'Phone'],
  ['server', 'Server'], ['vm', 'Virtual machine'], ['container', 'Container'], ['sap', 'Database / SAP'],
  ['router', 'Router'], ['switch', 'Switch'], ['firewall', 'Firewall'], ['gateway', 'Gateway'], ['lb', 'Load balancer'],
  ['wlc', 'Wireless'], ['ap', 'Access point'], ['isp', 'Internet line'], ['globe', 'Internet'], ['dns', 'DNS'],
  ['cloud', 'Cloud'], ['zia', 'ZIA'], ['zpa', 'ZPA'], ['bc', 'Branch / Cloud Connector'], ['ztb', 'ZTB appliance'],
  ['appc', 'App Connector'], ['gear', 'Controller'], ['building', 'Building'], ['lock', 'Lock'], ['shield', 'Shield'],
  ['key', 'Key'], ['mail', 'Mail'], ['printer', 'Printer'], ['doc', 'Document'], ['alert', 'Alert'], ['nodc', 'Not present'],
];

// Scale used when a glyph missing from set B is borrowed from set A (B glyphs are ~12% larger).
const B_FALLBACK_SCALE = 1.12;

export function glyphMarkup(set, kind, cx, cy, g, bg, scale = 1) {
  let fn = (set === 'B' ? GLYPHS_B : GLYPHS_A)[kind];
  let s = scale;
  if (!fn && set === 'B') { fn = GLYPHS_A[kind]; s = scale * B_FALLBACK_SCALE; }
  if (!fn) fn = GLYPHS_A.server;
  if (s === 1) return fn(cx, cy, g, bg);
  return `<g transform="translate(${cx} ${cy}) scale(${+s.toFixed(4)}) translate(${-cx} ${-cy})">${fn(cx, cy, g, bg)}</g>`;
}
