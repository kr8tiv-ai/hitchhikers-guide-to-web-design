# 067 Review — prompts 065, 066

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. One fix commit. No new feature. This checkpoint closes Babel Fish. Deep Thought is not started.

HEAD before this review commit: `45a8755` (`fix(review): checkpoint 067 rejects sale and follower claims in social captions`).

The must-have truths for 065 and 066 hold. Each one below has a test name and a file line. One 065 defect was false on arrival: social captions could claim a sale, a follower count, or a multi-digit star rating. That is fixed in `45a8755`. The commands below exit 0 after the fix. Three gaps stay as known issues because closing them would change a locked interface or add a surface these prompts forbid.

## History

Two build commits, in order, on top of `e1ea458` (the 064 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. `origin/main` is `e1ea458`, so 065, 066, and the fix are local. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `97c4337` | `e1ea458` | `feat(app): render the brand kit for approval` | same, prompt 065 |
| 2 | `aac736b` | `97c4337` | `feat(brand): approve brand sections one at a time` | same, prompt 066 |
| fix | `45a8755` | `aac736b` | `fix(review): checkpoint 067 rejects sale and follower claims in social captions` | this review |

## Fix

Prompt 065. `renderSocial` called `lintBrandClaims` (the brand truth gate). That gate's star pattern is one digit, so "10 stars", "five stars", "on sale", "for sale", "12000 followers", and "12k followers" became captions. The merged scope says captions may not claim a sale, a star rating, or a follower count.

Correction stays inside 065's files. `assertUnclaimed` in `packages/templates/src/social.ts` (lines 87–91) runs after `lintClaims` (lines 49–56). `SALE_CLAIM`, `FOLLOWER_CLAIM`, and `STAR_CLAIM` are lines 30–32. The existing test `a tagline of 5 stars with empty evidence throws` still matches `/truth gate: stars/`, because the one-digit phrase still fails `lintClaims` first. New test `a sale, a follower count, or a multi-digit rating cannot be claimed` (`social.test.ts` lines 65–78).

`pnpm --filter @hitchhiker/templates test` after the fix: exit 0, 6 pass, 0 fail.

The second fix slot is unused.

## 065 Render the brand kit as an approval page with optional social frames

### Truths

- The kit is a draft until each section is approved. `renderBrandKit` prints `Draft. Not approved.` beside the h1 (`packages/app/src/brand-kit.ts` lines 164–165). Test `a script in the purpose is escaped and the draft banner sits beside the h1` requires that banner and `This page is not the website`. The file gate is prompt 066: `applyStatus` writes `Status: approved` only when all six sections are true (`approve.ts` lines 40–45). Test `partial approval stays draft`. Test `full approval flips the status line compileBrand wrote`. The HTML banner does not flip after that file approval. See known issue 2. The page never claims the kit is approved.

- Brand colors are swatches, not untested body text. Palette swatches set `background` to the brand hex and pick the label from desk `#1c1612` or `#f4ede3` by `contrastRatio` (`brand-kit.ts` imports `contrastRatio` from `design/tokens.ts` at line 11). Test `an invalid hex throws and a failing brand ink stays off the body color` uses ink `#cccccc`, requires `background:#cccccc;color:#1c1612`, and forbids `color:#cccccc`. The rendered page's body color, measured in this review, is desk ink `rgb(28, 22, 18)`.

- The page is the Guide UI, not the client's homepage. The frame uses `hh-shell`, `hh-headline`, `hh-btn`, and the 010 stylesheets (`brand-kit.ts` lines 149 and 424). Copy says `This page is not the website` (line 165). Test `a script in the purpose is escaped and the draft banner sits beside the h1` also forbids `elevate`, `indigo`, `lorem`, `linear-gradient`, and an exclamation outside the doctype. Test `css uses shell variables and skips indigo, gradients, and a fixed banner`. Visual check is below.

- Social copy obeys the same truth gate as the brand brain. `renderSocial` imports `lintBrandClaims as lintClaims` from `@hitchhiker/engine` (`social.ts` lines 6–10) and throws `Social captions failed the truth gate:` (lines 49–52). Test `a tagline of 5 stars with empty evidence throws`. Test `the source calls the brand truth gate and does not import a network sdk`. Sale, follower, and worded or multi-digit star claims are the fix above.

- Nothing is published to a network. `social.ts` has no fetch and no network SDK. Test `the source calls the brand truth gate and does not import a network sdk` forbids twitter, instagram, facebook, tiktok, `node:https`, and axios. The kit page says `Nothing on this desk is posted.` (`brand-kit.ts` line 192).

### Also checked

- Harness files in `97c4337` are the ones prompt 065 required, not a new feature: `packages/engine/src/index.ts` exports `lintBrandClaims` because the public `lintClaims` name is the guide stub; `packages/engine/src/boundaries.ts` allows templates on engine; `packages/templates/package.json`, `src/index.ts`, and `tsconfig.json` add the test script, the `renderSocial` export, and the workspace dependency; `pnpm-lock.yaml` follows. 066 touches only `packages/engine/src/brand/approve.ts` and `packages/engine/test/approve.test.ts`.
- `writeBrandKit` writes `.hitchhiker/brand/brand-kit.html` and `brand-kit.pdf` and copies the desk woff2 files. Test `writeBrandKit writes html and a print pdf under .hitchhiker/brand` requires `%PDF-`, the draft sentence, and the purpose in both files. The PDF writer is hand-rolled Helvetica text. A pdf-lib load of a fixture from this review opened 2 pages. It is a text extract for agencies, not a painted copy of the HTML.
- Logo SVG is inlined only after a local substring check. Test `an svg with an embedded image is dropped`. Test `a clean logo is inlined and a safe image is an img`. The app source does not import `@hitchhiker/assets` (brand-kit.test.ts lines 147–148).
- Prompt 065 key link: the model is filled by a later approval command. `compileBrand` still writes `Status: draft` (`brain.ts` line 121). No CLI in these commits calls `approveSection`.

## 066 Approve each brand section before it leaves draft

### Truths

- Each brand section is approved on its own. `BRAND_SECTIONS` is exactly `purpose`, `voice`, `tokens`, `imagery`, `logo`, `neighbors` (`approve.ts` lines 15–22). `approveSection` sets one flag (`approve.ts` lines 49–54). Test `partial approval stays draft` approves purpose and leaves the other five false, with `Status: draft`. Test `full approval flips the status line compileBrand wrote` walks the six names and flips the line only on `neighbors`. Test `redo clears voice only and does not delete BRAND.md`.

- Draft cannot be relabeled approved by editing one boolean in memory without the file. The record is `.hitchhiker/brand-approval.json`, written under `withStateLock` and `replaceViaTemp` (`approve.ts` lines 7–8). Test `a boolean edited in memory does not relabel the draft on disk`: `applyStatus` on an in-memory all-true map returns `Status: approved`, and the file on disk stays `Status: draft`. Test `a hand-edited approved line is forced back to draft`. Test `approveSection and redoSection use the state lock` holds the lock and expects `LockHeld`.

- Babel Fish does not launch Deep Thought. Test `Babel Fish approval does not launch Deep Thought` reads `approve.ts` and forbids `brain.ts`, `compileBrand(`, `child_process`, imagine, `prd.ts`, and a site-prompt generator, and locks the six section names. The diff for 065 and 066 adds no PRD, STACK-DECISION, MOTION, or site-prompt file. This review does not start prompt 068.

### Also checked

- `applyStatus` rewrites the status line `compileBrand` wrote (`approve.ts` lines 35–45). Test `full approval flips the status line compileBrand wrote` asserts the saved markdown equals that replacement and still contains `Why status:`. Test `phase end covers brand brain length only by calling compileBrand on a small fixture and then applyStatus` keeps the word count at or under `BRAND_WORD_CAP`.
- Unknown section `gsap` throws and is not stored. Names are case-sensitive. A corrupt JSON file throws and is not deleted. Logo approval does not require an SVG. Tests: `unknown section gsap throws and stays out of the file`, `section names are case-sensitive`, `a corrupt brand-approval.json throws and is not deleted`, `logo can be approved without an svg, which records no logo yet`.
- `compileBrand` does not read the approval file and does not auto-approve. The phase-end test still sees `Status: draft` on a fresh compile.

### Prompt conflict (known, not fixed)

066 key link: "Section names match the data-approve ids in the kit, plus neighbors." The locked tuple is the six names above. Prompt 065 requires Approve and Redo for `purpose`, `palette`, `type`, `taglines`, `logo`, and also `voice`, `imagery`, `story`, plus per voice item and per tagline (test `approve controls exist for each section, each voice item, and each tagline`, `brand-kit.test.ts` lines 65–77). Intersection of the two sets: `purpose`, `voice`, `imagery`, `logo`. The kit has no `tokens` or `neighbors` button. The file has no `palette`, `type`, or `taglines` key. Changing either set breaks a locked interface. Recorded here. Not edited.

## Known issues

1. Section ids disagree, as in the conflict above. A click on `palette` is not a key `approveSection` will store. Wiring a translation would be a new mapping neither prompt locked. Left as a prompt conflict inside 066.

2. Approve and Redo on the kit page do not call `approveSection`. The buttons are `type="button"` with `data-approve` and `data-redo` and no handler (`brand-kit.ts` lines 352–354). A click on purpose, measured in this review, left the banner `Draft. Not approved.` Prompt 065 forbids a live server and says a later command fills the model. Prompt 066 is that file command. Binding the static page to the state lock would be a new command. The banner never claims approved. `BRAND.md` `Status` is the gate.

3. The kit page does not draw the social SVG. App `allowDeps` is engine only, so importing `renderSocial` would be a new package edge. `renderSocial` remains a separate export and was exercised in this review: paper margin, signal square, brand name in ink. The page says `Optional. A square frame can be made from this voice later. Nothing on this desk is posted.` (`brand-kit.ts` line 192).

## UI at 375 and 1440

Prompt 065 changed `packages/app/`. Prompt 066 did not change UI.

Looked at full-page screenshots of a `writeBrandKit` fixture served on `127.0.0.1` (Playwright blocks `file://`): `packages/app/e2e/screens/review-067-375.png` and `review-067-1440.png`. Also looked at `review-067-social.png` for the separate SVG. Screenshots are gitignored. They are not in the commits.

What is on the page: Guide desk, Don't Panic wordmark, brick accent spine, draft banner, purpose and why, archetype, positioning, three story lengths, type specimen "Glass, cut slow." in Fraunces and Source Serif 4, paper / ink / signal swatches with hex and a contrast line, five taglines each with Approve and Redo, logo set (master, one colour, reversed, favicon), imagery caption, voice items, a text-only social section, footer `BABEL FISH / DRAFT / NOT THE WEBSITE`. No purple-to-blue gradient, no indigo-on-gray defaults, no magnetic buttons, no lorem, no exclamation in the copy, no "elevate". The cream field and brick spine are the 010 shell (paper and accent), not a client homepage.

Measured in this review's browser pass:

- 375: viewport 375, scroll width equals client width (360), no horizontal overflow. Index is one column. Body font Literata, body color `rgb(28, 22, 18)`. Headline is Bricolage Grotesque. Swatch labels: paper dark, ink light, signal light. Click `data-approve="purpose"`: banner stays `Draft. Not approved.` Story sets hash `#story-title`. The only console error is the browser asking for `/favicon.ico`, which this static export does not ship.
- 1440: viewport 1440, scroll width equals client width (1425), no horizontal overflow. Frame columns `736px 280px`. The index rail is sticky. Body color stays desk ink.

The social SVG screenshot is a 1080 square: paper margin, signal rectangle, "North Glass" in ink. The dark band beside it is the fixture page background, because the SVG is 1080 wide in a 1440 viewport.

## Babel Fish phase gate

ROADMAP.md lines 100–105. Criteria 1–5 were already true at reviews 048–064. This pass re-checked the tests those reviews named. Criterion 6 is this pair of prompts.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Grok runs Why Finder, positioning, story, voice kit, and 30 taglines cut to 5; every output passes lintClaims and the word caps. | TRUE | Test `cassette replay on Towel and Tea runs every live module with zero lintClaims hits` (`packages/engine/test/brand-live.test.ts` line 736). Review 064 records the live modules, schemas, and word caps. |
| 2 | Logo path: SVG wordmark from a real font, symbol trace, model-cleaned master, full export set. | TRUE | Test `the fixture font shapes real glyphs and a space names the character`. Test `traceSymbol returns a path svg and rejects an image impl`. Test `imagine-raster wordmarks throw and say to set the wordmark in a font` (`packages/assets/test/logo-svg.test.ts`). Test `a valid model clean-up is kept after SVGO`. Test `exportLogoSet writes every file, exact PNG sizes, and valid SVGs`. |
| 3 | Imagine jobs run for real on the user's key, stop at the dollar cap, and can run in DIY mode with zero API calls. | TRUE | Test `a batch over the cap is refused before confirm and before fetch` (`imagine-run.test.ts` line 390). Test `DIY returns prompts and performs zero fetches` (`imagine.test.ts` line 228). The live still stays skipped unless `HH_LIVE=1` and `XAI_API_KEY` are set. That skip is the prompt's own gate. |
| 4 | Image upscaling is on, weights downloaded at first use, never committed. | TRUE | `ensureUpscaler` (`packages/assets/src/model-fetch.ts` line 441) caches under `cacheDir/.hitchhiker/models/realesrgan/` (line 176). The file header says the weights are never committed (line 5). Test `ensureUpscaler downloads each file for this platform once, then reuses the cache`. Test `packages/assets contains no committed weight files` (`upscale.test.ts` line 491). |
| 5 | Real people in uploads are not replaced without a recorded yes. | TRUE | Test `a real subject is not replaced without a recorded yes` (`imagine-run.test.ts` line 701). Test `upscalePlan never returns imagine-replacement for a real subject without yes` (`upscale.test.ts` line 148). |
| 6 | The brand-kit page is a designed reveal the user can approve per item, with HTML and PDF exports. | TRUE | The page, the per-item Approve and Redo buttons, and `writeBrandKit` are evidenced under 065. The per-section file gate is evidenced under 066. Caveat, not a false criterion: a click does not persist (known issue 2), and the button ids are not the six file keys (known issue 1). Making the click persist needs a command these prompts did not allow. Same shape as review 044, where a desk gap sat beside a TRUE criterion. |

No criterion is FALSE. Nothing here needs a new prompt inside Babel Fish, and this review does not open Deep Thought.

## Verification

Run after `45a8755`, from the repo root, on 2026-10-07.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @hitchhiker/templates test` | 0 | 6 pass, 0 fail |
| `pnpm --filter @hitchhiker/app test` | 0 | 80 pass, 0 fail |
| `pnpm --filter @hitchhiker/engine test` | 0 | 356 pass, 1 skipped, 0 fail |
| `pnpm -r test` | 0 | see counts below |
| `pnpm exec tsc -b --pretty false` | 0 | clean |

`pnpm -r test` counts: crawler 80/80, voice 43/43, engine 356 pass / 1 skip / 357, cli 32/32, orchestrator 13/13, templates 6/6, app 80/80, assets 110 pass / 1 skip / 111. `grok-plugin`, `knowledge`, and `qa` finished with no failures (stub scripts where the package has no suite yet).

The engine skip is `live smoke returns a two-field object` because `HH_LIVE` is unset. The assets skip is the Imagine live still, which needs `HH_LIVE=1` and `XAI_API_KEY`. Neither skip is a failure.

No red package. No regression against review 064.

## Scope

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 068 is not started.
