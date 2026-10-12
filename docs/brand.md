# Desk mark

The mark is an open book on a desk edge, drawn on a 64 by 64 grid. Cream is the paper, ink is the page and the desk slab, and one rust block is the accent. The geometry is original. It does not copy a book cover, a film frame, or a publisher logo. The Don't Panic letters beside the mark are the existing outlined wordmark.

Palette, taken from the desk tokens:

| Role | Light | Dark |
| --- | --- | --- |
| Paper | #f3ebdd | #12100e |
| Ink | #1c1612 | #f4ede3 |
| Rust | #8e2f1a | #e6a15c |

Contrast, computed the WCAG way:

- Ink on cream is 15.12:1. Rust on cream is 6.90:1. Both clear 4.5:1 for a body-size mark.
- Dark ink on dark paper is 16.34:1. Brass on dark paper is 8.69:1. Both clear 4.5:1.
- Theme color is the rust accent. Against the page it is 6.90:1 in light and 8.69:1 in dark, above the 3:1 bar for a large mark.

Clear space is one quarter of the mark: 16 units on the 64 grid, when the mark sits on another field. On an icon tile the paper is the field. Maskable icons keep that tile inside the central 80 percent, on a full-bleed rust ground.

Regenerate the PNG files, the ICO, the lockup, and the social card with `pnpm --filter @hitchhiker/app run brand-assets`. The script reads the SVG mark and the outlined wordmark. Icon tiles are screenshots in the repo's Chromium. The lockup and the social card are drawn from those outlines, including Literata's glyph outlines, so a second run keeps the same PNG bytes on Windows, macOS, and Linux. It does not call an external service.
