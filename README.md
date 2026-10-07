# NetDraw

A Windows desktop editor for network and architecture diagrams: coloured icon discs, light containers, flow lines
with arrowheads, numbered steps and a legend. You build a diagram by drag and drop, then export it as a PNG for
Word, a PDF for print, an SVG, or a Visio drawing for people who work in Visio.

It is built for working live, in a meeting: fast to draw, consistent in style, and readable on screen and on A3.

![NetDraw](docs/screenshot.png)

## Install (Windows)

Download from [Releases](https://github.com/jordy816/netdraw/releases/latest):

- `NetDraw-Setup-<version>.exe`: an installer, with a Start-menu entry, and `.netdraw` files open with a double-click.
- `NetDraw-<version>-win-x64.zip`: unzip it anywhere and start `NetDraw.exe`. **Help → Set up on this PC** adds the
  shortcut and the file association afterwards; it needs no admin rights.
- `NetDraw-<version>-portable.exe`: a single file, but it starts slower.

The builds are not code-signed, so SmartScreen may ask "Run anyway" the first time.

## What you can do

| | |
|---|---|
| **Icons** | 87 generic icons in 10 groups (users, network, security, SSE/SASE, servers, data, places, OT, symbols), in three sizes: *Overview*, *Flow*, *Document*. Plus 31 brand logos (Cisco, Fortinet, Cloudflare, …), 26 Microsoft icons (Entra, Intune, Azure), and a *Vendor logo* badge for any icon. You can also put your own logo inside a disc. |
| **Containers** | Site, cloud service, cloud hub, data centre, DMZ, trusted zone, management, section band, note, text box, pill. Dragging a container moves everything inside it. |
| **Lines** | Drag from an icon's blue dot to another icon. Lines stay attached when icons move. Route them as curve, orthogonal or straight. There are 16 line styles with generic names, and you can save your own. A line can carry a label. |
| **Explaining** | Numbered markers, `?` / `!` markers, notes with wrapping text, and a legend built from the line styles you used. |
| **Layout** | Grid and snapping to other items, align / distribute, groups, lock, z-order, and rulers in millimetres. Corner handles resize icons, text and markers. |
| **Paper** | A4–A0 portrait/landscape, slide 16:9, and a wide overview size. The print scale is 1 px = 0.2 mm, so you always know what fits on A3. |
| **Export** | PNG 2× for Word, PNG at 300 dpi for print, a vector PDF at paper size, SVG with the fonts embedded, and a Visio drawing (`.vsdx`) with editable shapes. *Copy as image* (`Ctrl+Shift+C`) pastes straight into Word. *Export in dark colours* gives the same exports on a dark background. |
| **Presenting** | Presentation mode (`F5`) hides all tools and shows the drawing view-only in the whole window, for screen sharing. `F11` is full screen, `Esc` goes back to editing. |
| **Comfort** | Dark mode: the drawing is previewed dark, exports stay white. Autosave and crash recovery, templates, find (`Ctrl+F`), and an adjustable interface size. A daily update check points you to new releases (it can be switched off; nothing is installed automatically). |

**Help → Keyboard and mouse** has the full list of shortcuts.

## Visio

**Export → Visio drawing** writes a `.vsdx` file that opens in Microsoft Visio (2013 or newer, and Visio for the web)
as real shapes, not as a picture:

- An icon is a group: disc, symbol, label and badge. Move it, resize it, recolour it, edit the label.
- Containers, notes, texts and markers are ordinary shapes with editable text.
- Lines stay attached to the icons they were attached to in NetDraw. Move an icon in Visio and its lines follow.
  Arrowheads and line labels belong to the line.
- The page has the same paper size, so it prints the same.

What differs from the PNG and PDF exports:

- **Text** uses Segoe UI, which every Windows PC has. IBM Plex Sans cannot be embedded in a Visio file; if it is
  installed on the PCs that open the file, export from the command line with `--font "IBM Plex Sans"`.
- **Dashed lines** use the nearest built-in Visio dash pattern, so the dash lengths differ slightly.
- **Pictures and the Microsoft icons** are embedded as images. Everything else is vector.
- It is one-way. NetDraw does not read Visio files, so keep the `.netdraw` file as the source.

## AI assistants (MCP)

NetDraw has a built-in [MCP](https://modelcontextprotocol.io) server, so an AI assistant can draw for you. Ask for
something like "draw our two branch offices, the firewall and the internet, then show me a preview":

- **Live:** with NetDraw open, the assistant works on the drawing in the window and you watch it happen. Every change
  is an undo step, so `Ctrl+Z` takes it back.
- **Files:** with a `file` argument it works on a `.netdraw` file directly. NetDraw doesn't have to be open for this.
- **Preview:** it can see a picture of the drawing (`render_preview`), so it checks its own layout.

**Setup:**

- **Claude Desktop:** open **Help → Connect an AI assistant → Add to Claude Desktop**, then restart Claude Desktop.
- **Claude Code:** `claude mcp add --scope user netdraw -- "C:\path\to\NetDraw.exe" --mcp`
- **Any other MCP client:** run `NetDraw.exe` with the argument `--mcp` (stdio transport).

**Tools:**

- `get_style_guide`: icons, line styles, containers and layout rules. The assistant starts here.
- `get_drawing`: everything in the drawing.
- `new_drawing`: a new page, by paper size.
- `add_items`: icons, containers, notes, texts and markers.
- `connect`: a line between two icons, routed automatically and attached to both ends.
- `update_items` / `delete_items`: change or remove items.
- `add_legend`: a legend of the line styles used.
- `render_preview`: a PNG image of the drawing.
- `export`: write a PNG, PDF, SVG or Visio (`.vsdx`) file.
- `save`: save the drawing open in NetDraw.
- `open_in_netdraw`: open a file in the NetDraw window.

## Command line

```
NetDraw.exe drawing.netdraw                                     open a file
NetDraw.exe --export drawing.netdraw --out drawing.png --scale 2   (add --dark for dark colours)
NetDraw.exe --export drawing.netdraw --out drawing.pdf          vector, at paper size
NetDraw.exe --export drawing.netdraw --out drawing.svg
NetDraw.exe --export drawing.netdraw --out drawing.vsdx         Visio drawing (add --font "IBM Plex Sans" to keep that font)
NetDraw.exe --setup                                             Start-menu shortcut + .netdraw association
NetDraw.exe --mcp                                               MCP server on stdio (for AI assistants)
```

On Linux (headless): `tools/nd-export.sh drawing.netdraw drawing.png 2`.

## Drawings from scripts

`python/netdraw.py` writes `.netdraw` projects in the same house style, so generated drawings stay editable:

```python
import sys; sys.path.insert(0, 'python')
from netdraw import Doc, PALETTE as C
d = Doc(paper_size='A3', title='Example', style='overview')
a = d.node('pc', 300, 400, C['client'], 'Client', 'PC or server')
b = d.node('server', 700, 400, C['dc'], 'Local DC', badge='AD')
d.connect(a, b, 'zia', label='HTTPS')      # routed, labelled, bound to both icons
d.legend(40, 1400)
d.save('example.netdraw')
```

See `python/example.py` and `python/templates.py`. Flow keys, icon keys and style rules are listed by the MCP tool
`get_style_guide`, and in [`docs/claude-skill/SKILL.md`](docs/claude-skill/SKILL.md), a Claude Code skill you can copy to
`~/.claude/skills/netdraw/`.

## File format

`.netdraw` is JSON. It holds a `page` object (size, background, font, grid, print scale) and an ordered `items` list,
from back to front. The item types are:

- `node`: icon disc + label
- `zone`: container, optionally with wrapping `body` text
- `connector`: SVG path, optional `from`/`to` binding to icons, optional `label`
- `text`: optional `wrap` width
- `badge`
- `path`
- `circle`
- `image`

Coordinates are page pixels, and text `y` is the baseline.

## Development

```
npm install
npm start                      run the editor (Linux: unset ELECTRON_RUN_AS_NODE first)
npm test                       unit tests (path maths, model, renderer, Python/app parity)
xvfb-run -a node tools/ui-test.mjs <file> /tmp     end-to-end UI tests (also ui-test2, ui-test3)
node tools/verify.mjs a.netdraw original.png        pixel-compare a project with a reference image
node tools/glyph-sheet.mjs icons.png               contact sheet of every icon
npx electron-builder --win --x64                    Windows zip + portable exe (works on Linux, no Wine)
```

The GitHub Actions workflow builds the Windows installer, zip and portable exe on every `v*` tag and attaches them
to a release.

### Code map

- `app/`: Electron main process and preload. Handles file dialogs, PNG/PDF rendering, the command line and autosave.
- `src/js/render.js` + `glyphs.js`: document → SVG. **Keep this output stable**: the reference drawings are
  verified pixel-exact against it.
- `src/js/editor.js`: the canvas, selection, guides, connectors and rulers.
- `src/js/props.js`: the panel on the right.
- `src/js/palette.js`: the panel on the left.
- `src/js/presets.js`: the house style (palette, icon styles, containers, line styles, paper sizes).
- `src/js/path.js`: path maths and routing.
- `src/js/model.js`: document operations.
- `src/js/textmetrics.js` + `metrics.js`: font metrics for wrapping and legends.
- `src/js/vsdx.js` + `app/zip.js`: the Visio export. It reads the shapes back from the renderer's SVG, so it follows
  the drawing automatically; `tools/vsdx-build.mjs` builds a `.vsdx` without Electron for tests.

## Licence

MIT, see `LICENSE`. Bundled third-party material (brand marks, Microsoft icons, fonts) keeps its own terms; see
`NOTICE.md`. The IBM Plex Sans fonts in `src/fonts/` are © IBM Corp. and licensed under the SIL Open Font
License 1.1 (`src/fonts/OFL.txt`).
