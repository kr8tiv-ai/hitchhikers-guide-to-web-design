# 064 Review — prompts 061, 062, 063

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. One fix commit. No new feature.

HEAD before this review commit: `477ff97` (`fix(review): checkpoint 064 types draft brand approvals for strict tsc`).

The must-have truths for 061, 062, and 063 hold. Each one below has a test name and a file line. One 061 defect was false on arrival under `tsc -b` and is fixed in `477ff97`, with the engine suite and `tsc -b` green after the change. `phase_end` is false, so this checkpoint does not close Babel Fish.

## History

Three build commits, in order, on top of `42e9c98`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. `origin/main` is `42e9c98`, so 061, 062, 063, and the fix are local. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `098f40f` | `42e9c98` | `feat(brand): run Babel Fish live on Grok with validators and approvals` | same, prompt 061 |
| 2 | `2fc5fcb` | `098f40f` | `feat(assets): run Imagine image and video jobs under the cap, plus DIY packs` | same, prompt 062 |
| 3 | `87f6393` | `2fc5fcb` | `feat(logo): clean the traced mark and export the full logo set` | same, prompt 063 |
| fix | `477ff97` | `87f6393` | `fix(review): checkpoint 064 types draft brand approvals for strict tsc` | this review |

## Fix

Prompt 061. `pnpm exec tsc -b` failed on the live brand modules. `ApprovalItem.status` is required, and every `recordDraftItems` call site omits it because the writer forces `pending`. Two `evidenceFromAnswers` calls passed `readonly AnswerRecord[]` into `AnswerRecord[]`. `node --experimental-strip-types --test` does not typecheck, so the engine suite was green while CI `tsc -b` (docs/ci.md, prompt 003) would fail. Prompt 063's commit body already named this and left it, because `brand/live` is outside 063's file list.

Correction stays inside 061's files. `ApprovalDraft` in `packages/engine/src/brand/live/approve.ts` (lines 42–49) is a line before it is stored. `recordDraftItems` accepts `readonly ApprovalDraft[]` (line 71) and `normalizeItem` still writes `status: "pending"` (line 234). `why-finder.ts` and `discovery.ts` copy the answer array before `evidenceFromAnswers`. `taglines.ts` and `voice-kit.ts` type their draft lists as `ApprovalDraft`. `positioning.ts` and `story.ts` already omitted `status`, so they typecheck against the new parameter with no edit. A stored line is still pending until `setApproval`. An approved line whose text is unchanged is not rewritten (approve.ts lines 83–84).

`pnpm exec tsc -b --pretty false` after the fix: exit 0. `pnpm --filter @hitchhiker/engine test` after the fix: exit 0, 341 pass, 1 skipped, 0 fail.

## 061 Model-authored brand modules with validators

### Truths

- Babel Fish runs on Grok, not canned strings. `runWhyFinder` (`packages/engine/src/brand/live/why-finder.ts` lines 49–70) asks through `deps.think` one question at a time, then compiles through `deps.think`. `MIN_QUESTIONS` is 12 and `MAX_QUESTIONS` is 18 (lines 33–34). `draftStory`, `draftVoiceKit`, `draftTaglines`, `draftPositioning`, and `runDiscovery` take `think: typeof think` from `packages/engine/src/ai/think.ts` and send a task plus a schema from `schemas.ts` (lines 14–23 and 100–276). Test `Why Finder asks at least 12 questions, one at a time, then compileWhy shapes the why`. Test `cassette replay on Towel and Tea runs every live module with zero lintClaims hits` calls the real `think()` with `HH_CASSETTE=replay` and an empty `PATH` (`brand-live.test.ts` lines 336–340 and 736). Replay does not spawn grok. The story body is the model value. If the origin schema fails, `twoQuestions` (`story.ts` lines 104–110) falls back to two concrete origin questions. That path is the schema failure, and the test `story lengths stay inside the window, clip overflow, and ask two origin questions` locks it. The story text still comes from `think()`.

- The deterministic compilers validate everything the model writes. `shapeWhy` calls `compileWhy` (why-finder.ts line 151). Discovery uses `compileWhy` and `buildTeardown` (discovery.ts lines 112 and 237). Positioning calls `pickArchetype`, `positioningLine`, `buildStory`, and `buildTeardown` (positioning.ts lines 95–105). Story length is the tighter of ±10% and `expandOnly` (`storyLimits` and `shaperWordCap`, story.ts lines 54–57 and 174–180), then `countWords` and `assertClaims` (lines 163–171). Voice calls `renderVoice` (voice-kit.ts line 83). Taglines pass every line and the top 5 through `selectTaglines` (taglines.ts lines 118 and 158). `assertClaims` calls `lintClaims` (schemas.ts lines 316–317). `assertBrandContrast` calls `contrastRatio` (schemas.ts lines 325–331) and runs before the model in each drafter. Test `positioning keeps the grounded line, the 12-archetype label, and rejects a competitor slogan`. Test `voice kit is shaped by renderVoice and still passes lintClaims`. Test `taglines return 30 across 6 styles, cut to a top 5, and repair a short list once` requires `TaglineCountError` when 29 remain after one repair (brand-live.test.ts line 630) and `CompetitorSloganError` for a competitor slogan (line 647). Test `low contrast fails before a model call`.

- Nothing leaves draft without a per-item approval. `approvalsPath` is `.hitchhiker/brand/approvals.json` (approve.ts lines 63–64). `recordDraftItems` stores `pending`. `setApproval` is the only status change to `approved` or `rejected` (lines 90–115). `redraftRejectedItem` requires `rejected` plus a note, calls `think()` for that item, and returns it to pending (lines 122–140). Test `rejecting one tagline re-drafts only that item`. Test `approve cards give every item its own approve and reject` covers `renderApproveCards` and `bindApproveDeck` in `packages/app/src/brand/approve-cards.ts`.

### Also checked

- `packages/engine/src/brand/brain.ts` does not read `approvals.json`. Prompt 059's compile stays a shaper. Prompt 065 is not built. The 061 key link names both readers. The truth above is the write side: a drafted line is pending until its own approval. This review does not edit `brain.ts`.
- Top-5 reasons are stored on `ApprovalItem.style`. A tagline-top redraft drops that field when the style no longer applies. The redraft test covers one item, and the other items stay put.
- AntiHero wording is credited in the module headers (D-005).

## 062 Imagine asset jobs end to end

### Truths

- Imagine jobs run for real, on the user's key, within an approved cap. `IMAGE_GENERATIONS_PATH` is `/v1/images/generations` and `VIDEO_GENERATIONS_PATH` is `/v1/videos/generations` on `https://api.x.ai` (`packages/assets/src/imagine-http.ts` lines 19–21). `pollVideo` uses `GET /v1/videos/{id}` with a 2 second start, a 30 second cap on the interval, and a 10 minute budget (lines 23–25 and 207). `readApiKey` prefers `XAI_API_KEY` and otherwise the OS keychain service `hitchhikers-guide` account `xai` (`keychain.ts` lines 10–11 and 36–38). A newline in a key is refused. `runBatch` quotes with the 053 price card, throws `CapExceeded` before `confirm` and before fetch when the quote exceeds the remaining cap, and returns the same spend when confirm is declined (`imagine-run.ts` lines 98–126). Files land in `.hitchhiker/assets/generated/` (line 311). The ledger is `.hitchhiker/assets/spend.json` (line 80). Test `generateImage posts aspect_ratio and reads url and base64`. Test `startVideo maps duration and request_id`. Test `pollVideo backs off until the ten minute cap`. Test `a batch over the cap is refused before confirm and before fetch`. Test `429 and 500 retry twice, and 400 does not`. Test `HTTP 500 stops the batch and keeps the finished slot`. Test `a video poll timeout keeps the job id and the charge`. Test `a missing key names the env var and the keychain`. Test `the env key wins, and the keychain is next`. The live still `one low-cost still under a ten cent cap` skips unless `HH_LIVE=1` and `XAI_API_KEY` are set. That skip is the prompt's own gate.

- A no-API DIY path exists. `DIY_SUFFIX` is exactly `no text, no letters, no logos, no watermarks, no faces` (`diy-pack.ts` line 9) and is appended once (lines 49–52). `importDiyFiles` copies a dropped file onto a slot (`diy-import.ts` line 17). `updateAssetRows` writes `.hitchhiker/ASSETS.md` (`slots.ts` lines 111 and 202). Test `the DIY pack has one block per slot and the suffix once`. Test `import matches a file name before falling back to order`. Test `a missing file is refused before any copy`. CLI: test `diy writes the prompt pack` and test `import maps a dropped file onto the slot` in `packages/cli/test/assets.test.ts`.

- Spending is visible as a running total. `recordSpend` writes `spentUsd` and entries (`imagine-run.ts` lines 146–157). `planBatch` returns the quote and omits the prompt (lines 84–95). The CLI prints the quote and, without `--yes`, exits with `Nothing was spent. Pass --yes to confirm this batch.` (`packages/cli/src/commands/assets.ts` line 284). Test `stills run in order, record the total, and do not log the key`. Test `declining the confirm spends nothing and leaves ASSETS.md`. Test `plan prints the quote and not the prompt`. Test `run without --yes spends nothing`. Test `run --yes over the cap exits before the key is read`. Test `run --yes uses the injected fetch and does not print the key`.

### Also checked

- `refusesRealReplacement` (`slots.ts` line 198) throws `RealSubjectError` inside `runBatch` before confirm (imagine-run.ts lines 108–110). `proposeReplacement` offers a weak real subject only after a recorded yes. Test `a real subject is not replaced without a recorded yes`. Test `weak real subjects are proposed only after a recorded yes`.
- A finished slot is left out of the quote. A paid video resumes by poll and is not charged again. Tests `a finished slot is left out of the quote and is not fetched` and `a paid video resumes with a poll and does not charge again`.
- The package published as the CLI is `hitchhikers-guide` (`packages/cli/package.json`), which is also the root package name. `pnpm --filter @hitchhiker/cli test` matches no project and exits 0 with that message. That filter is the review prompt's name, and the package has never used it (`boundaries.ts` line 12). The suite that exists was run as `pnpm --filter ./packages/cli test`: exit 0, 32 pass, 0 fail.

## 063 Logo clean-up and export set

### Truths

- The logo ships as a complete, clean export set. `logoExportNames` (`packages/assets/src/logo/export-set.ts` lines 75–92) names `[brand]-logo-[version]-[size]` for master, black, white, and favicon SVGs, profile PNG, 16 and 32 PNG and ICO, app-512, transparent 512, 1024, and 4096, and a print PDF. `logoDir` is `.hitchhiker/brand/logo` (lines 71–72). `slugifyLogoName` uses NFKD (lines 60–68). `exportLogoSet` optimizes with SVGO, paints black and white, and draws the print PDF with `drawSvgPath`. Test `exportLogoSet writes every file, exact PNG sizes, and valid SVGs`. Test `brand names with spaces or accents are slugified`. Test `the export source draws print paths with drawSvgPath`. Test `pngToIco wraps one square PNG`.

- Model clean-up cannot distort the mark. `cleanLogo` (`packages/assets/src/logo/clean.ts` lines 55–100) sends the SVG through `think()` with schema `{ svg, changes }` (`LOGO_CLEAN_SCHEMA`), then SVGO. Area delta above `SILHOUETTE_AREA_LIMIT` (0.05, line 21) or overlap under `SILHOUETTE_IOU_MIN` (0.9, line 24) keeps the SVGO-only mark and says so. Schema, parse, raster, text, viewBox, and the 30 KB cap do the same. `assertCleanedLogoSvg` (line 107) requires a parseable square viewBox, a path, no raster, no text, and under 30 KB. Test `a valid model clean-up is kept after SVGO`. Test `a tighter viewBox around the same path is not treated as distortion`. Test `model failure keeps the SVGO version and says so`. Test `a silhouette that changes area by more than 5% is rejected`. Test `an oversized model SVG keeps the SVGO version`. Test `cleanLogo replays a cassette through think()`. Test `assertCleanedLogoSvg requires a square viewBox, a path, and under 30 KB`.

- Small-size legibility is measured. `checkLogo` (`checks.ts` lines 221–229) renders at 32 and 16 through `@resvg/resvg-js`, then reports filled ratio, connected components, one-colour ink, reversed ink, and `squintScore` (Gaussian blur, line 232). Advice is returned. The mark is not rewritten. The last line is `LOGO_HAPPY_QUESTION`, `happy with this? want me to improve it?` (line 73, pushed at line 322). Test `32 and 16 checks report a squint score and ask for an improvement`.

### Also checked

- CONTEXT-PACKAGE v1 says "elevate" in the logo close. That word is banned in user-facing copy. Prompt 063 and the anti-slop rule both require the happy question. The implementation follows the prompt. The 063 commit body records the same conflict.
- `@resvg/resvg-js` 2.6.2 is MPL-2.0, file-level, in NOTICE (lines 275–281). `pdf-lib` 1.17.1 is MIT (NOTICE lines 299–303). `boundaries.ts` allowExternal for `@hitchhiker/assets` names both (line 35). The boundary test `package.json dependencies match BOUNDARIES` passed inside the engine suite.
- ICO is the small writer in `ico.ts`, not a new package. Group transforms are baked before `drawSvgPath`. Test `group transforms are baked into the print path`.
- The transparent PNG is a separate file from the plated profile and app icons. The export test checks the 512 byte length and that the file differs from the plated renders. It does not assert a single alpha pixel. The writer `pngSquare` has no plate. This review leaves that as a note.

## UI at 375 and 1440

Prompt 061 adds `packages/app/src/brand/approve-cards.ts`. It is a component. No app route mounts it. Prompts 062 and 063 do not touch `packages/app/`.

This review rendered `renderApproveCards` into a local page that loads `packages/app/src/design/tokens.css`, `type.css`, and `components.css`, and looked at it in Playwright at 375 and 1440, light and dark. The screenshots were not committed.

Light, 1440: surface `#f3ebdd`, accent button `#8e2f1a`, button min-height 44px, body ink and Literata, button face Bricolage Grotesque. Document scroll width matched the client width. Overflow elements: 0. Four cards (why pending, tagline approved, how rejected with a note, empty desk). Light, 375: viewport 375, scroll width 360, overflow 0, primary button 44px tall. The note field wraps under the buttons. Text is not cut off. Dark, 1440 and 375: surface `#12100e`, accent `#e6a15c`. Overflow 0 at 375. Typed `Keep the kettle.` into the why note. The static fixture does not call `bindApproveDeck`, so the status label stayed pending. The unit test covers the binder.

The cards use the desk tokens. No indigo-on-gray default, no purple gradient, no magnetic button, no lorem, no exclamation mark, no "elevate". At 1440 the cards are vertically loose. That is spacing, and it is not a failed truth. This review does not restyle them.

## Live Grok

061 model calls go through `think()` in `packages/engine/src/ai/think.ts` with a schema. The cassette test is the adapter proof. Scripted `think()` in the other brand-live tests is the unit double. The product modules do not return canned brand copy. The origin-question pair is the schema-failure path named above.

062 image and video jobs are HTTP to `api.x.ai` on the user's key, which is what the prompt asks for on those endpoints. The live smoke stays skipped without `HH_LIVE=1` and `XAI_API_KEY`. A successful generation in tests comes from the injected fetch.

063 `cleanLogo` calls the same `think()` with `{ svg, changes }`. Test `cleanLogo replays a cassette through think()`. A model failure keeps the SVGO mark. It does not invent a different logo.

## File list

`git diff --name-only 42e9c98..87f6393` is 34 files. The fix commit edits five of the 061 sources.

Prompt 061 list, exact:

- `packages/engine/src/brand/live/why-finder.ts`
- `packages/engine/src/brand/live/discovery.ts`
- `packages/engine/src/brand/live/positioning.ts`
- `packages/engine/src/brand/live/story.ts`
- `packages/engine/src/brand/live/voice-kit.ts`
- `packages/engine/src/brand/live/taglines.ts`
- `packages/engine/src/brand/live/schemas.ts`
- `packages/engine/src/brand/live/approve.ts`
- `packages/engine/test/brand-live.test.ts`
- `packages/engine/test/cassettes/brand/README.md`
- `packages/app/src/brand/approve-cards.ts`

Prompt 062 list, plus the wiring the command needs:

- `packages/assets/src/imagine-run.ts`
- `packages/assets/src/imagine-http.ts`
- `packages/assets/src/diy-pack.ts`
- `packages/assets/src/diy-import.ts`
- `packages/assets/src/slots.ts`
- `packages/assets/src/keychain.ts`
- `packages/assets/test/imagine-run.test.ts`
- `packages/assets/test/diy.test.ts`
- `packages/assets/test/imagine-live.test.ts`
- `packages/cli/src/commands/assets.ts`
- `packages/assets/src/index.ts` re-exports the new modules
- `packages/cli/src/main.ts` dispatches `assets` in one line
- `packages/cli/test/assets.test.ts` covers that command

Prompt 063 list, plus the boundary allow-list and the lockfile the new dependencies require:

- `packages/assets/src/logo/clean.ts`
- `packages/assets/src/logo/checks.ts`
- `packages/assets/src/logo/export-set.ts`
- `packages/assets/src/logo/ico.ts`
- `packages/assets/test/logo-clean.test.ts`
- `packages/assets/test/logo-export.test.ts`
- `packages/assets/package.json`
- `NOTICE`
- `packages/engine/src/boundaries.ts`
- `pnpm-lock.yaml`

The extras are harness for the commands, the package boundary, and the install. They are not a new feature. This review does not revert them.

## Verification

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/064-REVIEW.md` | True |
| `pnpm exec tsc -b --pretty false` | exit 0, after the fix |
| `pnpm --filter @hitchhiker/engine test` | exit 0, 341 pass, 1 skipped (`set HH_LIVE=1 to call the installed grok CLI`), 0 fail |
| `pnpm --filter @hitchhiker/app test` | exit 0, 69 pass, 0 fail |
| `pnpm --filter @hitchhiker/assets test` | exit 0, 110 pass, 1 skipped (`set HH_LIVE=1 and XAI_API_KEY to call Imagine`), 0 fail |
| `pnpm --filter @hitchhiker/cli test` | exit 0, no project matched. See the 062 note. |
| `pnpm --filter ./packages/cli test` | exit 0, 32 pass, 0 fail |
| `pnpm install` | exit 0, lockfile already up to date |

Node printed that `NO_COLOR` is ignored because `FORCE_COLOR` is set. The suites still exited 0.

## Scope

No prompt 065 work. No push, no deploy, no remote. One fix commit of the two allowed. The second was not needed.
