# Desk Lamp

The Guide's own identity. Later screens import `tokens.css`, `type.css`, and `components.css`. They do not invent a second palette.

The product name is The Hitchhiker's Guide to Web Design. The mark is DON'T PANIC in large, friendly letters. It is an affectionate homage: no book text, no cover art, no towel clip-art, not AntiHero, not about Matt.

## Three directions

Field Manual. Fraunces and Source Serif 4. Warm newsprint, a forest stamp, the interview as a printed brief. The risk is a serif display that starts to feel like a novel, which is the cover pastiche we are not making.

Desk Lamp. Bricolage Grotesque and Literata. Brass on warm paper, a grotesque with a human wobble, a text serif for the long interview. Character: a working desk in a good studio, warm paper, a brass lamp, type with a human wobble, and the confidence to leave space empty.

Signal Flare. Gabarito and Atkinson Hyperlegible. Black and safety orange, built to be read at a glance. The risk is a safety-poster cliché, loud in the way a template is loud.

## Why Desk Lamp

Bricolage Grotesque (Mathieu Triay, SIL OFL) is friendly and slightly imperfect, so DON'T PANIC can be large without becoming a comic face or a yellow-on-black cover clone. Literata (TypeTogether, SIL OFL) is a reading face for an interview that is mostly reading. The pair is the type-led studio idea from the 2026 gallery notes: contrast of job, not a gradient of mood.

Day is paper `#f3ebdd` with a venetian stamp `#8e2f1a`. Night is a designed dark, not an invert: the stamp becomes brass `#e6a15c` and the wordmark stays ink, so the dark theme is a lamp on a desk and not the book jacket. Motion in the app is feedback only (card enter, answer accepted, map progress, toast) on native scroll. Lenis stays out of the app.

## Tokens

`tokens.css` is the source the comps load. `tokens.ts` exports the same colour, space, radius, and motion values for tests and for anything that computes a style. `design-tokens.test.ts` fails if they drift.

Colour roles: surface, ink, muted, accent, accent-ink, success, warning, danger, focus. Light is the default. Dark follows `prefers-color-scheme` unless `data-theme="light"` or `data-theme="dark"` is set. Focus is ink on paper and light cream in the dark, separate from the venetian accent, so the ring stays visible on the filled Answer button.

Space is a 4px base: 0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Radius is 2, 4, 10, and a pill. Type sizes are `clamp()` from 375 to 1440. Shadows have a light set and a dark set.

## Type

See `public/fonts/OFL.md`. Display 800 at optical size 96. UI 600 at optical size 16. Text 400, italic 400, and semibold 600, all at optical size 16. `@font-face` uses `font-display: swap` and a relative URL from this folder to `public/fonts/`. If a file is missing, the face does not silently become `system-ui`.

## Components

Class prefix `hh-`. Block, element, modifier.

| Class | Role |
| --- | --- |
| `hh-shell`, `hh-mast`, `hh-kicker`, `hh-dek`, `hh-wordmark` | Page frame, mast, label, lede, masked wordmark |
| `hh-routes` | Desk route row. Uppercase links, current page underlined in the accent. Not a button row |
| `hh-read`, `hh-read--board` | Reading measure, and the wider board for gallery and motion |
| `hh-wordmark--plate`, `hh-wordmark--quiet` | Reveal size, and the smaller stamp on the dashboard |
| `hh-log`, `hh-turn`, `hh-turn__who`, `hh-turn--you` | Transcript. The visitor's line is italic, not a chat bubble |
| `hh-qcard`, `hh-qcard__title`, `hh-qcard__why`, `hh-qcard__body`, `hh-qcard__actions` | Question card. Body wraps, including long German |
| `hh-site`, `hh-site__shot`, `hh-site__title`, `hh-site__note`, `hh-vote` | Example-site card. Shot, title, one note, love / meh / hate |
| `hh-map`, `hh-map__item`, `hh-map__item--current`, `hh-map__meter` | Guide map. Rail on the right from 1100px |
| `hh-status` | Status line |
| `hh-btn`, `hh-btn--primary`, `hh-btn--secondary`, `hh-btn--ghost` | Buttons. Minimum 44px, focus ring on `:focus-visible` |
| `hh-approval` | Approve and Redo |
| `hh-table`, `hh-table-wrap` | Dashboard table. Stacks under 640px via `data-label` |
| `hh-empty`, `hh-error` | Empty and error. A left spine, not a dashed box. Each has a next step |
| `hh-swatch`, `hh-specimen`, `hh-voice` | Brand-kit plate |

## Motion

`motion.ts` is a small layer over GSAP core. `enter`, `confirmPulse`, `mapProgress`, and `toast` import `gsap` inside the function so an unused call can tree-shake. `prefersReducedMotion()` reads `prefers-reduced-motion: reduce`. When it matches, each function settles the element and resolves on the same turn, and does not import GSAP. If `matchMedia` is missing, motion is allowed. That is the Node default. Tests stub the media query.

GSAP core does not take a CSS `cubic-bezier()` without CustomEase, so the tweens use built-in eases that match the tokens: `power3.out`, `power2.inOut`, and `back.out(1.4)`. CSS transitions use the cubic-bezier custom properties. The comps' entrance (`hh-rise`) is a short translate, gated by `prefers-reduced-motion: no-preference`, with no `!important`. The type stays visible on the first frame.

## Wordmark

`wordmark.svg` is the display face outlined to paths (opentype.js, dev-only) so the mark renders without the font. View box `0 0 1090.69 150.80`, title "Don't Panic". The string is DON'T PANIC with a typographic apostrophe. The path is filled white and shifted into that box so a CSS mask can use it. Chromium does not paint an external SVG mask from a file URL, so `components.css` inlines the same file as a data URI. The element background is `--color-ink`, which keeps the mark on paper by day and in lamp-light by night.

## Comps

Each file links only `tokens.css`, `type.css`, and `components.css`.

- `comps/desk.html` is the conversation desk. Transcript, DP-1.1 (logo), Answer / Suggest for me / Skip, two reference plates, a filled Guide map, status.
- `comps/dashboard.html` is the `/hh-dashboard` skeleton for the Towel and Tea fixture. Queue table, an empty escalations state, one paused type-check error. No invented Lighthouse score.
- `comps/brand-kit.html` is the reveal plate. Wordmark, type specimen, five materials, Approve / Redo.

Copy rules live in `voice.md`.

## Screenshot review

Reviewed at 375, 768, and 1440, day and night, after the fixes below. Every PNG is under 400 KB and is committed.

- The first wordmark was an empty box. A negative view box plus `currentColor` disappeared inside a file-URL mask, which Chromium does not paint. The glyphs were shifted into a positive view box, filled white, and inlined. Counters in D, O, A, and P, and the apostrophe, read as letters.
- Example-site plates used a side strip. The monogram sat at the foot of a tall bar, and Love / Meh / Hate wrapped into a column at 768. The plate is now a top band, and the three votes stay on one row.
- A full-page noise veil did not show at screenshot scale and pushed frames over 400 KB. It came out.
- At 1440 the map sat on the far edge with a hole between it and the interview. From 1100px the map sits beside a 44rem column. The remaining paper stays empty.
- The Paper swatch gained a hairline so it does not vanish on the paper page.
- The brand-kit status line now reads Desk Lamp, Plate 01, Self-hosted type.
- The dashboard uses the quiet mark so `/hh-dashboard` stays the title.
- The German question wraps inside the card at 375. No horizontal overflow.
- Night is brass on a warm black. It is not an invert of the day stamp, and the wordmark stays ink.
