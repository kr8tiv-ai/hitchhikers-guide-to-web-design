# 060 Review — prompts 057, 058, 059

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-06. Fresh session. One fix commit. No new feature.

HEAD before this review commit: `ab52b46` (`fix(review): checkpoint 060 runs scale 2 on the native Real-ESRGAN weights`).

The must-have truths for 057, 058, and 059 hold. Each one below has a test name and a file line. One 057 defect was false on arrival and is fixed in `ab52b46`, with the assets suite green after the change. `phase_end` is false, so this checkpoint does not close Babel Fish.

The known issue is the engine verification command. It is not a failed truth from this group. Detail is in Verification.

## History

Three build commits, in order, on top of `f184502`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. `origin/main` is `9c79732`, so 057 and 058 are already published. 059 and the fix commit are local. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `126fd1d` | `f184502` | `feat(assets): grade collateral and gate upscaling` | same, prompt 057 |
| 2 | `9c79732` | `126fd1d` | `feat(brand): block invented proof in brand copy` | same, prompt 058 |
| 3 | `a2b26fe` | `9c79732` | `feat(brand): compile BRAND.md under 1500 words` | same, prompt 059 |
| fix | `ab52b46` | `a2b26fe` | `fix(review): checkpoint 060 runs scale 2 on the native Real-ESRGAN weights` | this review |

## Fix

Prompt 057. Truth: upscaling is on and runs locally. The 1200 px plan returns scale 2, and `runUpscale` passed `-s 2` together with `-n realesrgan-x4plus`.

The official v0.2.5.0 `realesrgan-ncnn-vulkan` binary appends `-x2`, `-x3`, or `-x4` only when the model name is `realesr-animevideov3`. Every other name loads `<name>.param` and still sizes the output buffer at the `-s` value. `realesrgan-x4plus` is a 4× network. `-s 2` with that name writes a 2× buffer from a 4× network. The windows, macOS, and Ubuntu release zips each contain `models/realesr-animevideov3-x2.param` and `.bin`, and an unsuffixed `models/realesrgan-x4plus`. This review listed those entries after downloading the three archives.

Correction in `packages/assets/src/upscale.ts`: `realesrganModelForScale` returns `realesr-animevideov3` for scale 2 and `realesrgan-x4plus` for scale 4. `runUpscale` passes that name as `-n` (lines 120–131). The same photo still goes through the local runner. The action stays `upscale`. Imagine is not called. Scale 2 uses the archive's only native 2× weights, which are the anime-video model. Scale 4 stays on the photo model.

Test `runUpscale passes separate args and throws the runner stderr` requires `-s 2` with `-n realesr-animevideov3`, and requires that name to differ from `realesrgan-x4plus`. The scale 4 call still requires `realesrgan-x4plus`.

`pnpm --filter @hitchhiker/assets test` after the fix: exit 0, 71 pass, 0 fail, 0 skipped.

## 057 Grade uploads and upscale with Real-ESRGAN, weights fetched on first use

### Truths

- Upscaling is on and runs locally. `upscalePlan` in `packages/assets/src/upscale.ts` returns `upscale` when the long side is under the target (lines 81–87). Default target is 1920 (line 18). `scaleFor` (lines 45–48) returns 4 when `longSide * 2` is still under the target, and 2 when 2× meets it. `runUpscale` (lines 103–137) calls the injected spawn with separate arguments: `-i`, `-o`, `-s`, `-m`, `-n`. It throws the runner stderr on a non-zero code (lines 133–136). There is no shell string. Test `an 800 px product shot upscales 4x, a 1200 px frame upscales 2x, and a sharp 2400 px frame is skipped` requires scale 4, scale 2, and reason `already large enough`. Test `runUpscale passes separate args and throws the runner stderr` uses `C:\Photos\founder portrait.png` as one argument and requires the stderr text `vulkan device lost`. Test `upscalePlan feeds runUpscale with the paths ensureUpscaler returns` passes the cache runner and model directory into that spawn. The scale-2 model correction is the Fix section.

- Weights are fetched at first use and are not committed. `ensureUpscaler` in `packages/assets/src/model-fetch.ts` (line 441) writes under `cacheDir/.hitchhiker/models/realesrgan/` (`realesrganCacheRoot`, lines 176–178). A missing file is fetched with the injected `fetchImpl`, hashed, and renamed into place. A second call whose bytes already match returns `downloaded: false` and does not fetch (lines 465–468). A sha256 mismatch deletes the `.partial` file and throws `UpscalerChecksumError` (lines 481–484). Offline fetch throws `UpscalerOfflineError` with one line: `Real-ESRGAN is not cached and the download failed. The original image is unchanged.` (lines 38–42). Test `ensureUpscaler downloads each file for this platform once, then reuses the cache`. Test `a sha256 mismatch deletes the partial file and throws UpscalerChecksumError`. Test `offline on first use throws UpscalerOfflineError and leaves no runner`. Test `a portable archive is unpacked to the runner and the model directory`. Test `packages/assets contains no committed weight files` walks `packages/assets` and fails on `.pth`, `.bin`, `.param`, or `.onnx`. `git ls-files` for those extensions plus `.zip` finds two already-tracked vendor fixtures, `vendor/gsd-core/tests/fixtures/base64-locale/non-utf8-binary.bin` and `non-utf8-with-b64blob.bin`. They are locale fixtures. No weight archive is tracked. `.gitignore` adds `*.pth`, `*.onnx`, `*.param`, and `*.bin`.

- Real subjects are not silently replaced. `replacementAllowed` (lines 40–43) is false for a real subject unless `yes` is true. A long side under the target returns `upscale` before that gate (lines 81–87). A sharp image at the target returns `skip` with `already large enough` (lines 77–78). A soft real subject at the target, with `yes` false, returns `skip` and the reason `real subject is not replaced without yes` (lines 97–100). `imagine-replacement` is reached only from `replacementAllowed` (lines 90–95). `upscale.ts` does not import Imagine or call `runJobs`. Test `upscalePlan never returns imagine-replacement for a real subject without yes`. Test `replacement is offered only when it is allowed and upscaling will not grow the frame`. Test `upscalePlan does not call Imagine`.

- The grade is from measurements, not a vibe. `grade` in `packages/assets/src/grade.ts` (lines 78–99) starts at 10 and subtracts only for a long side under 512, bytes under 10 kibibytes, and sharpness under 0.3. A long side under 512 is then capped at 4 (line 98). `subjectIsReal` is validated and does not change the score. The reason string is `short side or long side under 512` (line 32). Test `a 1x1 image scores at most 4 and at least 1`. Test `a long side under 512 caps the score at 4 when the file is otherwise fine` requires score 4. Test `511 is under the cap and 512 is not`. Test `the worst measurements clamp at 1 and never return 0`. Test `a real subject does not raise the score of a tiny image` requires the real and not-real 1×1 results to be equal, score 4. Test `sharpness outside 0 to 1 throws`. Test `grade accepts ImageFacts from readImageFacts plus sharpness`.

### Also checked

- This review downloaded the three manifest archives from `xinntao/Real-ESRGAN` v0.2.5.0 and hashed them on 2026-10-06. Windows `45474481` bytes, sha256 `abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d`. macOS `51817124` bytes, sha256 `e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a`. Ubuntu `46931474` bytes, sha256 `e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96`. All three match `UPSCALER_MANIFEST` in `model-fetch.ts` (lines 144–166). Test `the default manifest points at the official portable release` locks those strings. The downloads were deleted after the hash. They were not committed.
- Each zip's runner name matches the platform table: `realesrgan-ncnn-vulkan.exe` on Windows, `realesrgan-ncnn-vulkan` on macOS and Ubuntu. Weights live in a `models/` directory. `vcomp140.dll` sits beside the Windows exe. `findModelDir` returns that `models` directory. The binary accepts a model path only when the path contains `models` or `models2`. Both the unpack path and `.hitchhiker/models/realesrgan` contain `models`.
- The licence text written beside the download is BSD-3-Clause for Real-ESRGAN and MIT for the ncnn runner. BSD and MIT are on the allow list. No new npm package. The runner is not committed.
- v1 §9.6 also describes a Grok vision score and a hero long edge of 2560. Prompt 057's contract is bytes, dimensions, a caller-supplied sharpness, and default target 1920. Matt Q14 and D-007 say upscaling stays on and weights download at first use. They do not set 2560. This slice follows the prompt. The vision score is not invented here.
- `packages/assets/src/index.ts` re-exports `grade`, `upscalePlan`, `runUpscale`, and `ensureUpscaler`. Prompt 057 step 9 requires that file. It is outside the prompt's file list. The commit names it. The fix commit adds `realesrganModelForScale` to the same export.

## 058 Block invented testimonials, awards, and metrics

### Truths

- Invented social proof is a blocker at the brand layer. `lintClaims` in `packages/engine/src/brand/truth.ts` (lines 44–77) returns `{ ok, hits }` and does not rewrite the string. Hits are 1-based. The star pattern is `\b\d(\.\d)? stars?\b` (line 38) unless that phrase sits inside `evidence.quotes`. The percent pattern is `\b\d+%` (line 39) unless those digits sit inside `evidence.numbers`. `award-winning` hits unless `evidence.awards` is non-empty (lines 66–71), in either letter case. A line that is only `## Testimonials` hits unless `evidence.quotes` has an entry (lines 72–74). Empty markdown returns ok (line 49). Test `a fake star rating is a blocker` requires `Loved by 5 stars` to hit `stars` on line 1, and also `4.5 stars` and `5 star`. Test `award-winning is case insensitive and needs award evidence`. Test `a testimonials heading needs quote evidence`. Test `a clean tea story pack passes` builds a Night Stall story with `buildStory` and `renderVoice` and requires `ok: true`. Test `lintClaims returns hits only and does not use the network` keeps the input string unchanged and requires the source to omit `fetch(`, `node:http`, `node:https`, and `writeFile`.

- Only answered or imported text can support a number. `evidenceFromAnswers` (lines 84–100) keeps values whose status is `ANSWERED` or `IMPORTED` (`KEPT_STATUS`, line 42). `SKIPPED`, `SOFT`, and `SUGGESTED` are dropped. Digit runs from a kept value become `numbers`. A star phrase, the word testimonial, or a quotation mark makes quote evidence. The word award or awards makes award evidence. Test `a soft answer does not count as evidence` requires an empty evidence object and `ok: false` for `5 stars`, `40%`, `award-winning`, and `## Testimonials`. Test `a skipped star phrase does not license the line`. Test `answered and imported text can support a number` requires an answered `5 stars` sentence to license `5 stars` and to refuse `4.5 stars`, `5 star`, and a `15 stars` answer. An imported `40%` licenses `40%` and refuses `4%` and `400%`.

### Also checked

- Line numbers are 1-based, including a CRLF line break. Test `line numbers are 1-based`.
- A percent in a CSS note still hits. Test `a percent in a css note is still a hit` requires `/* width: 40%; */` to hit `percent`.
- The prompt text writes the percent pattern as `\b\d+%\b`. In JavaScript a trailing `\b` after `%` does not match before a space or a semicolon, because `%` is already a non-word character. The implementation uses `\b\d+%`, which is what makes `Up 40%` and the CSS edge case hit. The tests lock that behavior. This review leaves the pattern.
- The specified star pattern is one digit plus an optional tenth. `10 stars` does not match it. The prompt says these patterns only.
- Customer names and award names other than `award-winning` are outside those patterns. A quoted name licenses a `## Testimonials` heading when the answer contains a quotation mark. It does not by itself block a name in body copy. SOTD does not become award evidence unless the kept text contains the word award. Test `award-winning is case insensitive and needs award evidence` locks both of those.
- `packages/engine/src/guide/validators.ts` still has its own `lintClaims(text, facts)` and a `TODO(058)`. The signatures differ: the guide returns `string[]` from a `Facts` corpus, and the brand function returns `{ ok, hits }` from `Evidence`. Prompt 058's file list is `truth.ts` and `truth.test.ts`. This review does not retarget the guide validator.

## 059 Compile BRAND.md under 1,500 words

### Truths

- BRAND.md is a compilation, not a new invention. `compileBrand` in `packages/engine/src/brand/brain.ts` joins purpose, positioning, story, voice, tokens, imagery, and neighbors (lines 103–114). Body text comes from the parts. The added lines are the headings, `Status: draft` (line 122), `Why status:`, and `Archetype: … (assumed until approved).` (line 139). `StoryPack.archetypeStatus` is the literal `ASSUMED`. CSS variables go in a fenced `css` block (lines 164–166). Test `the tea-shop fixture compiles under the cap` builds the parts with `compileWhy`, `buildStory`, `renderVoice`, `buildTeardown`, `proposePalettes`, `renderCssVars`, and `buildImagery`. It requires the markdown to start with `# Purpose`, to contain `Status: draft`, `assumed until approved`, the positioning line, the 25-word and 100-word stories, the site why, `No shared title pattern`, a fenced `--paper` block, and the seven headings in that order. It requires the word count to be at most 1500 and to equal a whitespace split. It requires the file to omit `DP-2.1`, `"status":`, `sk-`, and `xai-`.

- The truth gate runs before the file would be saved. `compileBrand` calls `lintClaims` through `assertClaims` (lines 80 and 91, helper at lines 98–101) and throws `BrandTruthError` with the hit list. `scanSecrets` (lines 67–71) throws `BrandSecretError` on `xai-`, `Bearer `, and `sk-`. The module does not import `node:fs` and does not call `writeFile`. Test `a fake testimonial in a part throws` requires `BrandTruthError` and a `testimonials` hit. Test `a star claim in the teardown throws before a file would be saved`. Test `a voice line that includes xai-secret throws from the secret scan` requires rule `xai-` and requires the message to omit `xai-secret`. Test `scanSecrets throws on xai-, Bearer , and sk-`. Test `compileBrand calls lintClaims, shapes parts, and does not call a model or write a file`.

- The voice bans survive length cutting. Over 1500 words, the first cut drops teardown quotes and the second cut drops the 300-word story (lines 84–89). Voice markdown is copied whole (lines 158–162). If the draft is still over the cap, `compileBrand` throws `BrandLengthError` (line 94). Test `1501 plain words take the cut path and keep Banned` requires the long-story marker to be gone, the 25-word and 100-word stories to remain, and `Banned` plus `seamless` to remain between `## Voice` and `## Tokens`. Test `a long teardown drops quotes, then the 300-word story, and keeps Banned`. Test `envy and boredom bodies are quotes and go before the long story` requires the envy and boredom bodies to go and the long story to stay when that is enough. Test `1501 words after the allowed cuts throw instead of dropping Banned` puts the extra words in the voice section and requires `BrandLengthError`.

### Also checked

- Exactly 1500 words passes and keeps the long story. Test `a word count of exactly 1500 passes`.
- An empty teardown still compiles and keeps `Banned`. Test `an empty teardown still compiles`.
- CRLF input matches the LF compile. Test `CRLF input is normalized`.
- A percent inside the token fence is blanked before `lintClaims` (`hideFences`, lines 214–216) and remains in the returned markdown. Test `a percent inside the token fence is not a claim`. `lintClaims` itself still hits a CSS percent when the caller passes the CSS, which is the 058 rule.
- A claim inside a teardown quote throws on the pre-cut draft as well as the final draft (lines 80–81). A percent that lived only in an envy line is refused even though the length cut would have removed that line. The returned markdown still cannot contain a hit.
- The brand barrel and `packages/engine/src/index.ts` do not re-export `compileBrand` or the brand `lintClaims`. Both functions are exported from their modules. The prompt file lists stop at `brain.ts` and `truth.ts`. The tests import those modules.
- Prompt 059 forbids a model call in this module and assigns the live Grok call to prompt 061 through the 011 adapter. `brain.ts` does not import `packages/engine/src/ai/`. No cassette was owed.

## UI at 375 and 1440

No file under `packages/app/` is in `git diff --name-only f184502..HEAD`. Prompts 057, 058, and 059 did not change a screen. The fix commit does not either. No browser session, and no 375 or 1440 screenshot. There is no rendered surface in this group to compare with `packages/app/src/design/`.

## Live Grok

057 does not call Imagine. `upscalePlan` returns an action. `runUpscale` talks only to the injected spawn. 058 has no network call. 059 is the deterministic shaper. The prompt says the live brand-module call is wired in 061 and must go through the 011 adapter. This module does not leave a scripted stub in place of that call. It does not call a model. No cassette was owed.

## File list

`git diff --name-only f184502..a2b26fe` is 11 files. The fix commit adds lines to three of them.

Prompt 057 list, plus the step-9 export and the gitignore the prompt body requires:

- `packages/assets/src/grade.ts`
- `packages/assets/src/upscale.ts`
- `packages/assets/src/model-fetch.ts`
- `packages/assets/test/grade.test.ts`
- `packages/assets/test/upscale.test.ts`
- `packages/assets/src/index.ts`
- `.gitignore`

Prompt 058 list, exact:

- `packages/engine/src/brand/truth.ts`
- `packages/engine/test/truth.test.ts`

Prompt 059 list, exact:

- `packages/engine/src/brand/brain.ts`
- `packages/engine/test/brain.test.ts`

No extra feature file. Nothing to revert. The zip unpacker lives inside `model-fetch.ts` so the official portable archive can be verified and extracted without a new dependency.

## Notes

These are not failed truths.

- Scale 2 uses `realesr-animevideov3` because that is the native 2× pair in the v0.2.5.0 archive. A 1200 px product photo is still the same file through the local runner. The 4× path uses `realesrgan-x4plus`.
- `*.bin` in `.gitignore` is repo-wide. The two tracked vendor `.bin` fixtures stay tracked. Gitignore does not untrack them.
- The guide validator's `TODO(058)` remains. See 058 above.
- v1 §9.6's vision score and 2560 hero are recorded under 057. This slice does not add them.
- `.hitchhiker-dev/` and `packages/engine/summaries/` are absent, so no summary file was written. Each build commit body holds the summary.

## Verification

Commands run from the repo root on this review.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/060-REVIEW.md` | this file |
| `pnpm --filter @hitchhiker/assets test` | exit 0 after the fix. 71 pass, 0 fail, 0 skipped |
| `pnpm --filter @hitchhiker/engine test` | exit 1 on three runs. See the known issue |
| `pnpm --filter @hitchhiker/engine exec node --experimental-strip-types --test test/truth.test.ts test/brain.test.ts` | exit 0. 26 pass, 0 fail |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail a test.

### Known issue

`pnpm --filter @hitchhiker/engine test` exited 1 three times. All three failed `timeout kills the child process tree` in `packages/engine/test/ai-think.test.ts`. The reported stack is `rmSync` at line 443, `EPERM` on that test's temp directory. The timeout assertion is the line above that cleanup. One of the three runs also failed `a Windows batch shim receives the prompt as an argument` because `timedOut` was true inside an 8 second budget. The other two runs passed that test.

That file belongs to prompt 011. It is outside the 057, 058, and 059 file lists. The truth tests and the brain tests passed inside the same failing suite runs, and they passed again as the narrower command above. The app does not fail to start because of this. This review does not patch it. A second edit to that test would be a new surface for this checkpoint.

## Scope

One fix commit, `ab52b46`, scoped to the scale-2 runner model. No second fix. No prompt 061 work. No push, no remote, no deploy.
