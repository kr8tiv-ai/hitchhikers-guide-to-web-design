# Imagine first

The pictures come before the queue. Imagine draws a few sketches of each primary page. You pick one, ask for a change, or upload your own. The build then has to match the sketch you approved. The words stay in the HTML. A sketch is never dropped in as a page image.

The draw on the desk uses the Grok CLI you are already signed in to. It does not need an API key. The prices later in this page are only for the billed API path, and only after you turn that path on. Where a key may live is in [secrets.md](secrets.md).

## The flow

1. The interview, the brand kit, and the style guide come first. Approving the style guide needs a picked direction and the reference images the project asks for. Once `DESIGN.md` is locked, that approval asks Imagine to draw. It does not start the queue.
2. Each primary page gets three views when the defaults are on. The desktop first screen is 16:9 at 1440 by 810. The tall desktop page is 1:2 at 1440 by 2880. The phone is 9:19.5 at 390 by 845. The default is three sketches of each view. Grey bars stand where headings and copy will go.
3. Look and feel on the desk is the pick. **Use this one** approves a sketch. **Try again with these changes** appends your words and redraws that view. Numbered sketches are replaced. An upload on that view stays. **Upload my own** adds a png, jpg, or webp and does not approve it by itself. The status line says Approved, Drawing..., or Ready to pick.
4. The first prompt package waits until every primary page has an approved desktop sketch and an approved phone sketch. The tall page is included when `design.comps.long` is on. A project with no sitemap is not blocked. Footer pages are not gated. A later call that already has prompts does not ask again.
5. Later pages are drawn with the approved home desktop in view, then the page's own approved desktop when the view is not the desktop, then owner photos and reference shots. At most five pictures are sent. When the provider can take them as pictures, it does. When it cannot, the paths are written into the prompt and a note says the sketches used words only.
6. A short silent motion clip can be drafted from an approved desktop sketch for a section that moves. The desk shows the clip when the file is already recorded. **Use this motion** is the only approval that marks it for the build. A missing clip does not hold the build. `design.motionRefs.enabled` false skips the clips and the section crops.
7. Page prompts carry `VISUAL-TRUTH.md`. They have to match the composition, the spacing, the scale, the palette, and the photo treatment. The words stay live HTML from the brief and the copy.
8. When a page prompt finishes, the built page is photographed beside the approved sketch. The preview uses a free port and refuses the desk port 4175. The pair is labelled COMP and BUILD. Coarse scores cover layout, palette, and edges, and one vision pass reads the pair. Clean means no blocking fault and scores inside the floors.
9. A miss before the last round is one fix through the existing rerun, then the page is shot again. Still off after the last round, the queue pauses. The reason is `comp-mismatch` and the sentence is "The built page does not match the approved sketch." The composites stay attached. There is no silent pass. Resume is the Drive Resume that already clears a pause. There is no separate override command.
10. A prompt with no page, a page with no approved sketch, or a section that is not on a page skips the compare. The skip is logged. It is not a pass. Motion compare is a note unless `design.compare.motionBlocking` is true. ffmpeg has to be on `PATH`, or the motion compare is skipped with a logged reason. Twelve frames from the clip and twelve from the built section become the contact sheet `motion.jpg`.

## Files

| Path | What it holds |
|---|---|
| `.hitchhiker/comps.json` | Candidates, change notes, approvals, and motion clips. |
| `.hitchhiker/renders.json` | The desktop approval, kept so an older render approval stays valid. |
| `.hitchhiker/design-stages.json` | The stage record. Look and feel is one of the six stages. |
| `.hitchhiker/assets/media.json` | Provider order, and the browser and API flags. |
| `reference/comps/<slug>/<view>-N.png` | Numbered sketch. `<view>` is `desktop`, `desktop-long`, or `mobile`. N starts at 1. |
| `reference/comps/<slug>/<view>-upload-N.png` | An upload. The extension may be png, jpg, or webp. |
| `reference/comps/<slug>/motion/<sectionId>.mp4` | A motion clip. Beside it, a prompt file records the words that drew it. |
| `reference/comps/<slug>/sections/<sectionId>.png` | A crop of the tall sketch. The bands are even slices, not measured section edges. |
| `reference/renders/home.png` | Approved desktop for `/`. Other routes use the slug, so `/work/case` is `work-case.png`. |
| `reference/renders/<slug>.mobile.png` | Approved phone sketch. |
| `reference/renders/<slug>.long.png` | Approved tall page. |
| `VISUAL-TRUTH.md` | The approved paths, written at the project root for the build prompts. |
| `qa/compare/<promptId>/desktop.jpg` | COMP and BUILD side by side. `desktop-long.jpg`, `mobile.jpg`, and `motion.jpg` are the other sheets. |
| `qa/compare/<promptId>/<view>-shot.png` | The built-page shot for that view. |
| `qa/compare/<promptId>/metrics.json` | Scores, floors, rounds used, and whether the compare was clean. |
| `qa/compare/<promptId>/faults.md` | Blocking faults and notes. |
| `qa/compare/<promptId>/motion-frames/` | The extracted frames behind the motion sheet. |

`<slug>` is the file name of the desktop render without `.png`. Home is `home`.

## Config

The keys live in `.hitchhiker/config.json`, under `design`. A missing file means these defaults. Unknown keys throw. The ranges are what `parseConfig` accepts.

### `design.comps`

| Key | Default | Allowed |
|---|---|---|
| `candidates` | `3` | Integer from 1 to 4. Sketches per view. |
| `model` | `grok-imagine-image` | `grok-imagine-image`, `grok-imagine-image-2.0`, `grok-imagine-image-quality`. |
| `long` | `true` | Draw the tall desktop page as well as the fold and the phone. |

### `design.motionRefs`

| Key | Default | Allowed |
|---|---|---|
| `enabled` | `true` | `false` skips clips and crops. |
| `model` | `grok-imagine-video-1.5-lite` | `grok-imagine-video-1.5`, `grok-imagine-video-1.5-lite`, `grok-imagine-video`. |
| `seconds` | `6` | Integer from 1 to 15. |
| `resolution` | `480p` | `480p`, `720p`, `1080p`. |
| `max` | `3` | Integer from 0 to 24. Clips one site may draft. |

The clip aspect is 16:9 and `generateAudio` is false. Those two are not config keys.

### `design.compare`

| Key | Default | Allowed |
|---|---|---|
| `layoutMin` | `0.55` | 0 to 1. Coarse luminance similarity on a 32 by 18 grid. 1 is the same layout. |
| `paletteMax` | `18` | 0 to 100. Mean CIEDE2000 distance between two 5-colour palettes. |
| `edgeMax` | `0.45` | 0 to 1. Mean per-band edge-density difference. Loose, because live text adds edges. |
| `rounds` | `2` | Integer from 1 to 5. A miss before the last round is one fix, then a reshoot. |
| `motionBlocking` | `false` | `true` lets a motion miss pause the queue. `false` writes a note. |

`design.minReferenceImages` stays 6. The sketch sender still keeps at most five pictures.

`imagineBudgetUsd` defaults to 0, which means DIY until you raise it. The cap in code is 1000. An API motion quote is checked against the remaining budget. A 0 budget does not fit, and the clip is skipped with a note.

## Providers

`.hitchhiker/assets/media.json` defaults to this order, with both flags off:

```json
{
  "order": ["grok-cli", "browser", "api"],
  "browser": false,
  "api": false
}
```

A chain tries them in that order and keeps the first success.

- `grok-cli` runs when a spawn is passed. It uses the existing Grok login. No API key is attached, and `XAI_API_KEY` is left out of the child environment.
- `browser` runs only when `browser` is true. The desk settings checkbox is what turns that flag on. You sign in yourself. The desk does not read cookies or tokens.
- `api` runs only when `api` is true, a non-empty key is passed in, and a fetch implementation is passed in.

The live desk runner that draws page sketches always passes the CLI spawn and does not pass the key. `renderDeskProvider` ignores a key even if one is handed to it. So those sketches stay on the signed-in CLI, and on the browser only when that flag is on and the CLI does not draw. Turning `api` on does not move the sketch draw onto the billed key.

Section stills do read the key when `api` is true, and they can put that provider in the chain. Motion uses the CLI when a spawn is passed. It uses the API only when no spawn is passed, `api` is true, the order includes `api`, and a key is present.

`hh doctor` reports the first path in that order that can run. `grok-cli` can run whenever it is listed, so the default sentence is `Using your Grok sign-in`. A key in the environment or the keychain adds `API ready` and is not printed. Doctor names the API path when `api` is first, `api` is true, and a key is present. The sentences are in the README under [Check this computer](../README.md#check-this-computer).

## What one 5-page site costs on the API path

These figures are the card in `packages/assets/src/prices.ts`, dated 2026-09-29. Rates are integer cents. The signed-in CLI path is not on this card, so this is not the invoice for the default desk. The vision pass in the compare is a Grok CLI `think()` call, and it is not on this card either.

The worked site is five primary pages, the defaults, and the API path actually billing:

- `design.comps.long` is on, so each page has three views.
- `design.comps.candidates` is 3.
- The model is `grok-imagine-image`. On this card that model is 2 cents at the default resolution, at 1k low, and at 2k medium. One still is $0.02.
- Sketch count: 5 pages times 3 views times 3 candidates = 45 stills.

An edit is the output still plus one input still per source picture. The sender caps sources at five. At the cap, one sketch is 1 output plus 5 inputs = 6 times $0.02 = $0.12. Forty-five sketches are 45 times $0.12 = $5.40.

The first draft happens before any sketch is approved, so the sources are owner photos and reference shots, not the home sketch. Later pages can include the approved home desktop and still stop at five. The $5.40 figure is that cap on every sketch. If the provider cannot take pictures, each sketch is a plain still: 45 times $0.02 = $0.90.

Motion at the site cap is `grok-imagine-video-1.5-lite` at 480p, which is 2 cents a second. Three clips times 6 seconds times $0.02 = $0.36. The video quote does not add an input surcharge. That quote also has to fit under `imagineBudgetUsd`. The default 0 does not fit, so these clips are not drafted on the API path until the cap is raised above the quote.

Adding the motion cap to the stills:

- With five billed inputs on every sketch: $5.40 + $0.36 = $5.76.
- With plain stills: $0.90 + $0.36 = $1.26.

One redraw of one view is three more sketches. At the five-input cap that is 3 times $0.12 = $0.36. As plain stills it is 3 times $0.02 = $0.06.

Other rates on the same card, if you change the model: `grok-imagine-image-quality` is a floor of 5 cents a still. `grok-imagine-image-2.0` is 4 cents at 1k low and 8 cents at 2k medium, and the default resolution token has no listed price. `grok-imagine-video-1.5` is 8, 14, and 25 cents a second at 480p, 720p, and 1080p. `grok-imagine-video-1.5-lite` at 720p is 3 cents a second and at 1080p is 14. `grok-imagine-video` is 5 cents a second at 480p and 7 at 720p, and it has no 1080p price.
