---
name: netdraw
description: Make network, architecture, data-flow and process diagrams as editable NetDraw drawings in one consistent house style, and export them as PNG/PDF. Use whenever the user asks for a diagram, network drawing, architecture overview, flow or a figure for a document.
---

# netdraw

NetDraw drawings stay editable for the user, and every drawing looks like the others. Never hand-write SVG, draw.io XML,
Mermaid or matplotlib for these diagrams.

## Two ways in

- **MCP (preferred):** if the `netdraw` MCP server is connected (`NetDraw.exe --mcp`):
  1. Call `get_style_guide`.
  2. Build with `add_items` (containers first, then icons), `connect`, markers and notes.
  3. Add `add_legend`.
  4. Check `render_preview` and fix what you see.
  5. `export` / `save`.

  Without a `file` argument you work live on the drawing open in NetDraw; with `file` you edit a `.netdraw` file directly.
- **Python:** `python/netdraw.py` from the NetDraw repository (`Doc`, `node`, `zone`, `connect`, `note`, `legend`,
  `save`), then export with `NetDraw.exe --export x.netdraw --out x.png --scale 2` (or `.pdf`). On Linux use
  `tools/nd-export.sh`.

## House style

- **Page and grid:** pixels at 1 px = 0.2 mm; A3 landscape is 2100 × 1485. Put coordinates on multiples of 10.
- **Titles:** title text preset at (40, 54), subtitle at (40, 84).
- **Icon styles:**
  - `overview`: compact.
  - `flow`: larger, for step-by-step flows with numbered notes.
  - `document`: large labels, for figures shown small in a document.
  - Use one style per drawing.
- **Icon labels:** the name is 1–3 words; the details are at most two short lines.
- **Spacing:** keep icon centres ≥ 170 px apart in a row and ≥ 200 px apart vertically.
- **Containers:** one per site, cloud service, data centre or trust zone, with 40 px between containers.
  Read left to right: users → network/edge → cloud service → applications.
- **Lines:** use line style keys from the style guide (generic names such as WAN, internet traffic, private app access,
  VPN, management, blocked). Add a label on the line for protocols or ports.
- **Explaining flows:** numbered markers on the lines, plus a row of marker + text per step below the drawing. Use `?`
  markers for open points.
- **Legend:** always add one, at the bottom.
- **Before you deliver:** look at the preview. Lines must not cross labels or icons, and text must not stick out of
  containers. Deliver the `.netdraw` next to the image.
