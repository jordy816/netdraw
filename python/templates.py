"""Build the generic starter templates in src/templates/ with the netdraw library.
(01 and 02 are derived from reference drawings by a separate converter.)"""
from pathlib import Path

from netdraw import Doc, PALETTE as C

OUT = Path(__file__).resolve().parent.parent / 'src' / 'templates'
INK, MUTED = C['ink'], C['muted']


def header(d, title, sub):
    d.text(40, 54, title, 32, 700, INK, 'start')
    d.text(40, 84, sub, 15, 400, MUTED, 'start')


def notes(d, x, y, rows, col_w=1000):
    half = (len(rows) + 1) // 2
    for i, (mark, color, text) in enumerate(rows):
        col, row = divmod(i, half)
        bx, by = x + col * col_w, y + row * 30
        b = d.badge(bx + 12, by - 5, mark, color, r=14, size=16 if mark == '?' else 14, text_dy=5.5 if mark == '?' else 5)
        t = d.text(bx + 34, by, text, 14, 400, INK, 'start')
        d.group(b, t)


# ------------------------------------------------------------------------------------------------ zero trust
def zero_trust():
    d = Doc(paper_size='A3', title='Zero Trust access', style='flow')
    header(d, 'Zero Trust access · architecture', 'Who reaches which application, and how · organisation · date')
    d.zone(30, 120, 470, 1110, title='USERS & DEVICES', sub='Wherever they work', stroke_width=1.5, rx=14, title_weight=600, sub_dy=47)
    d.zone(550, 120, 560, 400, fill='#F5F3FF', stroke='#DDD6FE', title='IDENTITY & DEVICE TRUST', title_color='#6D28D9', stroke_width=1.5, rx=14, title_weight=600)
    d.zone(550, 560, 560, 670, fill='#F0F9FF', stroke='#BAE6FD', title='CLOUD SECURITY SERVICE', title_align='right', stroke_width=1.5, rx=14, title_weight=600)
    d.zone(1160, 120, 910, 560, fill='#EFF6FF', stroke='#BFDBFE', title='PRIVATE APPS', sub='Data centre and cloud hub · nothing exposed to the internet', stroke_width=1.5, rx=14, title_weight=600, sub_dy=47)
    d.zone(1160, 720, 910, 510, title='SAAS & INTERNET', stroke_width=1.5, rx=14, title_weight=600)

    lap = d.node('laptop', 265, 300, C['client'], 'Employee laptop', 'managed · client agent')
    mob = d.node('phone', 265, 510, C['client'], 'Mobile', 'managed app')
    con = d.node('user', 265, 720, C['client'], 'Contractor', 'browser only')
    br = d.node('store', 265, 930, C['inet'], 'Branch office', 'edge connector')
    idp = d.node('idcard', 690, 300, C['ztb'], 'Identity provider', 'SSO · SAML / OIDC')
    mfa = d.node('mfa', 830, 300, C['ztb'], 'MFA', 'push · FIDO2')
    pos = d.node('shield', 970, 300, C['zia'], 'Device posture', 'patched · encrypted')
    pol = d.node('gear', 690, 800, C['ztb'], 'Policy engine', 'identity · device · risk')
    zpa = d.node('zpa', 980, 680, C['zpa'], 'Private access', 'per-app tunnels')
    swg = d.node('zia', 980, 1000, C['zia'], 'Web gateway', 'SSL inspection · DLP')
    appc = d.node('appc', 1290, 450, C['appc'], 'App connector', 'outbound only')
    web = d.node('webapp', 1520, 300, C['azure'], 'Intranet', 'web app')
    erp = d.node('db', 1720, 300, C['sap'], 'ERP', 'database')
    fs = d.node('folder', 1920, 300, C['zpa'], 'File share', 'SMB')
    leg = d.node('server', 1620, 540, C['dc'], 'Legacy app', 'RDP / SSH')
    adm = d.node('rack', 1820, 540, C['dc'], 'Admin access', 'privileged, recorded')
    saas = d.node('cloud', 1420, 785, C['zia'], 'SaaS apps', 'office suite · CRM')
    mail = d.node('mail', 1420, 900, C['client'], 'Mail', 'hosted')
    net = d.node('globe', 1420, 1015, C['inet'], 'Internet', 'allowed categories')
    blk = d.node('cross', 1420, 1130, C['warn'], 'Blocked', 'malware · risky sites')
    d.textbox(1600, 790, 420, 200, 'Policy examples: business SaaS and approved web categories are allowed and inspected. '
              'Malware, newly registered domains and risky categories are blocked. Uploads of sensitive data are '
              'stopped by DLP.')

    for u in (lap, mob, con):
        d.connect(u, pol, 'zpa')
    d.connect(br, pol, 'vpn', label='IPsec / GRE')
    d.connect(pol, idp, 'mgmt', style='straight')
    d.connect(idp, mfa, 'mgmt', style='straight')
    d.connect(mfa, pos, 'mgmt', style='straight')
    d.connect(pol, swg, 'zia')
    d.connect(pol, zpa, 'zpa')
    d.connect(appc, zpa, 'appc')
    for a in (web, erp, fs, leg, adm):
        d.connect(appc, a, 'lan', arrow=False, width=2.6)
    for t in (saas, mail, net):
        d.connect(swg, t, 'inet')
    d.connect(swg, blk, 'deny')

    for (x, y, n, col) in ((470, 360, '1', C['ztb']), (640, 600, '2', C['ztb']), (830, 920, '3', C['zpa']), (1180, 560, '4', C['appc'])):
        d.badge(x, y, n, col, r=14, size=14, text_dy=5)
    notes(d, 56, 1290, [
        ('1', C['ztb'], 'Users sign in once at the identity provider, with MFA.'),
        ('2', C['ztb'], 'The policy engine decides per request: who, which device, what risk.'),
        ('3', C['zpa'], 'Allowed traffic goes to the web gateway (internet) or private access (apps).'),
        ('4', C['appc'], 'Apps are reached through outbound connectors; no inbound ports open.'),
    ], col_w=1000)
    d.legend(40, 1400)
    return d


# ------------------------------------------------------------------------------------------------ hub & spoke
def hub_spoke():
    d = Doc(paper_size='A3', title='Hub and spoke WAN', style='overview')
    header(d, 'Hub and spoke WAN', 'Branches reach the data centre over the private WAN; internet leaves through the hub · date')
    # centre column: WAN cloud, data centre, internet edge
    cloud = d.path('M900 435 H1190 A55 55 0 0 0 1200 335 A75 75 0 0 0 1030 300 A60 60 0 0 0 930 345 A45 45 0 0 0 900 435 Z',
                   fill='#F0FDFA', stroke=C['wan'], stroke_width=2.5)
    t1 = d.text(1050, 378, 'WAN', 20, 700, C['wan'])
    t2 = d.text(1050, 402, 'MPLS / SD-WAN provider', 13, 400, MUTED)
    d.group(cloud, t1, t2)
    d.zone(760, 560, 580, 450, fill='#EFF6FF', stroke='#BFDBFE', title='DATA CENTRE (HUB)', sub='Core services')
    d.zone(760, 1060, 580, 300, title='INTERNET EDGE', title_align='right')
    hub = d.node('router', 1050, 680, C['wan'], 'Hub router', 'BGP · dual uplinks')
    fw = d.node('firewall', 1240, 680, C['fw'], 'Firewall', 'segmentation')
    sw = d.node('switch', 1050, 880, C['wan'], 'Core switch')
    srv = d.node('server', 870, 880, C['dc'], 'Servers', 'AD · DNS · DHCP', badge='AD')
    swg = d.node('zia', 1240, 1200, C['zia'], 'Web gateway', 'cloud security')
    net = d.node('globe', 900, 1200, C['inet'], 'Internet')
    d.connector('M1050 436 V644', C['wan'], width=4, arrow_end=False)
    d.attach_all()
    d.connect(hub, fw, 'lan', arrow=False, width=2.6, style='straight')
    d.connect(hub, sw, 'lan', arrow=False, width=2.6, style='straight')
    d.connect(sw, srv, 'lan', arrow=False, width=2.6, style='straight')
    d.connect(fw, swg, 'zia', style='straight')
    d.connect(swg, net, 'inet', style='straight')

    sites = [(40, 150, 'BRANCH 1'), (40, 580, 'BRANCH 2'), (40, 1010, 'BRANCH 3'),
             (1440, 150, 'BRANCH 4'), (1440, 580, 'BRANCH 5'), (1440, 1010, 'BRANCH 6')]
    ends = {150: 380, 580: 410, 1010: 430}
    for x, y, name in sites:
        left = x < 700
        d.zone(x, y, 620, 330, title=name, sub='City · users · line speed')
        rx = x + 500 if left else x + 120
        cx = x + 120 if left else x + 500
        r = d.node('router', rx, y + 190, C['wan'], 'Branch router', 'SD-WAN')
        c = d.node('pc', cx, y + 190, C['client'], 'Clients')
        ap = d.node('ap', x + 310, y + 190, C['sap'], 'Wi-Fi')
        d.connect(c, ap, 'lan', arrow=False, width=2.6, style='straight')
        d.connect(ap, r, 'lan', arrow=False, width=2.6, style='straight')
        # WAN line from the branch router to the edge of the cloud
        x0, y0 = (rx + 32, y + 190) if left else (rx - 32, y + 190)
        x1, y1 = (898, ends[y]) if left else (1203, ends[y])
        if y == 150:
            k = abs(x1 - x0) * 0.5 * (1 if left else -1)
            d.connector(f'M{x0} {y0} C{x0 + k} {y0} {x1 - k} {y1} {x1} {y1}', C['wan'], width=3.2, arrow_end=False)
        else:
            # run up alongside the data centre, then into the cloud (rounded corners)
            xv = (720 if y == 580 else 700) if left else (1380 if y == 580 else 1400)
            sx, R = (1 if left else -1), 18
            d.connector(f'M{x0} {y0} H{xv - sx * R} Q{xv} {y0} {xv} {y0 - R} V{y1 + R} Q{xv} {y1} {xv + sx * R} {y1} H{x1}',
                        C['wan'], width=3.2, arrow_end=False)
    d.attach_all()
    d.legend(40, 1420)
    return d


# ------------------------------------------------------------------------------------------------ whiteboard
def whiteboard():
    d = Doc(paper_size='A3', title='Meeting whiteboard', style='flow')
    header(d, 'Workshop · topic', 'Meeting date · participants')
    cols = [('CURRENT SITUATION', '#F8FAFC', '#CBD5E1', C['muted']), ('ISSUES & RISKS', '#FEF2F2', '#FECACA', '#B91C1C'),
            ('TARGET DESIGN', '#F0FDF4', '#BBF7D0', '#15803D')]
    for i, (title, fill, stroke, tc) in enumerate(cols):
        d.zone(30 + i * 690, 120, 660, 980, fill=fill, stroke=stroke, title=title, title_color=tc, stroke_width=1.5, rx=14,
               title_weight=600)
    d.note(60, 1140, 640, 300, 'Decisions taken in this meeting, one per line.', title='Decisions')
    d.note(750, 1140, 640, 300, 'Who does what, and by when.', title='Actions')
    d.note(1440, 1140, 630, 300, 'Questions to answer before the next session.', title='Open questions')
    a = d.node('users', 200, 330, C['client'], 'Users')
    b = d.node('router', 480, 330, C['wan'], 'Site network')
    q = d.node('question', 480, 600, C['inet'], 'Unknown', 'to find out')
    d.connect(a, b, 'lan', arrow=False, width=2.6)
    d.badge(980, 330, '!', C['warn'], r=14, size=15, text_dy=5.5)
    d.text(1004, 335, 'Write each issue next to a marker', 14, 400, INK, 'start')
    t1 = d.node('users', 1590, 330, C['client'], 'Users')
    t2 = d.node('zpa', 1870, 330, C['zpa'], 'Private access')
    d.connect(t1, t2, 'zpa')
    d.connect(b, q, 'lan', arrow=False, width=2.6, style='straight')
    return d


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (('03-zero-trust-access', zero_trust), ('04-hub-and-spoke-wan', hub_spoke), ('05-meeting-whiteboard', whiteboard)):
        print('written', fn().save(OUT / f'{name}.netdraw'))
