# Changelog

## 1.3.1 — 2026-10-08

- Menus tidied up:
  - on/off settings now show a check mark that follows the real state: Export in dark colours, Show grid, Show rulers,
    Snap to grid and guides, Full screen, Show drawing dark in dark theme
  - Theme and Interface size show which choice is active
  - one wording everywhere (menu bar, Export menu, right-click menu, tooltips): "Export as PNG (2×, screen and
    Word)…", "Zoom to fit", "Zoom to 100%", "Align centre", "Image or logo…", "Keyboard and mouse shortcuts"; "…" only
    where a dialog follows

## 1.3.0 — 2026-10-07

- Export to Visio (`.vsdx`): Export → Visio drawing. The drawing opens in Microsoft Visio as real, editable shapes:
  - every icon is a group (disc, symbol, label, badge) that you can move, resize and recolour
  - containers, notes, text and markers are normal Visio shapes with editable text
  - lines are glued to the icons they were attached to in NetDraw, so they follow when you move an icon in Visio;
    arrowheads and line labels are part of the line
  - the page has the same paper size, so it prints the same
  - positions, sizes and colours are the same as in the other exports. Text uses Segoe UI (a font every Windows PC
    has), and dashed lines use Visio's own dash patterns, so those two are close rather than identical.
  - Microsoft icons and pictures are embedded as images; everything else is vector
  - the conversion is one-way: keep the `.netdraw` file as the source
  - checked in Visio 2024 (desktop) and against Microsoft's file-format specification
- Also on the command line (`--out drawing.vsdx`, optional `--font "IBM Plex Sans"`) and in the MCP `export` tool.
- PNG, PDF, SVG and "copy as image" are unchanged.

## 1.2.3 — 2026-10-05

- Update check: once a day at startup NetDraw asks GitHub whether a newer release exists and shows a small
  "Update available" button in the toolbar that opens the download page. It never downloads or installs anything
  itself. Help → Check for updates checks on demand and has the switch to turn the automatic check off.

## 1.2.2 — 2026-10-05

- Export in dark colours: a switch in the Export menu. PNG, PDF, SVG and "copy as image" then come out dark, with
  the same colours as the dark preview; the PDF and SVG stay vector. White remains the default.
  Command line: `--dark`; MCP: `dark: true` on `export` and `render_preview`.
- Presentation mode (F5 or the screen button in the toolbar): hides the toolbar, panels, rulers and handles, and
  shows the drawing in the whole window, view-only, for screen sharing. Drag pans, scrolling zooms, D switches
  dark/light, F11 goes full screen, Esc returns to editing.

## 1.2.1 — 2026-10-01

- Vendor icons, kept to the well-known ones:
  - 31 brand logos (Cisco, Fortinet, Palo Alto Networks, Cloudflare, Okta, VMware, Proxmox, Docker, Kubernetes, …), each a disc in the brand colour
  - 26 Microsoft icons (Entra ID, Private/Internet Access, Conditional Access, Intune, Defender for Cloud, Sentinel, Azure networking and compute)
  - 6 example vendor devices (FortiGate, Cisco router/switch, Palo Alto firewall, UniFi access point, Cloudflare Tunnel)
- "Vendor logo" on any icon: the disc takes the vendor colour and the logo becomes a small badge, so you don't
  need a separate icon for every product. Also available in the MCP (`vendor`) and the Python library (`vendor=`).
- Third-party terms listed in NOTICE.md.

## 1.2.0 — 2026-10-01

- Built-in MCP server (`NetDraw.exe --mcp`): AI assistants such as Claude Desktop and Claude Code can build and change
  drawings: live in the open window (every change is an undo step) or directly in .netdraw files. Tools: style guide,
  read drawing, new drawing, add items, connect, update, delete, legend, preview image, export, save, open.
- Help → Connect an AI assistant: one click adds NetDraw to Claude Desktop; copyable setup for Claude Code and other clients.
- Resize handles: corners scale icons (lines stay attached to the disc edge; Shift also scales the label), text and
  markers; side handles set the wrap width of a text.
- Fixed: drawings started from a template lost the binding between lines and icons.

## 1.1.0 — 2026-10-01

- Dark mode (light / dark / follow Windows). The drawing is previewed dark, exports stay white.
- 87 generic icons in 10 groups, with search; generic names throughout (no vendor-specific labels).
- Paper sizes A4–A0 (portrait/landscape), slide and wide overview, with millimetre rulers and a print scale of
  1 px = 0.2 mm. A3 landscape is the new default page.
- Export: PNG for print (300 dpi), vector PDF at paper size; the export menu shows the resulting size.
- Line labels, 4 extra line styles (VPN, management, replication, blocked), your own saved line styles.
- Notes and text boxes with wrapping text; automatic legend of the line styles in use.
- New-drawing dialog with five templates (network overview, flow comparison, Zero Trust access, hub and spoke WAN,
  workshop whiteboard).
- Autosave every 15 s with recovery after a crash; find (Ctrl+F); interface size 100–150 %.
- Orthogonal routing no longer doubles back; lines leave below an icon's label; connectors between aligned icons
  keep both ends attached.
- Python library: paper sizes, generic line styles, labels, notes, legend, orthogonal routing.

## 1.0.0 — 2026-10-01

- First release: drag-and-drop editor, icon library, containers, connectors that follow icons, smart guides,
  groups, z-order, undo/redo, inline text editing, PNG/SVG export, copy as image, command-line export,
  per-user Windows file association.
