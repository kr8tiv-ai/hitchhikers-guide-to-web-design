# 056 Review — prompts 053, 054, 055

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No new feature.

HEAD reviewed: `a4a36ee` (`feat(assets): export font wordmarks and traced symbols`).

The 053, 054, and 055 must-have truths hold. Each one below has a test name and a file line. This verdict is those truths, plus the acceptance checks in each prompt. `phase_end` is false, so this checkpoint does not close Babel Fish.

## History

Three build commits, in order, on top of `0c4c120`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. Those three were local only: `main` was three commits ahead of `origin/main` before this review commit. The driver pushes. This session does not.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `f4383cc` | `0c4c120` | `feat(assets): price Imagine jobs and enforce the cap` | same, prompt 053 |
| 2 | `3c049b5` | `f4383cc` | `feat(assets): draft ten logo directions and price four stills` | same, prompt 054 |
| 3 | `a4a36ee` | `3c049b5` | `feat(assets): export font wordmarks and traced symbols` | same, prompt 055 |

## 053 Price Imagine jobs and stop at the cap

### Truths

- Every quote names model and resolution. `quoteJob` in `packages/assets/src/prices.ts` (lines 128–131) is the only quote path, through `priceStill` and `priceVideo`. A still line is `${model} at ${resolution}, count ${count}` (line 208). A video line is `${model} at ${resolution}, ${seconds} seconds` (line 220). The prompt text is read and then dropped. Test `1080p and 480p video prices differ and match the card` requires `grok-imagine-video-1.5`, `1080p`, and `10 seconds` on the 1080p line, and `480p` on the 480p line, and requires the fixture prompt to be absent. Test `still count multiplies and image-2.0 resolutions stay apart` requires `grok-imagine-image`, `default`, and `count 10` on a ten-image quote. Test `a $15 cap rejects 12 ten-second 1080p clips` requires all twelve lines to name `grok-imagine-video-1.5` and `1080p`. Test `quote lines match quoteJob and omit the prompt` requires `quote()` to reuse that same line.

- The cap is enforced before the call. `runJobs` in `packages/assets/src/imagine.ts` quotes the batch (line 62), returns early for DIY (lines 67–73), then calls `estimateMustFit` (line 76) before the `postJob` loop (lines 83–85). `assertFits` throws `CapExceeded` when `usd > remainingUsd + 1e-9` (lines 165–167). The error carries the quote lines, so the message includes the resolution. Test `a $15 cap rejects 12 ten-second 1080p clips` requires `CapExceeded` with usd 30, remaining 15, and a message matching `30` and `1080p`. Test `runJobs refuses 12 ten-second 1080p clips before fetch` uses a fetch that throws and requires zero calls. Test `remaining 0 in api mode throws before fetch` requires the same, with `2.50` and `1080p` in the message.

- DIY is the no-key path. The DIY return (lines 67–73) sits above `requireApiKey` (line 77). API mode without a key throws `Imagine API mode needs deps.apiKey. SuperGrok is not a billing source. DIY mode returns prompts without a key.` (lines 134–140) and never reaches fetch. Test `DIY returns prompts and performs zero fetches` uses `remainingUsd: 0` and a fetch that throws, and requires mode `diy`, usd 0, the two prompts, and zero calls. Test `api mode without a key throws before fetch and does not bill SuperGrok` requires that SuperGrok sentence and zero calls. Test `DIY helper still refuses a broken job without fetching` builds deps with no `apiKey`.

### Also checked

- The card date is `PRICE_CARD_DATE = "2026-09-29"` (line 20). Rates are cents on that card. `grok-imagine-video-1.5` is 8, 14, and 25 cents per second at 480p, 720p, and 1080p (lines 82–84). Ten seconds is $0.80 and $2.50. Those two are not equal, and the 1080p total is not `10 * 0.08`. Test `1080p and 480p video prices differ and match the card`.
- `grok-imagine-video-1.5-lite` for ten seconds is $0.20 at 480p and $1.40 at 1080p. Test `video-1.5-lite 10 seconds is 0.20 at 480p and 1.40 at 1080p`.
- `grok-imagine-video` at 1080p is absent from `VIDEO_CENTS_PER_SECOND` and throws `No listed price for grok-imagine-video at 1080p`. Test `grok-imagine-video prices 480p and 720p and rejects 1080p`. 480p and 720p are $0.05 and $0.07 per second.
- `grok-imagine-image` is $0.02. Ten images are $0.20. `grok-imagine-image-2.0` is $0.04 at `1k-low` and $0.08 at `2k-medium`. Its `default` throws. `grok-imagine-image-quality` quotes the $0.05 floor and the line contains `floor`. Test `still count multiplies and image-2.0 resolutions stay apart`.
- Seconds 0, a negative count, and a fractional second throw before fetch. Test `seconds 0 and count 0 throw`. An unknown model throws before fetch. Test `an unknown model throws before fetch`.
- API mode sends `Authorization: Bearer` to the injected fetch. A 200 body that claims a different price does not change the local quote. Test `API mode quotes first, sends Bearer, and ignores a price in the body`. A 401 body that echoes the key is drained and stays out of the Error message. Test `a 401 body that echoes the key stays out of the error`. A thrown fetch error that contains the key is replaced. Test `a thrown fetch error that contains the key is replaced`.
- A failed job is attempted twice and then stops. A 503 followed by 200 stops at the second call. Test `a failed job retries once and not again`.
- `prices.ts` has no `fetch` and no `http` once comments are stripped. `imagine.ts` does not embed `0.08` or `0.25`. NOTICE says estimates must be recomputed if the card changes. Test `prices are local and a fitting batch fetches once per job`.
- Quote lines and the DIY log omit the prompt. The same tests require that.

## 054 List ten logo directions and render four flats

### Truths

- Imagine is not asked to draw the final lettering. `TYPE_LATER` in `packages/assets/src/logo-concepts.ts` (line 48) is `do not render letters. Describe the personality only. The letters will be set in a real font later. no gradient. no mockup. no text.` Both wordmark seeds and both lettermark seeds append it (lines 59–73). Shape seeds append `FLAT`, which includes `no text` and `do not render letters` (line 51). Combination seeds also say `The name is not drawn`. Test `wordmarks and lettermarks refuse rendered letters and keep the real font` requires that sentence, the personality-only sentence, and `Personality word North.` on all four type prompts. Test `shape prompts are flat white stills with no text, gradient, or mockup` requires `no text` and the flat-white sentence on symbol, combination, emblem, and wildcard.

- The user must confirm before a paid render. `renderFour` throws `Logo stills need confirm true before Imagine is called.` when `confirm !== true` (lines 146–147), before `assertFits` and before `runJobs` (line 153). Test `renderFour with confirm false does not fetch` requires that error, requires it not to be `CapExceeded`, and requires zero fetch calls. Test `confirmed API render fetches once per still and keeps the key out of the URL` requires `confirm: true` and then four Bearer posts.

- Gradients are excluded from the prompts. `TYPE_LATER` and `FLAT` both contain `no gradient`. `checked` (lines 243–244) throws if a direction passed to `renderFour` lacks `no gradient`. Test `shape prompts are flat white stills with no text, gradient, or mockup` requires `no gradient` on all ten directions. The confirmed DIY and API tests require `no gradient` on the prompts that would be sent.

### Also checked

- `logoDirections` returns `logo-01` through `logo-10` with kinds 2, 2, 2, 2, 1, 1. Test `logo sheet has ten ids and the kind counts 2, 2, 2, 2, 1, 1`.
- `quoteTopFour` calls `quoteJob` for one `grok-imagine-image` still at `default` with count 4 (lines 116–121). The card price is $0.08. The line includes `grok-imagine-image`, `default`, `count 4`, and `$0.08`. The source of `logo-concepts.ts` does not contain the literals `0.08` or `0.02`. Test `quoteTopFour is $0.08 from quoteJob on the default still model`. Test `quoteTopFour and pickFour call quoteJob, and directions do not call runJobs` requires `quoteJob(` inside `quoteTopFour` and `pickFour`, and requires `logoDirections` to omit `runJobs`.
- `renderFour` with `confirm: true` and remaining $0.05 throws `CapExceeded` at usd 0.08 before fetch, including DIY. Test `renderFour with confirm true and remaining 0.05 throws CapExceeded`.
- A confirmed DIY render under the cap returns four prompts and does not fetch. Test `confirmed render under the cap sends four stills and skips fetch in DIY`.
- An empty name throws. `<` and `!` are stripped from the name. Indexes outside 0..9 throw. Prompts contain no exclamation mark and no `signature`. Tests `an empty name throws and a name with < is stripped` and `pickFour returns four directions and rejects indexes outside 0..9`.
- The four functions are exported from `packages/assets/src/index.ts`. That file is outside the prompt file list. Step 9 of prompt 054 requires the export. The commit names it.

## 055 Set the wordmark in a real font and trace the symbol

### Truths

- Wordmarks come from glyph paths, not from a traced painting of letters. `buildWordmarkSvg` in `packages/assets/src/wordmark.ts` throws `Set the wordmark in a font. An Imagine raster is not the wordmark.` when `source !== "font"` (lines 14, 62–63). It emits `<path fill="#111111" d="..."/>` from `glyphToPath` (line 77) and then `assertLogoSvg`, which rejects `<text` (lines 129–130). `wordmarkSvg` loads the injected font with `opentype.parse` (lines 230–241), lays glyphs with `glyph.getPath` and `toPathData` (lines 207–208), applies `getKerningValue` between advances (line 215), and passes those path strings through `buildWordmarkSvg` with `source: "font"`. The module source does not mention vtracer or potrace. Test `imagine-raster wordmarks throw and say to set the wordmark in a font` covers both functions. Test `a glyph callback becomes path data and not a text fallback` requires the triangle path data, `<path`, fill `#111111`, and no `<text`. Test `the fixture font shapes real glyphs and a space names the character` shapes `H`, `I`, and `HH` from `VT323-Regular.ttf` at 72px, requires `H` and `I` to differ, requires `HH` to be wider than one `H` and narrower than two and a half, and requires a space to throw naming `" "`.

- Symbols are traces through the visioncortex package, behind a testable seam. `traceRaster` in `packages/assets/src/symbol-trace.ts` (lines 17–24) takes an impl, then returns the impl result only after `assertLogoSvg`. `traceSymbol` delegates to that seam (lines 12–14). `symbolTrace` (lines 32–38) calls `convertBuffer` from `@visioncortex/vtracer` with `{ preset: "bw", mode: "spline" }`, then `svgoOptimize`, `paintInk`, and `setViewBox(..., 32)`. The installed package is `@visioncortex/vtracer` 1.0.0-alpha.4, license `MIT OR Apache-2.0`, repository `visioncortex/vtracer`. Test `traceSymbol returns a path svg and rejects an image impl` uses the seam and requires an `<image>` impl to throw. Test `vtracer traces symbol.png into an SVG path` resolves the installed package, checks that name, version, and license, traces `packages/assets/test/fixtures/symbol.png`, and requires `<path`, a non-empty `d`, fill `#111111`, `viewBox="0 0 32 32"`, and no `<image`, `foreignObject`, or `data:image`. It then runs `setViewBox(svg, 16)` and requires `viewBox="0 0 16 16"` and a path. The test file says not to skip. The run below reports skipped 0. The fixture PNG is a black circle on white, which this review opened.

- Potrace cannot be a dependency. Test `package.json does not depend on potrace or unscoped vtracer` reads `packages/assets/package.json` and requires `potrace` and unscoped `vtracer` to be absent, and requires `@visioncortex/vtracer` at `1.0.0-alpha.4`. A search of `package.json` files and `pnpm-lock.yaml` finds no `potrace` and no unscoped `vtracer`. The lockfile pins `@visioncortex/vtracer@1.0.0-alpha.4` only. `symbol-trace.ts` imports `@visioncortex/vtracer` and the source test rejects `from "potrace"` and `from "vtracer"`.

### Also checked

- `assertLogoSvg` (lines 119–141) rejects an empty document, `<image`, `data:image`, `foreignObject`, `<text`, a missing `<svg`, a missing `<path`, and two stroke colors. `buildWordmarkSvg` and `wordmarkSvg` call it. `traceRaster` calls it, so both exporters share it. Test `assertLogoSvg rejects an embedded image, a foreignObject, and a data image`. Test `setViewBox 16 still has a path and one stroke color is required`.
- `svgoOptimize` calls `optimize` from `svgo` 4.1.0. Test `svgoOptimize keeps a path`. Installed `svgo` `package.json` license is MIT, repository `https://github.com/svg/svgo`.
- Empty text throws. An empty glyph names the character. Tests `empty text throws` and `an empty glyph path names the character`.
- NOTICE records opentype.js 2.0.0 (MIT, `opentypejs/opentype.js`), `@visioncortex/vtracer` 1.0.0-alpha.4 (MIT OR Apache-2.0), svgo 4.1.0 (MIT), and VT323 under SIL OFL-1.1 with `packages/assets/test/fixtures/fonts/OFL.txt`. The installed opentype.js and vtracer manifests match those license fields and repositories. `loadSync` in opentype.js 2.0.0 only prints a deprecation line. The wordmark calls `parse`, which the bundle maps to `parseBuffer`. Test `NOTICE and the fixture note record the pins and the OFL face`. The fixture README is one paragraph and names the alpha pin, `symbol.png`, and `foreignObject`.
- Prompt 055's file list omits files the prompt body requires: the integration test, `symbol.png`, the OFL fixture font and `OFL.txt`, `package.json`, and `pnpm-lock.yaml`. `packages/engine/src/boundaries.ts` adds those three packages to `allowExternal` for `@hitchhiker/assets`, the same harness pattern as `pdfjs-dist`. This review ran `node --experimental-strip-types --test packages/engine/test/boundaries.test.ts`: 5 pass, 0 fail. That run is extra evidence for the harness edit. It is not one of the prompt verification commands.

## UI at 375 and 1440

No file under `packages/app/` is in `git diff --name-only 0c4c120..HEAD`. Prompts 053, 054, and 055 did not change a screen. No browser session, and no 375 or 1440 screenshot. There is no rendered surface in this group to compare with `packages/app/src/design/`.

## Live Grok

053 forbids a live Imagine call in tests. `runJobs` posts only through `deps.fetch`. Every API test injects fetch. DIY returns before that post. 054's ten directions are the deterministic function the prompt specifies. `renderFour` reaches `runJobs` only when `confirm` is true and `assertFits` passes. 055 does not call a model. The wordmark is opentype.js. The symbol trace is wasm. No prompt in this group asked for `think()` from `packages/engine/src/ai/`. No cassette was owed. Matt Q12 says the logo comes from Imagine as a clean SVG. This group still prices and posts the four flat stills through Imagine, and it sets the wordmark in a font, which is v2 logo step 3 and prompt 055's must-have. See Notes.

## File list

`git diff --stat 0c4c120..HEAD` is 18 files, 2725 insertions, 28 deletions.

Prompt 053 list, plus the test script:

- `packages/assets/src/prices.ts`
- `packages/assets/src/imagine.ts`
- `packages/assets/test/imagine.test.ts`
- `NOTICE`
- `packages/assets/package.json` (the script was `node -e "process.exit(0)"`. 053 points it at the suite. 055 later adds the three dependencies.)

Prompt 054 list, plus the step-9 export:

- `packages/assets/src/logo-concepts.ts`
- `packages/assets/test/logo-concepts.test.ts`
- `packages/assets/src/index.ts`

Prompt 055 list, plus the files the prompt body requires and the boundary allowlist:

- `packages/assets/src/wordmark.ts`
- `packages/assets/src/symbol-trace.ts`
- `packages/assets/test/logo-svg.test.ts`
- `packages/assets/test/fixtures/README.md`
- `packages/assets/test/vtracer.integration.test.ts`
- `packages/assets/test/fixtures/symbol.png`
- `packages/assets/test/fixtures/fonts/VT323-Regular.ttf`
- `packages/assets/test/fixtures/fonts/OFL.txt`
- `packages/assets/package.json`
- `pnpm-lock.yaml`
- `packages/engine/src/boundaries.ts`
- `NOTICE`

No new package category and no new surface. The three dependencies are the ones prompt 055 names. Nothing to revert.

## Notes

These are not failed truths.

- svgo 4.1.0 is MIT. NOTICE lists its transitive tree. `sax` 1.6.1 is BlueOak-1.0.0, and `mdn-data` is CC0-1.0. BlueOak is permissive and is not on the prompt's named allow list. It arrives only because the prompt says to run SVGO. Replacing SVGO to drop `sax` would be a library swap, so this review leaves it. The same pattern is the 0BSD `tslib` note in review 040.
- `runJobs` posts and then discards the response body. Prompt 053 asks for the quote, the cap, and the fetch. It does not ask this slice to store image bytes. Prompt 062 is the end-to-end asset job. The request URLs are `https://api.x.ai/v1/images/generations` and `https://api.x.ai/v1/videos/generations`. The price card in the addendum does not name those paths. Tests inject fetch and lock the URLs they assert.
- v2 logo step 5 also says "reversed". Prompt 055's steps require SVGO, one color, and viewBox 32 and 16. They do not require a reversed export. That stays with the export set.
- VT323 is monospace, so the fixture does not show a visible kern shift. `layoutWord` still calls `getKerningValue` and adds it to the advance.
- The DIY success test passes an `apiKey` and checks that the key stays out of the result and the log. The return that skips the key check is the branch above `requireApiKey`.
- Whole seconds and whole counts are required. A second value of 1.5 throws. The prompt's edge case names zero. The stricter check is covered by `seconds 0 and count 0 throw`.
- `.hitchhiker-dev/` is absent, so no summary file was written. Each commit body holds the summary.

## Verification

Commands run from the repo root on this review. No fix was applied, so there is no second run.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/056-REVIEW.md` | this file |
| `pnpm --filter @hitchhiker/assets test` | exit 0. 44 pass, 0 fail, 0 skipped |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the test run.

The boundary file from 055 was checked with `node --experimental-strip-types --test packages/engine/test/boundaries.test.ts`. Exit 0. 5 pass, 0 fail.

No prompt 057 work. No push, no remote, no deploy.

## Scope

No source edit. No fix commit. The only file this session adds is this review.
