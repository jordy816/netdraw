#!/usr/bin/env python3
"""Build src/js/vendor.js (brand and Microsoft icons) and python/vendor.json.

Sources:
- Simple Icons (npm devDependency `simple-icons`, CC0): single-colour brand marks + brand colours.
- Microsoft Entra architecture icons and Azure public service icons (official downloads, Microsoft terms:
  permitted for architecture diagrams, training material and documentation). Zips are cached in vendor-src/.

usage: python3 tools/make-vendor.py
"""
import json
import re
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SI = ROOT / 'node_modules' / 'simple-icons'
CACHE = ROOT / 'vendor-src'
ZIPS = {
    'entra.zip': 'https://download.microsoft.com/download/3/1/a/31a56038-856a-4489-88e4-ee5a1c4352be/Microsoft%20Entra%20architecture%20icons%20-%20Oct%202023.zip',
    'azure.zip': 'https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip',
}

BRAND_GROUPS = [
    ('Brands', [
        'cisco', 'fortinet', 'paloaltonetworks', 'junipernetworks', 'ubiquiti', 'mikrotik', 'pfsense', 'f5', 'citrix',
        'cloudflare', 'akamai', 'okta', 'splunk', 'wireguard', 'openvpn', 'tailscale',
        'google', 'googlecloud', 'vmware', 'proxmox', 'docker', 'kubernetes', 'redhat', 'linux', 'apple', 'android',
        'synology', 'veeam', 'github', 'sap', 'zoom']),
]

# (label, zip, folder or None, file stem)
MS = [
    ('Microsoft', [
        ('Entra ID', 'entra', None, 'Microsoft Entra ID color icon'),
        ('Entra Private Access', 'entra', None, 'Microsoft Entra Private Access color icon'),
        ('Entra Internet Access', 'entra', None, 'Microsoft Entra Internet Access color icon'),
        ('Conditional Access', 'azure', 'security', 'Conditional-Access'),
        ('Entra Connect', 'azure', 'identity', 'Entra-Connect'),
        ('Intune', 'azure', 'intune', 'Intune'),
        ('Defender for Cloud', 'azure', 'security', 'Microsoft-Defender-for-Cloud'),
        ('Microsoft Sentinel', 'azure', 'security', 'Azure-Sentinel'),
        ('Key Vault', 'azure', 'security', 'Key-Vaults'),
        ('Virtual network', 'azure', 'networking', 'Virtual-Networks'),
        ('Azure Firewall', 'azure', 'networking', 'Firewalls'),
        ('VPN gateway', 'azure', 'networking', 'Virtual-Network-Gateways'),
        ('ExpressRoute', 'azure', 'networking', 'ExpressRoute-Circuits'),
        ('Virtual WAN', 'azure', 'networking', 'Virtual-WANs'),
        ('Application Gateway', 'azure', 'networking', 'Application-Gateways'),
        ('Front Door', 'azure', 'networking', 'Front-Door-and-CDN-Profiles'),
        ('Load Balancer', 'azure', 'networking', 'Load-Balancers'),
        ('Bastion', 'azure', 'networking', 'Bastions'),
        ('Virtual machine', 'azure', 'compute', 'Virtual-Machine'),
        ('AKS', 'azure', 'compute', 'Kubernetes-Services'),
        ('App Service', 'azure', 'compute', 'App-Services'),
        ('Storage account', 'azure', 'storage', 'Storage-Accounts'),
        ('SQL Database', 'azure', 'databases', 'SQL-Database'),
        ('Log Analytics', 'azure', 'management + governance', 'Log-Analytics-Workspaces'),
        ('Azure Arc', 'azure', 'management + governance', 'Azure-Arc'),
        ('Subscription', 'azure', 'general', 'Subscriptions'),
    ]),
]

# Device = generic icon in the vendor's colour with the vendor's logo as a badge.
DEVICES = [
    ('fortinet', 'firewall', 'FortiGate'), ('cisco', 'router', 'Cisco router'), ('cisco', 'switch', 'Cisco switch'),
    ('paloaltonetworks', 'firewall', 'Palo Alto firewall'), ('ubiquiti', 'ap', 'UniFi access point'),
    ('cloudflare', 'vpn', 'Cloudflare Tunnel'),
]


def light(hexcol):
    r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62


def minify_svg(s):
    s = re.sub(r'<\?xml[^>]*\?>|<!--.*?-->|<title>.*?</title>|<desc>.*?</desc>', '', s, flags=re.S)
    return re.sub(r'>\s+<', '><', s).strip()


def main():
    data = {d['slug']: d for d in json.loads((SI / 'data' / 'simple-icons.json').read_text())}
    brands, groups, colors = {}, [], {}
    for name, slugs in BRAND_GROUPS:
        keys = []
        for slug in slugs:
            if slug not in data:
                print('skip (not in Simple Icons):', slug)
                continue
            svg = (SI / 'icons' / f'{slug}.svg').read_text()
            d = re.search(r'<path d="([^"]+)"', svg).group(1)
            key = f'b-{slug}'
            brands[key] = {'title': data[slug]['title'], 'hex': '#' + data[slug]['hex'], 'd': d}
            colors[key] = {'color': '#' + data[slug]['hex'], **({'glyphColor': '#0F172A'} if light(data[slug]['hex']) else {})}
            keys.append(key)
        groups.append([name, keys])

    CACHE.mkdir(exist_ok=True)
    zips = {}
    for fname, url in ZIPS.items():
        p = CACHE / fname
        if not p.exists():
            print('download', url)
            urllib.request.urlretrieve(url, p)
        zips[fname.split('.')[0]] = zipfile.ZipFile(p)
    ms = {}
    for name, entries in MS:
        keys = []
        for label, z, folder, stem in entries:
            zf = zips[z]
            cand = [n for n in zf.namelist() if n.lower().endswith('.svg')
                    and (folder is None or n.split('/')[-2] == folder)
                    and re.sub(r'^\d+-icon-service-', '', n.split('/')[-1])[:-4] == stem]
            if not cand:
                print('skip (not found):', label)
                continue
            key = 'ms-' + re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
            ms[key] = {'title': label, 'svg': minify_svg(zf.read(cand[0]).decode('utf-8'))}
            colors[key] = {'color': '#FFFFFF', 'ring': '#CBD5E1'}
            keys.append(key)
        groups.append([name, keys])

    devices = [{'key': f'd-{brand}-{glyph}', 'brand': f'b-{brand}', 'glyph': glyph, 'label': label}
               for brand, glyph, label in DEVICES if f'b-{brand}' in brands]
    js = ('// Generated by tools/make-vendor.py. Do not edit.\n'
          '// Brand marks: Simple Icons (CC0-1.0); trademarks belong to their owners.\n'
          '// Microsoft icons: Microsoft Entra / Azure architecture icons, used under Microsoft\'s terms (architecture\n'
          '// diagrams, training material, documentation). See NOTICE.md.\n'
          f'export const BRANDS = {json.dumps(brands, separators=(",", ":"))};\n'
          f'export const MSICONS = {json.dumps(ms, separators=(",", ":"))};\n'
          f'export const VENDOR_GROUPS = {json.dumps(groups)};\n'
          f'export const VENDOR_DEVICES = {json.dumps(devices)};\n'
          f'export const VENDOR_COLORS = {json.dumps(colors, separators=(",", ":"))};\n')
    (ROOT / 'src' / 'js' / 'vendor.js').write_text(js)
    (ROOT / 'python' / 'vendor.json').write_text(json.dumps({'colors': colors, 'devices': devices}, indent=1))
    print(f'{len(brands)} brands, {len(ms)} Microsoft icons, {len(devices)} devices; vendor.js {len(js) // 1024} KB')


if __name__ == '__main__':
    main()
