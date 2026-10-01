"""Build samples/example-network.netdraw with the netdraw library (generic content, safe to share)."""
from pathlib import Path

from netdraw import Doc, PALETTE as C, FLOW

d = Doc(1800, 980, title='Example · branch office and cloud security', style='overview')
d.text(40, 54, 'Example · branch office and cloud security', 32, 700, C['ink'], 'start')
d.text(40, 84, 'Generic sample made with the netdraw Python library', 15, 400, C['muted'], 'start')

d.zone(30, 120, 700, 330, title='BRANCH OFFICE', sub='Clients, local server and the site gateway')
d.zone(30, 480, 700, 300, title='REMOTE USERS')
d.zone(780, 120, 480, 660, fill='#F0F9FF', stroke='#BAE6FD', title='SECURITY CLOUD', title_align='right')
d.zone(1310, 120, 460, 660, fill='#EFF6FF', stroke='#BFDBFE', title='DATA CENTRE', sub='Applications and directory')

pc = d.node('pc', 110, 300, C['client'], 'Clients', 'office VLAN')
dc = d.node('server', 290, 300, C['dc'], 'Local server', 'DNS, DHCP', badge='AD')
gw = d.node('router', 470, 300, C['wan'], 'Site gateway', 'tunnels to the cloud')
lp = d.node('laptop', 110, 640, C['client'], 'Laptop', 'agent installed')
ia = d.node('zia', 920, 300, C['zia'], 'Internet access', 'inspection · filtering', r=42)
pa = d.node('zpa', 920, 600, C['zpa'], 'Private access', 'per-app tunnels', r=42)
web = d.node('globe', 1150, 450, C['inet'], 'Internet', 'SaaS, websites')
ac = d.node('appc', 1420, 600, C['appc'], 'App Connector', 'outbound only')
app = d.node('server', 1620, 600, C['azure'], 'Applications', 'ERP · file shares')
ad = d.node('server', 1620, 300, C['azure'], 'Directory', 'primary DC', badge='AD')

d.connect(pc, dc, 'lan', arrow=False, width=2.6)
d.connect(dc, gw, 'lan', arrow=False, width=2.6)
d.connect(gw, ia, 'zia')
d.connect(gw, pa, 'zpa')
d.connect(lp, pa, 'zpa')
d.connect(ia, web, 'inet')
d.connect(ia, pa, 'zpa')
d.connect(ac, pa, 'zpa', dash='8 6')
d.connect(ac, app, 'lan', arrow=False, width=2.6)
d.connect(ac, ad, 'lan', arrow=False, width=2.6)

x = 40
for kind, dash, label in (('zia', None, 'To internet access'), ('zpa', None, 'Private access'),
                          ('zpa', '8 6', 'Connector to private access'), ('inet', None, 'Internet'),
                          ('lan', None, 'Local network')):
    line = d.connector(f'M{x} 930 L{x + 46} 930', FLOW[kind], width=3.5, dash=dash, arrow_end=False)
    t = d.text(x + 58, 935, label, 14, 400, C['ink'], 'start')
    d.group(line, t)
    x += 90 + len(label) * 7.4 + 20

out = Path(__file__).resolve().parent.parent / 'samples' / 'example-network.netdraw'
d.save(out)
print('written', out)
