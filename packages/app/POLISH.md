# Polish pass

Agency pass on the Guide app. Screens were shot at 375, 768, and 1440, light and dark, before any visual change, then again after the fixes. The critique is a vision read of those PNGs against the Desk Lamp comps and the anti-slop rulebook. Schema for each screen: issues of severity, area, and fix. A request for a new feature is listed under out of scope.

Before PNGs stayed in `e2e/screens/polish-before/` (gitignored). After PNGs are `e2e/screens/polish/` (gitignored). `polish.spec.ts` visits every route from `listAppRoutes()`.

## Scores

Axe, via `@axe-core/playwright` already in `@hitchhiker/qa`: clean on every shot. Serious, critical, and moderate block. Minor does not. The run is `e2e/polish.spec.ts`.

Lighthouse 12.6.1, simulated, Playwright Chromium, one run each. Mobile is the phone gate (all four categories at 90 or more).

| Route | Form | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| `/` | mobile | 99 | 100 | 100 | 100 |
| `/brand` | mobile | 100 | 100 | 100 | 100 |
| `/approve` | mobile | 100 | 100 | 100 | 100 |
| `/gallery` | mobile | 100 | 100 | 100 | 100 |
| `/hh-dashboard` | mobile | 99 | 100 | 100 | 100 |
| `/motion` | mobile | 99 | 96 | 100 | 100 |
| `/` | desktop | 100 | 100 | 100 | 100 |

Before we jump is a second loopback server. It uses the same shell, tokens, and fonts, and axe on both of its states was clean. Lighthouse was measured on the desk origin.

## Fixes applied

- Route row is `hh-routes`: uppercase tracked links, accent underline on the current page, 44px targets. The label for `/hh-dashboard` is Drive. The question card's `hh-qcard__actions` is unchanged. Elevate stays the control name.
- Empty and error states use a left spine (accent, or danger) instead of a dashed box.
- `aria-disabled` and disabled buttons read as unavailable in the chrome, not only inside the drive.
- Gallery and motion use `hh-read--board` (72rem). Motion frames fill a two-column grid from 768px.
- Entrance `hh-rise` is a short translate. Type is visible on the first frame.
- Focus rings on gallery cards are not clipped: the card overflows visible, the shot clips.
- Before-we-jump map notes name the phase. The current step still says "Before we jump".
- Served pages get a description, a favicon, and two font preloads. The before-we-jump server now serves the woff2 files and the icon. The desk serves `/favicon.svg` and `/favicon.ico`.
- The queue error page loads `/client/theme.js` instead of an inline script, so the desk CSP stays `script-src 'self'`. The default drive document still carries the inline theme script the unit test locks.
- The desk HTML loads `/client/motion.js` only when the open question is DP-6. Later questions inject that script from the desk client.
- Gallery has one `h1`. Before we jump has one `h1`. Drive and the approval gate each have one `main`.

## Screens

### Desk, question (`/`)

Before: paper, wordmark, and the question card were already on system. High: the route row was a boxed current button plus plain links, and one label was the raw path `/hh-dashboard`. At 375 the row wrapped into a ragged pair of lines.

After: one tracked route row, Desk underlined, Drive as the label. At 375 the links wrap onto two even rows. Dark mode keeps brass on warm black. No high issues remain.

### Gallery walk (`/gallery`, walk)

Before: cards were on system and stuck in a 40rem column, so 1440 was mostly empty paper. High for a dense board.

After: a 72rem board, two columns of cards, same votes and Keep this. Reduced-motion stills are the shot treatment, not a missing feature. No high issues remain.

### Gallery empty (`/gallery`, empty)

Before: dashed "No sites matched" box. High.

After: accent spine, the next step still tells you to reload or widen the filter, and the page has a real `h1`. Dark mode holds. No high issues remain.

### Motion (`/motion`)

Before: frames capped at 320px inside the narrow column, so a desktop looked like a phone stack. High.

After: two columns from 768, frames fill the cell, links keep the accent underline. Stills say "Still. Motion is reduced." because the spec forces reduced motion. No high issues remain.

### Brand kit, empty (`/brand`)

Before: the headline was strong. The dashed "No kit on the desk" box looked like a default empty state. High.

After: accent spine under the specimen. The measure stays narrow on purpose. No high issues remain.

### Brand kit, filled (fixture, not a route)

Before: purpose, type, palette, and Approve / Redo already read as a plate. No high issue. Swatch hexes stay the locked inline values.

After: same plate, favicon injected only in the e2e fixture so the shot does not 404. No high issues remain.

### Approvals, empty (`/approve`)

Before: dashed empty box. Approve still looked like a filled primary while `aria-disabled`. Redo looked outlined. High, including dark.

After: spine empty state. Both waiting controls are muted outlines. No high issues remain.

### Approval gate (fixture, not a route)

Before: North Glass, three yeses, and the prompt list were on system. No `main` landmark (moderate axe).

After: one `main`. Buttons and swatch rows are the existing markup. No high issues remain.

### Drive, empty and queue (`/hh-dashboard`)

Before: queue, 04, Marvin, and the cost line were on system. Elevate stays. No `main` landmark (moderate axe). Empty review frames are missing data, not a missing component.

After: one `main`. Same queue. No high issues remain.

### Drive, error (`/hh-dashboard`, bad queue.json)

Before: the copy was styled. The inline theme script was blocked by CSP, and the document 500 is the real error status. At 375 the theme control can sit on its own line. Medium, not high.

After: danger spine, external theme module, 500 status unchanged. The theme label updates on click, not when a test sets `data-theme` by hand. No high issues remain.

### Missing (`/not-on-the-desk`)

Before: dashed error box. The document 404 is the real status.

After: danger spine and Back to the desk. Desk stays the current route because this address is not a page. No high issues remain.

### Before we jump, open and clear

Before: the card was on system. Every other phase note said "Phase". High as copy. Fonts 404ed, so the specified family was not the painted face.

After: phase notes match the desk map. The open step says "Before we jump". woff2 and the icon load. Literata and Bricolage check as loaded. Clear is the same chrome with Jump. No high issues remain.

## Out of scope

- Real review-frame images. The queue fixture has no frames.
- Motion that plays while reduced motion is on.
- A product route for the filled brand kit or the approval gate. The spec fulfills those documents.
- Reveal screens from prompt 152. The desk does not serve them.
- Any new gallery, motion, or drive feature the critique could have asked for.

## Assumptions

- The vision pass is this model reading the PNGs. A separate `think()` call was not made.
- `packages/app/index.html` was not regenerated. `renderShell()` did not change.
- The phone gate is the desk origin above. Motion stays at 96 accessibility with the libraries still mounted.
