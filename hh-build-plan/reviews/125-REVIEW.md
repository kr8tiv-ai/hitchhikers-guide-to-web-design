# 125 Review — prompts 122, 123, 124

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 126 is not started. Mostly Harmless does not close here (`phase_end: false`; the phase checkpoint is 139).

Each must-have truth has a test name and a file line. `pnpm --filter @hitchhiker/qa test` exited 0: 136 pass, 0 fail.

## History

Three build commits, in order, on top of `7df0d57` (the 121 review). Each message matches that prompt's commit line. Each commit has one parent. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `4397b93` | `7df0d57` | `feat(qa): gate Lighthouse on real mobile runs at 90 in all four categories` | same, prompt 122 |
| 2 | `e7ef0c3` | `4397b93` | `feat(qa): gate axe, keyboard, motion, and contrast` | same, prompt 123 |
| 3 | `4f1f618` | `e7ef0c3` | `feat(qa): gate SEO structure and weight` | same, prompt 124 |

HEAD at review start was `4f1f618`. The working tree was clean.

The diff from `7df0d57` through `4f1f618` is 6 files, 1341 insertions. Each commit contains only that prompt's pair:

- `4397b93`: `packages/qa/src/lighthouse-gate.ts`, `packages/qa/test/lighthouse-gate.test.ts`
- `e7ef0c3`: `packages/qa/src/a11y-gate.ts`, `packages/qa/test/a11y-gate.test.ts`
- `4f1f618`: `packages/qa/src/weight-gate.ts`, `packages/qa/test/weight-gate.test.ts`

No other path. No package was added. No library was swapped. `@theatre/studio` is absent. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries, as each prompt allows.

## 122 Gate Lighthouse on real mobile runs: all four scores at 90

### Truths

- Real mobile runs are the gate: all four categories at 90 or more on every route. `evaluateLh` takes one phone score object (`packages/qa/src/lighthouse-gate.ts` lines 179–217). There is no route id and no floor that drops for a heavy scene. `phone === null` or an omitted phone pushes `A real mobile run is required.` and returns `BLOCKER` (lines 196–201), including when `heavy` is false. `phoneFailures` compares performance, accessibility, best practices, and SEO with the four floors (lines 148–163). `FLOOR_MIN` is 90 (line 51) and `readFloor` throws `Floors below 90 are rejected.` (lines 115–117). A ratio at or under 1 is multiplied by 100 and snapped at 1e-9, so 0.9 lands on 90 and 0.89 lands on 89 (lines 77–81). Test `phone performance 89 fails and 90 passes when the other three are at least 90` (`packages/qa/test/lighthouse-gate.test.ts` line 76). Test `phone accessibility 89 fails` (line 93). Test `phone best practices 89 fails` (line 103). Test `phone SEO 89 fails` (line 113). Test `a ratio under 0.9 fails the matching phone category` (line 123). Test `a missing phone run is a blocker` (line 161). Test `heavy false and phone null is still a blocker` (line 172) passes a perfect desktop object and still requires `BLOCKER`. Test `a floor of 95 is applied and a floor of 70 is rejected` (line 224). The call is one route. A missing phone on that call is a blocker. This prompt's signature has no route list, and the unit test does not shell out to LHCI. Median-of-3 and the mobile preset stay with the runner. Prompt 126 is the live-gate prompt. This review does not add a runner.

- A11y, best practices, and SEO stay at 90 anywhere they are measured. The same `phoneFailures` rows use `a11yMin`, `bestPracticesMin`, and `seoMin`. Test `accessibility, best practices, and SEO floors below 90 are rejected` (lighthouse-gate.test.ts line 250) throws on 89 for each of those three keys. Test `GuideConfig gate defaults are 90 for every phone category` (line 43) requires `defaultConfig().gates` to be 90 on `phonePerfMin`, `a11yMin`, `bestPracticesMin`, and `seoMin`. D-006 and the prompt goal measure Lighthouse on the phone run. The goal says a desktop run is informational and never waives the phone. `evaluateLh` appends `desktopNote` and leaves `status` on the phone failures alone (lighthouse-gate.ts lines 210–216). Test `desktop performance 40 does not fail a passing phone run and is informational` (line 133) requires `PASS` and the sentence `A desktop run does not waive the phone.` Test `a low desktop accessibility score does not waive or fail the phone` (line 146) passes desktop accessibility, best practices, and SEO at 40 when the phone object is at 90, and requires the informational sentence plus the phone-fallback note when `heavy` is true. The 90 floor on those three categories is the phone measurement and the stored floor. A desktop number is reported. It does not raise or lower the phone verdict.

### Key link

Floors come from `GuideConfig.gates`. `LhFloors` is `Pick<GuideConfig["gates"], "phonePerfMin" | "a11yMin" | "bestPracticesMin" | "seoMin">` (lighthouse-gate.ts lines 40–43). `desktopFpsMin` is not read. Test `phone scores at the config floors pass` (line 51) passes `defaultConfig().gates` straight through, including the extra `desktopFpsMin: 30`, and requires `PASS` at 90. Defaults live in `packages/engine/src/config.ts` lines 375–380. The config store still accepts a gate from 0 to 100 (`LIGHTHOUSE_MIN` at config.ts line 121). `evaluateLh` refuses to apply a floor under 90. That refusal is the prompt's rule. Widening the store is outside this file list.

### Also checked

- `fromLhci` maps `{ categories: { performance: { score } } }` and an `lhr.categories` wrapper, reads `best-practices` or `bestPractices`, and throws on a partial report, a null score, or two disagreeing best-practices scores (lighthouse-gate.ts lines 220–293). Test `fromLhci maps a category fixture into the phone gate` (line 335) feeds 0.91, 0.95, 1, and 0.9 into `evaluateLh` and requires `PASS`. Test `fromLhci rejects a partial report instead of inventing scores` (line 373).
- Scores above 100 and negative scores throw. Test `scores above 100 throw and negative scores throw` (line 264). A point score of 1.5 stays 1.5 and fails the floor. Test `a point score of 1.5 is not treated as a ratio` (line 325). The prompt's rule is that a value of 1 or under is a ratio, so 1 scales to 100.
- `heavy: true` with a present phone adds `The mobile run measures the phone fallback, which is what the phone gets.` (lighthouse-gate.ts lines 205–207). The floors stay 90.
- Test `the gate module does not shell out or download a browser` (line 424) reads the source and rejects `node:child_process`, `node:https`, `@lhci/cli`, `playwright`, and `puppeteer`. No Chrome download.

## 123 Check axe, keyboard, reduced motion, and contrast

### Truths

- The a11y gate is structured and testable without a browser. `evaluateA11y` reads a violations array, two booleans, a contrast number, and `motionUsed` (`packages/qa/src/a11y-gate.ts` lines 113–147). Serious and critical impacts push a blocking note. Moderate blocks too, and the note `Moderate is included. It blocks along with serious and critical.` is appended when any moderate hit is present (lines 127–135). Prompt step 1 adds moderate and says to document it. The goal line names serious and critical. The implementation is the stricter floor, which the a11y pack allows when the Guide floor is stricter. Minor is a note and leaves status `PASS` when nothing else blocks (lines 128–130). An impact outside `minor | moderate | serious | critical` throws (lines 77–80). Test `a serious axe hit blocks` (`packages/qa/test/a11y-gate.test.ts` line 35). Test `a critical axe hit blocks` (line 41). Test `a moderate axe hit blocks and the note says moderate is included` (line 47). Test `a minor axe hit is a note and does not block` (line 56). Test `an unknown axe impact throws` (line 153). Test `empty axe, keyboard, reduced motion, and contrast 21 pass` (line 29). Test `the gate source does not import a browser or axe-core` (line 175) rejects `node:child_process`, `playwright`, `puppeteer`, and an axe-core import. The tests construct objects. They do not launch a browser. axe-core is not a dependency.

- Keyboard access is not optional. `hasKeyboardPath === false` pushes `Keyboard path is missing.` even when the violations list is empty (a11y-gate.ts line 136). Test `a missing keyboard path blocks when axe is empty` (a11y-gate.test.ts line 75) requires `BLOCKER` and that single note.

### Key link

`contrastRatio` matches the brand token helper's threshold. `BODY_CONTRAST_MIN` is 4.5 (a11y-gate.ts line 23). A ratio under 4.5 blocks, so 4.5 passes (lines 140–142). `passes` in `packages/engine/src/brand/tokens.ts` uses `BODY_MIN` for kind `"body"` (tokens.ts lines 45 and 107–109). `BODY_MIN` is 4.5. Test `body contrast 4.5 passes and 4.49 blocks` (a11y-gate.test.ts line 106). Test `the body contrast floor matches the brand token helper` (line 115) reads `tokens.ts`, requires `BODY_MIN` to equal `BODY_CONTRAST_MIN`, and requires the body branch of `passes`. The prompt allows a passed-in number. `contrastRatio()` is not called, because this prompt's file list does not add it to the engine barrel. The threshold the gate applies is the body threshold.

### Also checked

- Reduced motion is required only when motion is used. `motionUsed && !hasReducedMotion` blocks (a11y-gate.ts lines 137–139). Test `motion without reduced-motion handling blocks` (line 81). Test `unused motion does not require the reduced-motion flag` (line 93) passes with both flags false and contrast 4.5.
- Test `every blocker is listed, and a minor stays a note` (line 125) requires critical, moderate, serious, the moderate sentence, the keyboard sentence, the reduced-motion sentence, the contrast sentence, and the minor note, in that order.

## 124 Check titles, crawlable text, links, and weight budgets

### Truths

- Low appetite cannot carry a heavy payload. `budgetBytes` returns 500_000 for appetite 1–2, 1_500_000 for 3–5, 4_000_000 for 6–8, and 8_000_000 for 9–10 (`packages/qa/src/weight-gate.ts` lines 25–30 and 105–107). `evaluatePage` blocks when `bytes` is greater than that ceiling (lines 135–137). Level 2 at 500_000 bytes is under one megabyte. The level 9–10 ceiling, 8_000_000 bytes, is the multi-megabyte payload a level 2 page cannot carry. Test `budgets step at appetite boundaries 2, 3, 5, 6, 8, and 9` (`packages/qa/test/weight-gate.test.ts` line 21) locks every level from 1 to 10 and requires `budgetBytes(2) < 1_000_000`. Test `bytes one over the budget block, and the budget itself passes` (line 61) requires `BLOCKER` at 500_001 on appetite 2 and `PASS` at 500_000. Test `a level 2 page cannot carry a level 9 payload` (line 73) sends 8_000_000 bytes at appetite 2 and requires `Page is 8000000 bytes. Appetite 2 allows 500000.` The same byte count at appetite 9 returns `PASS`.

- The checker does not crawl. `evaluatePage` reads `brokenLinks` from the caller and pushes `Broken link ${href}.` for each entry (weight-gate.ts lines 132–134). The module has no fetch. Test `a broken link blocks and the reason includes the href` (weight-gate.test.ts line 53) requires `/pricing` and `/about` in the reasons. Test `the checker does not request urls` (line 131) reads the source and rejects `fetch(`, `node:http`, `node:https`, `undici`, and a URL import, then calls `evaluatePage` with `https://example.test/missing` and requires a synchronous `BLOCKER` whose reason includes that href.

### Key link

Appetite levels match the interview table. DP-6.2 asks for a whole number from 1 to 10, names the ten levels from calm brochure through a world, and pushes back on 0 and 11 (`interview/tree.yaml` lines 657–666). v2 §8.3 lists the same ten levels (`hh-build-plan/CONTEXT-PACKAGE.v2.md` lines 280–291). `readAppetite` accepts only an integer from 1 to 10 (weight-gate.ts lines 60–65). Test `appetite outside 1 to 10 throws` (weight-gate.test.ts line 124) covers 0, 11, -1, 1.5, `NaN`, and `Infinity` on both `budgetBytes` and `evaluatePage`. The byte bands are the numbers in prompt 124's context block. They are page bytes. They are a different measurement from the JS gzip ceilings in `packages/app/src/motion-previews/slider.ts` (90 KB, 160 KB, 250 KB). See Conflicts.

### Also checked

- An empty or whitespace-only title blocks. Test `an empty title blocks, including whitespace only` (line 36) covers `""`, space, tab, newline, and mixed whitespace. `title.trim().length === 0` is the check (weight-gate.ts line 127).
- Zero h1 and two h1 block. Any count other than 1 blocks (weight-gate.ts line 128). Test `zero h1 and two h1 both block` (line 44).
- Crawlable text of 40 passes and 39 blocks. `TEXT_MIN` is 40 (weight-gate.ts line 19). Test `text length 40 passes and 39 blocks` (line 81).
- A filled fixture returns `PASS`. Test `a passing fixture returns PASS` (line 90) uses a padded title, one h1, 40 characters, no broken links, and `budgetBytes(5)` at appetite 5.
- Test `every failure is listed together` (line 105) requires the empty title, the h1 count, the short text, the href, and the byte overflow in one `BLOCKER`.

## Live model calls

Prompts 122, 123, and 124 do not ask for a model call. None of the three modules imports `packages/engine/src/ai/` or calls `think()`. The structured inputs are the prompt's contract. They are not a scripted stand-in for a live call Matt asked these prompts to make. This session did not set `HH_LIVE=1`.

## UI

These prompts did not create or change a file under `packages/app/`. The diff from `7df0d57` through `4f1f618` has no `packages/app` path. No screen was opened. No 375 or 1440 screenshot. No visual pass is claimed.

## Conflicts recorded

- Research 06 and `weightCeiling` in `packages/app/src/motion-previews/slider.ts` budget initial JS gzip at 90 KB (levels 1–4), 160 KB (5–7), and 250 KB (8–10). Prompt 124 sets page-byte ceilings of 500_000, 1_500_000, 4_000_000, and 8_000_000 on bands 1–2, 3–5, 6–8, and 9–10. The prompt's numbers are what `budgetBytes` implements. The slider's JS gzip ceilings are unchanged. Unifying the two measurements would touch the app slider and is outside this checkpoint.
- `GuideConfig.gates` can store a Lighthouse floor from 0 to 100. `evaluateLh` rejects a floor below 90. The store was not in prompt 122's file list.
- v2 §12 also names meta description, Open Graph, alt text, sitemap, robots, canonical, and JSON-LD. Prompt 124's signature is title, h1 count, text length, caller-supplied broken links, and bytes. Those extra SEO fields are not this function.
- v2 §12 names serious and critical axe hits. Prompt 123 step 1 also blocks moderate and says to document that. The source comment and the moderate test record it.

## File list

From `7df0d57` through `4f1f618`: 6 files, 1341 insertions. They match prompts 122, 123, and 124. No file outside those lists.

## Verification

`Test-Path hh-build-plan/reviews/125-REVIEW.md` returned True.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @hitchhiker/qa test` | 0 | 136 pass, 0 fail. Includes the phone 89/90 tests, the missing-phone blockers, the floor-of-70 rejection, the serious and keyboard axe tests, the 4.5 contrast test, the appetite boundary test, the level-2 payload block, and the no-fetch source check. |

## Verdict

PASS. Prompts 122, 123, and 124 each hold on their must-have truths. The file lists match. The qa command exited 0. No fix commit. No test was weakened. No push, no deploy, no remote. Prompt 126 is not started.
