// Text measurement from the bundled font metrics (no browser needed): widths, word wrapping.
import { WIDTHS, UPM } from './metrics.js';

const WEIGHTS = [400, 500, 600, 700];
const nearest = (w) => WEIGHTS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), 400);

export function measure(text, size, weight = 400) {
  const table = WIDTHS[nearest(Number(weight) || 400)];
  let u = 0;
  for (const ch of String(text ?? '')) u += table[ch.codePointAt(0)] ?? 560;
  return (u * size) / UPM;
}

// Greedy word wrap per paragraph; a word longer than the width is kept whole on its own line.
export function wrapLines(text, width, size, weight = 400) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next, size, weight) <= width) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
