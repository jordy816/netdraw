# Third-party material

NetDraw itself is MIT-licensed (see `LICENSE`). These bundled assets keep their own terms:

| Material | Where | Terms |
|---|---|---|
| IBM Plex Sans fonts | `src/fonts/` | SIL Open Font License 1.1, see `src/fonts/OFL.txt` |
| Brand marks (Cisco, Fortinet, Cloudflare, …) | `src/js/vendor.js` (`BRANDS`) | [Simple Icons](https://simpleicons.org), CC0-1.0. The logos are trademarks of their owners; use them to refer to the products, following each brand's guidelines. Inclusion does not imply endorsement. |
| Microsoft Entra and Azure icons | `src/js/vendor.js` (`MSICONS`) | Microsoft architecture icons. Microsoft permits their use in architectural diagrams, training materials and documentation, and allows copying and distribution only for that use. They are not covered by NetDraw's MIT licence. Sources: Microsoft Entra architecture icons (Oct 2023) and Azure public service icons V24. |

`tools/make-vendor.py` regenerates `src/js/vendor.js` from these sources.
