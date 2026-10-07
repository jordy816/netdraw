#!/usr/bin/env bash
# Export a .netdraw to PNG / SVG / PDF / Visio without a screen (Linux, via xvfb).
#   tools/nd-export.sh drawing.netdraw [out.png|out.svg|out.pdf|out.vsdx] [scale] [dark]
# scale applies to PNG (2 = screen/Word, 2.362 = 300 dpi at the print scale).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
in="$(realpath "$1")"
out="${2:-${1%.netdraw}.png}"
out="$(realpath -m "$out")"
scale="${3:-2}"
dark=""; [ "${4:-}" = "dark" ] && dark="--dark"
env -u ELECTRON_RUN_AS_NODE timeout -k 5 120 xvfb-run -a "$ROOT/node_modules/.bin/electron" "$ROOT" \
  --no-sandbox --disable-gpu --export "$in" --out "$out" --scale "$scale" $dark 2>/dev/null | grep -E '^(exported|export failed)' || true
[ -s "$out" ] || { echo "export failed: $out not written" >&2; exit 1; }
