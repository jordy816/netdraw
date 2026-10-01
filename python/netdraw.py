"""Write NetDraw project files (.netdraw) from Python.

The house style (palette, icon styles, line styles, paper sizes) mirrors src/js/presets.js; tools/test-model.mjs
checks that the two stay in sync.

Use this instead of hand-writing SVG when a script or a Claude session makes a network drawing: the result opens and
stays editable in NetDraw, and NetDraw exports it to SVG/PNG.

    from netdraw import Doc, PALETTE as C
    d = Doc(1800, 900, title='Example')
    a = d.node('pc', 200, 300, C['client'], 'Client', 'PC or server')
    b = d.node('server', 600, 300, C['dc'], 'Local DC', badge='AD')
    d.connect(a, b, 'zia')
    d.save('example.netdraw')

Coordinates are page pixels; text y is the baseline (as in SVG). Node label metrics come from a style preset:
'overview' (compact glyphs, 14/12 px labels), 'flow' (large glyphs, 15/12.5 px) or 'document' (20/17 px labels).
"""
import html
import json
import math

PALETTE = {
    'client': '#2563EB', 'dc': '#16A34A', 'wan': '#0F766E', 'bc': '#7C3AED', 'ztb': '#4F46E5', 'zia': '#0284C7',
    'zpa': '#D97706', 'appc': '#EA580C', 'azure': '#0078D4', 'inet': '#64748B', 'sap': '#0891B2', 'fw': '#B91C1C',
    'warn': '#DC2626', 'ink': '#0F172A', 'muted': '#475569', 'line': '#CBD5E1', 'lan': '#94A3B8',
}
# Line styles (same keys and labels as the app's Connectors panel).
FLOWS = {
    'wan': dict(label='WAN / private line', color='#0F766E', width=3.2, arrow=False),
    'zia': dict(label='Internet traffic (inspected)', color='#0284C7', width=3.2, arrow=True),
    'zpa': dict(label='Private app access', color='#D97706', width=3.2, arrow=True),
    'appc': dict(label='Connector tunnel (dashed)', color='#D97706', width=3.2, dash='8 6', arrow=True),
    'inet': dict(label='Internet', color='#64748B', width=3.2, arrow=True),
    'lan': dict(label='Local network', color='#94A3B8', width=2.6, arrow=False),
    'bgp': dict(label='Control / routing (dashed)', color='#0F766E', width=2.4, dash='6 5', arrow=False),
    'vpn': dict(label='VPN / IPsec tunnel', color='#0891B2', width=3.2, dash='10 5', arrow=True, arrow_start=True),
    'mgmt': dict(label='Management', color='#7C3AED', width=2.6, dash='6 5', arrow=True),
    'repl': dict(label='Replication / sync', color='#4F46E5', width=3.2, dash='9 7', arrow=True, arrow_start=True),
    'deny': dict(label='Blocked / denied', color='#DC2626', width=3.2, dash='6 5', arrow=True),
    'local': dict(label='Stays local', color='#16A34A', width=3.5, arrow=True, size=5.5),
    'zs': dict(label='Via cloud service', color='#D97706', width=3.5, arrow=True, size=5.5),
    'zpadns': dict(label='Answered by the service (dotted)', color='#D97706', width=3.5, dash='2 7', arrow=True, size=5.5),
    'backup': dict(label='Backup path (dashed)', color='#D97706', width=3.5, dash='9 7', arrow=True, size=5.5),
    'dns': dict(label='Name resolution', color='#64748B', width=3.5, arrow=True, size=5.5),
}
FLOW = {k: v['color'] for k, v in FLOWS.items()}   # colour per style (kept for older scripts)

# Paper sizes at the print scale 1 px = 0.2 mm (A3 landscape = 2100 x 1485 px).
MM_PER_PX = 0.2
PAPER_MM = {'A4': (297, 210), 'A3': (420, 297), 'A2': (594, 420), 'A1': (841, 594), 'A0': (1189, 841)}


def paper(name='A3', landscape=True):
    w, h = PAPER_MM[name]
    if not landscape:
        w, h = h, w
    return round(w / MM_PER_PX), round(h / MM_PER_PX)

NODE_STYLES = {
    'overview': dict(glyphSet='A', r=32, nameSize=14, nameWeight=600, nameDy=20, subSize=12, subDy=37, subLh=15,
                     badge=dict(r=12, strokeWidth=2.3, size=10, textDy=4, k=(0.78, -0.72))),
    'document': dict(glyphSet='A', r=36, nameSize=20, nameWeight=600, nameDy=26, subSize=17, subDy=50, subLh=21,
                     badge=dict(r=13, strokeWidth=2.5, size=11, textDy=4.5, k=(0.78, -0.72))),
    'flow': dict(glyphSet='B', r=34, nameSize=15, nameWeight=600, nameDy=22, subSize=12.5, subDy=40, subLh=16,
                 badge=dict(r=13, strokeWidth=2.5, size=11, textDy=4.5, d=(26, -24))),
}


def _u(s):
    """Generator strings were pre-escaped for SVG; the project stores plain text."""
    return html.unescape(s) if isinstance(s, str) else s


class Doc:
    def __init__(self, width=None, height=None, title='', background='#fff',
                 font_family='IBM Plex Sans, DejaVu Sans, sans-serif', style='overview', paper_size=None):
        """Doc(2800, 1540) for a size in px, or Doc(paper_size='A3') / Doc(paper_size=('A4', False)) for paper."""
        if paper_size:
            width, height = paper(*paper_size) if isinstance(paper_size, tuple) else paper(paper_size)
        width, height = width or 2100, height or 1485
        self.page = {'width': width, 'height': height, 'background': background, 'fontFamily': font_family,
                     'title': title, 'grid': 10, 'mmPerPx': MM_PER_PX}
        self.items = []
        self.style = style
        self._n = 0
        self._g = 0

    # ---------------------------------------------------------------- basics
    def _add(self, item):
        self._n += 1
        item['id'] = f'i{self._n}'
        self.items.append(item)
        return item['id']

    def get(self, iid):
        return next(i for i in self.items if i['id'] == iid)

    def text(self, x, y, s, size=14, weight=400, color=PALETTE['ink'], anchor='middle', italic=False, rotate=None):
        it = {'type': 'text', 'x': x, 'y': y, 'text': _u(s), 'size': size, 'weight': weight, 'color': color,
              'anchor': anchor}
        if italic:
            it['italic'] = True
        if rotate:
            it['rotate'] = rotate
        return self._add(it)

    def zone(self, x, y, w, h, fill='#F8FAFC', stroke=PALETTE['line'], stroke_width=1.6, rx=16, dash=None,
             title='', title_size=15, title_weight=700, title_color=PALETTE['muted'], title_align='left',
             title_dx=18, title_dy=28, sub=None, sub_size=12.5, sub_color=PALETTE['muted'], sub_dy=48):
        it = {'type': 'zone', 'x': x, 'y': y, 'w': w, 'h': h, 'rx': rx, 'fill': fill, 'stroke': stroke or 'none',
              'strokeWidth': stroke_width, 'title': _u(title), 'titleSize': title_size, 'titleWeight': title_weight,
              'titleColor': title_color, 'titleAlign': title_align, 'titleDx': title_dx, 'titleDy': title_dy,
              'sub': _u(sub) or '', 'subSize': sub_size, 'subColor': sub_color, 'subDy': sub_dy}
        if dash:
            it['dash'] = dash
        return self._add(it)

    def node(self, glyph, x, y, color, name=None, sub=None, badge=None, inactive=False, r=None, style=None,
             name_color=PALETTE['ink'], sub_color=PALETTE['muted'], **over):
        st = NODE_STYLES[style or self.style]
        rr = r if r is not None else st['r']
        it = {'type': 'node', 'x': x, 'y': y, 'r': rr, 'color': color, 'glyph': glyph, 'glyphSet': st['glyphSet'],
              'name': _u(name) or '', 'nameSize': st['nameSize'], 'nameWeight': st['nameWeight'],
              'nameColor': name_color, 'nameDy': st['nameDy'], 'sub': _u(sub) or '', 'subSize': st['subSize'],
              'subColor': sub_color, 'subDy': st['subDy'], 'subLh': st['subLh']}
        if inactive:
            it['inactive'] = True
        if badge:
            b = st['badge']
            if 'k' in b:
                dx, dy = rr * b['k'][0], rr * b['k'][1]
            else:
                dx, dy = b['d']
            it['badge'] = {'text': badge, 'dx': dx, 'dy': dy, 'r': b['r'], 'strokeWidth': b['strokeWidth'],
                           'size': b['size'], 'textDy': b['textDy']}
        it.update(over)
        return self._add(it)

    def connector(self, d, color, width=3.2, dash=None, arrow_end=True, arrow_size=5.2, arrow_start=False,
                  label=None, label_pos=0.5):
        it = {'type': 'connector', 'd': d, 'color': color, 'width': width, 'arrowEnd': bool(arrow_end),
              'arrowSize': arrow_size}
        if dash:
            it['dash'] = dash
        if arrow_start:
            it['arrowStart'] = True
        if label:
            it['label'] = label
            if label_pos != 0.5:
                it['labelPos'] = label_pos
        return self._add(it)

    def note(self, x, y, w, h, body, title='Note'):
        """Yellow sticky note; body text wraps inside the box."""
        return self._add({'type': 'zone', 'x': x, 'y': y, 'w': w, 'h': h, 'rx': 10, 'fill': '#FEFCE8', 'stroke': '#FDE68A',
                          'strokeWidth': 1.5, 'title': title, 'titleSize': 15, 'titleWeight': 700, 'titleColor': '#854D0E',
                          'titleAlign': 'left', 'titleDx': 18, 'titleDy': 30, 'sub': '', 'subSize': 12.5,
                          'subColor': PALETTE['muted'], 'subDy': 48, 'body': body, 'bodySize': 14, 'bodyColor': '#422006',
                          'bodyDy': 56 if title else 30, 'bodyLh': 20})

    def textbox(self, x, y, w, h, body, fill='#FFFFFF', stroke=PALETTE['line']):
        return self._add({'type': 'zone', 'x': x, 'y': y, 'w': w, 'h': h, 'rx': 10, 'fill': fill, 'stroke': stroke,
                          'strokeWidth': 1.5, 'title': '', 'titleSize': 15, 'titleWeight': 700,
                          'titleColor': PALETTE['muted'], 'titleAlign': 'left', 'titleDx': 18, 'titleDy': 28, 'sub': '',
                          'subSize': 12.5, 'subColor': PALETTE['muted'], 'subDy': 48, 'body': body, 'bodySize': 14,
                          'bodyColor': PALETTE['ink'], 'bodyDy': 30, 'bodyLh': 20})

    def legend(self, x, y, keys=None, gap=44):
        """A legend row: one entry per line style used (or the given FLOWS keys)."""
        if keys is None:
            keys, seen = [], set()
            for it in self.items:
                if it['type'] != 'connector':
                    continue
                if it.get('group') and any(o.get('group') == it['group'] and o['type'] == 'text' for o in self.items):
                    continue   # an existing legend entry
                k = next((k for k, f in FLOWS.items() if f['color'].lower() == it['color'].lower()
                          and f.get('dash') == it.get('dash') and f['arrow'] == it['arrowEnd']), None)
                if k and k not in seen:
                    seen.add(k)
                    keys.append(k)
        x0, right = x, self.page['width'] - 40
        for k in keys:
            f = FLOWS[k]
            w = 58 + text_width(f['label'], 14)
            if x > x0 and x + w > right:
                x, y = x0, y + 30
            line = self.connector(f'M{x} {y} L{x + 46} {y}', f['color'], width=3.5, dash=f.get('dash'),
                                  arrow_end=f['arrow'], arrow_size=f.get('size', 5.2), arrow_start=f.get('arrow_start'))
            t = self.text(x + 58, y + 5, f['label'], 14, 400, PALETTE['ink'], 'start')
            self.group(line, t)
            x += w + gap
        return y

    def badge(self, x, y, s, fill, r=13, stroke='#fff', stroke_width=2.5, size=13, text_dy=4.8, text_color='#fff',
              weight=700):
        return self._add({'type': 'badge', 'x': x, 'y': y, 'r': r, 'fill': fill, 'stroke': stroke or 'none',
                          'strokeWidth': stroke_width, 'text': _u(s), 'size': size, 'weight': weight,
                          'textColor': text_color, 'textDy': text_dy})

    def path(self, d, fill='none', stroke=None, stroke_width=2, dash=None):
        it = {'type': 'path', 'd': d, 'fill': fill, 'stroke': stroke or 'none', 'strokeWidth': stroke_width}
        if dash:
            it['dash'] = dash
        return self._add(it)

    def circle(self, x, y, r, fill='#fff', stroke=None, stroke_width=2, dash=None):
        it = {'type': 'circle', 'x': x, 'y': y, 'r': r, 'fill': fill, 'stroke': stroke or 'none',
              'strokeWidth': stroke_width}
        if dash:
            it['dash'] = dash
        return self._add(it)

    def group(self, *ids):
        self._g += 1
        gid = f'g{self._g}'
        for i in ids:
            self.get(i)['group'] = gid
        return gid

    # ---------------------------------------------------------------- connectors between nodes
    def connect(self, a, b, flow='zia', style='curve', dash=None, width=None, arrow=None, gap=4, label=None,
                label_pos=0.5):
        """Connect two nodes with a line style from FLOWS (or a colour); style = curve | orthogonal | straight."""
        f = FLOWS.get(flow, {'color': flow, 'width': 3.2, 'arrow': True})
        arrow = f['arrow'] if arrow is None else arrow
        A, B = self.get(a), self.get(b)
        d = route(style, A, B, gap if arrow else 0)
        cid = self.connector(d, f['color'], width=width or f['width'], dash=dash if dash is not None else f.get('dash'),
                             arrow_end=arrow, arrow_size=f.get('size', 5.2), arrow_start=f.get('arrow_start'),
                             label=label, label_pos=label_pos)
        self.attach(cid)
        return cid

    def attach(self, cid, tol=16):
        """Bind a connector's ends to the nodes they touch, so they follow when a node is moved in NetDraw."""
        c = self.get(cid)
        pts = _endpoints(c['d'])
        if not pts:
            return
        for key, (px, py) in (('from', pts[0]), ('to', pts[1])):
            best, bd = None, None
            for n in self.items:
                if n['type'] != 'node':
                    continue
                dist = math.hypot(px - n['x'], py - n['y'])
                if dist <= n['r'] + tol and (bd is None or dist < bd):
                    best, bd = n, dist
            if best:
                c[key] = {'id': best['id'], 'dx': round(px - best['x'], 3), 'dy': round(py - best['y'], 3)}

    def attach_all(self, tol=16):
        for it in self.items:
            if it['type'] == 'connector':
                self.attach(it['id'], tol)

    def save(self, path):
        data = {'format': 'netdraw', 'version': 1, 'page': self.page, 'items': self.items}
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        return path


# -------------------------------------------------------------------------------- helpers
_NUM = r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'


def _endpoints(d):
    """First and last absolute point of a path that uses absolute commands only."""
    import re
    toks = re.findall(r'[MLHVCSQTAZ]|' + _NUM, d)
    x = y = None
    first = None
    i = 0
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            continue
        n = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7}[cmd]
        vals = [float(v) for v in toks[i:i + n]]
        i += n
        if cmd == 'H':
            x = vals[0]
        elif cmd == 'V':
            y = vals[0]
        else:
            x, y = vals[-2], vals[-1]
        if first is None:
            first = (x, y)
    return (first, (x, y)) if first else None


def label_below(n):
    """Distance from a node's centre to just below its label (vertical routes leave/enter there)."""
    lines = len(n['sub'].split('\n')) if n.get('sub') else 0
    if not n.get('name') and not lines:
        return n['r']
    base = n['subDy'] + (lines - 1) * n['subLh'] + n['subSize'] * 0.3 if lines else n['nameDy'] + n['nameSize'] * 0.3
    return n['r'] + base + 8


def text_width(s, size, weight=400):
    """Approximate width of IBM Plex Sans text in px (good enough for legend spacing)."""
    k = 0.56 if weight >= 600 else 0.53
    narrow = sum(1 for ch in s if ch in 'ilIjtf.,:;|!()[] ')
    return round((len(s) - narrow * 0.45) * size * k)


def route(style, A, B, gap=4):
    ax, ay, ra, bx, by, rb = A['x'], A['y'], A['r'], B['x'], B['y'], B['r']
    dx, dy = bx - ax, by - ay
    f = lambda v: f'{round(v, 2):g}'
    if style == 'straight':
        ln = math.hypot(dx, dy) or 1
        ux, uy = dx / ln, dy / ln
        s0 = label_below(A) / uy if uy > 0.8 else ra
        s1 = -label_below(B) / uy if uy < -0.8 else rb
        return f'M{f(ax + ux * s0)} {f(ay + uy * s0)} L{f(bx - ux * (s1 + gap))} {f(by - uy * (s1 + gap))}'
    if style == 'orthogonal':
        R = 18
        sx = 1 if dx >= 0 else -1
        sy = 1 if dy >= 0 else -1
        if abs(dx) >= abs(dy):
            x0, x1 = ax + sx * ra, bx - sx * (rb + gap)
            if abs(dy) < 2:
                return f'M{f(x0)} {f(ay)} H{f(x1)}'
            y1 = by - (rb + gap) if sy > 0 else by + label_below(B) + gap
            if (y1 - ay) * sy > R:
                return (f'M{f(x0)} {f(ay)} H{f(bx - sx * R)} Q{f(bx)} {f(ay)} {f(bx)} {f(ay + sy * R)} V{f(y1)}')
            mx, r = (x0 + x1) / 2, min(R, abs(dy) / 2, abs(x1 - x0) / 4)
            return (f'M{f(x0)} {f(ay)} H{f(mx - sx * r)} Q{f(mx)} {f(ay)} {f(mx)} {f(ay + sy * r)} '
                    f'V{f(by - sy * r)} Q{f(mx)} {f(by)} {f(mx + sx * r)} {f(by)} H{f(x1)}')
        y0 = ay + label_below(A) if sy > 0 else ay - ra
        y1 = by - (rb + gap) if sy > 0 else by + label_below(B) + gap
        if abs(dx) < 2:
            return f'M{f(ax)} {f(y0)} V{f(y1)}'
        x1 = bx - sx * (rb + gap)
        if (x1 - ax) * sx > R:
            return f'M{f(ax)} {f(y0)} V{f(by - sy * R)} Q{f(ax)} {f(by)} {f(ax + sx * R)} {f(by)} H{f(x1)}'
        my, r = (y0 + y1) / 2, min(R, abs(dx) / 2, abs(y1 - y0) / 4)
        return (f'M{f(ax)} {f(y0)} V{f(my - sy * r)} Q{f(ax)} {f(my)} {f(ax + sx * r)} {f(my)} '
                f'H{f(bx - sx * r)} Q{f(bx)} {f(my)} {f(bx)} {f(my + sy * r)} V{f(y1)}')
    if abs(dx) >= abs(dy):
        sx = 1 if dx >= 0 else -1
        x0, x1 = ax + sx * ra, bx - sx * (rb + gap)
        k = max(40, abs(x1 - x0) * 0.45)
        return f'M{f(x0)} {f(ay)} C{f(x0 + sx * k)} {f(ay)} {f(x1 - sx * k)} {f(by)} {f(x1)} {f(by)}'
    sy = 1 if dy >= 0 else -1
    y0 = ay + label_below(A) if sy > 0 else ay - ra
    y1 = by - (rb + gap) if sy > 0 else by + label_below(B) + gap
    k = max(40, abs(y1 - y0) * 0.45)
    return f'M{f(ax)} {f(y0)} C{f(ax)} {f(y0 + sy * k)} {f(bx)} {f(y1 - sy * k)} {f(bx)} {f(y1)}'
