# 111 Review — prompts 108, 109, 110

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 112 is not started.

Every must-have truth for 108, 109, and 110 has a test name and a file line. `pnpm --filter @hitchhiker/qa test` exited 0: 45 pass, 0 fail. `pnpm exec tsc -p packages/qa --noEmit` exited 0. None of these prompts call a model.

## History

Three build commits, in order, on top of `e088249` (the 107 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `6000004` | `e088249` | `feat(qa): capture review screenshots at four widths` | same, prompt 108 |
| 2 | `3b4fa62` | `6000004` | `feat(qa): check truths goal-backward` | same, prompt 109 |
| 3 | `70c2ba9` | `3b4fa62` | `feat(qa): score eight review pillars` | same, prompt 110 |

HEAD at review start was `70c2ba9`. The working tree was clean. No commit sits between these three.

File lists:

- 108: `packages/qa/src/screenshots.ts`, `packages/qa/src/visual-policy.ts`, `packages/qa/test/screenshots.test.ts`, `packages/qa/test/visual-policy.test.ts`, plus `packages/qa/package.json`.
- 109: `packages/qa/src/goal-backward.ts`, `packages/qa/test/goal-backward.test.ts`.
- 110: `packages/qa/src/pillars.ts`, `packages/qa/test/pillars.test.ts`.

`packages/qa/package.json` is outside the declared file list. Prompt 108 step 7 says to add the qa package test script. The commit replaces `node -e "process.exit(0)"` with `node --experimental-strip-types --test test/**/*.test.ts`. That is the harness this review ran. It is not a new feature. `packages/qa/src/index.ts` still exports only `PACKAGE_NAME`. The prompts say to export the functions from their modules, and the file lists do not include the barrel. Tests import the modules by relative path.

No binary snapshots were added. No file under `packages/app/` changed.

## 108 Capture reviewer screenshots at four widths with same-environment baselines

### Truths

- Review screenshots include a phone width and a wide width. `REVIEW_WIDTHS` is the tuple `[375, 768, 1440, 1920]` (`packages/qa/src/screenshots.ts` line 5). 375 is the phone width. 1920 is the wide width. `captureAll` walks that tuple in order and throws before returning if a buffer is empty or the opener throws (lines 25–40). Test `captureAll requests 375, 768, 1440, and 1920 in order` (`packages/qa/test/screenshots.test.ts` line 10) requires the seen widths, the tuple, and the returned keys to equal `[375, 768, 1440, 1920]`, and requires each buffer to be the non-empty `png` payload. Test `an empty buffer at 375 throws and does not continue` (line 31) requires the message to name 375 and requires the opener to have been called only for 375. Test `an empty buffer at a later width stops the run` (line 49) stops at 1440 and does not request 1920.

- Capture is injectable. `captureAll` takes `openPage: (width: number) => Promise<Buffer>` (screenshots.ts lines 21–23). The tests pass their own async function. The module does not launch a browser. Test `the capture modules do not import a browser` (screenshots.test.ts line 103) reads `screenshots.ts`, `visual-policy.ts`, and both test files and requires no `playwright` import. Test `a thrown opener names the width and does not continue` (line 67) requires the wrapped message to contain `768` and `viewport closed`, keeps the original error as `cause`, and requires the next width not to be requested.

- Visual regression does not cross operating systems. `decideVisual` returns `skip-mismatch` when `current.os !== baseline.os` and the reason names both values (`packages/qa/src/visual-policy.ts` lines 32–36). It does not throw. A null baseline returns `skip-missing` with reason `no baseline` (lines 28–30). The function takes `os` as an argument and does not import `node:os` (lines 1 and 20–21). Test `a different os skips and names both` (`packages/qa/test/visual-policy.test.ts` line 21) uses `win32` against `darwin`. Test `os compare is case-sensitive` (line 28) skips `win32` against `Win32`. Test `a null baseline skips with no baseline` (line 15).

- This prompt does not invent a pixel diff. `decideVisual` accepts `BaselineMeta` only (`os`, `scale`, `width`) and returns `compare`, `skip-mismatch`, or `skip-missing` (visual-policy.ts lines 9–26). It does not take image bytes. Test `the policy reuses REVIEW_WIDTHS and does not read image bytes` (visual-policy.test.ts line 88) requires the source to mention `REVIEW_WIDTHS`, requires it not to repeat the width array literal, and requires `pixelmatch`, `pngjs`, `readFileSync`, and `node:os` to be absent. Test `the same meta compares` (line 48) and test `scale 1 and 1.0 compare` (line 42) assert `action === "compare"` for an environment match. Test `the same os and a different scale skips` (line 35). Test `two review widths do not compare` (line 54) skips 375 against 1920. Test `a width outside REVIEW_WIDTHS throws` (line 61) rejects 390 and 430. Test `every review width compares and the next integer throws` (line 80).

### Key links

Widths match v2 §11.3 item 1 and the four widths named in v2 §12's console gate: 375, 768, 1440, 1920. `visual-policy.ts` imports `REVIEW_WIDTHS` from `screenshots.ts` (line 1) and `assertReviewWidth` accepts only those values (lines 53–58). The policy test forbids a second copy of the literal.

### Also checked

- Same environment compares. Different scale or different width skips. Scale `1` and `1.0` compare because the check is numeric inequality (visual-policy.ts line 38).
- A failed width stops the loop. The catch wraps the opener error with the width and rethrows (screenshots.ts lines 27–35). A non-Error throw is covered by test `a non-Error throw still names the width` (screenshots.test.ts line 87).
- A value that is not a `Buffer` fails the same empty-buffer check (screenshots.ts line 36). The unit tests pass `Buffer.from("png")`, as step 3 requires.
- No `any`. No network call. No snapshot file.

## 109 Check a prompt's truths against evidence

### Truths

- A truth is found only when a note is attached. `checkTruths` marks a truth `FOUND` only when an evidence row has that exact string and `note.length >= 10` (`packages/qa/src/goal-backward.ts` lines 28 and 53–62). A truth with no row is `MISSING`. A shorter note is not added. Test `one evidenced truth is FOUND and one without evidence is MISSING` (`packages/qa/test/goal-backward.test.ts` line 14) passes one long note and expects `FOUND` then `MISSING`. Test `a short note does not count` (line 25) uses `ok`. Test `an empty note does not count` (line 30). Test `nine characters are MISSING and ten are FOUND` (line 35). Test `a later real note finds a truth a short note missed` (line 42). Test `whitespace differences fail the match` (line 53) rejects a trailing space, an inner extra space, and a case change. Test `evidence for an unknown truth adds no row` (line 65).

- Passing tests are not implied evidence. The function has no path that reads a suite result. Evidence is the array the caller passes. Test `a green test name is not implied evidence` (goal-backward.test.ts line 79) attaches the note `The suite is green and coverage is 100 percent.` to the truth `pnpm test passed` and requires both real truths to stay `MISSING`. Test `the checker source does not launch a process or open the network` (line 114) requires `checkTruths` in the source and requires `child_process`, `node:fs`, `node:http`, `node:https`, `node:net`, and `fetch(` to be absent.

### Key link

Truths are caller-supplied strings. `SitePrompt` is `{ ...SitePromptSkeleton, rules, body }` and has no `mustHaves` field (`packages/engine/src/spec/site-prompts.ts` lines 130–133). A site prompt's must-haves live in `body`, which `readMustHaves` extracts as one block (`packages/engine/src/spec/edit-prompt.ts` lines 262–275). Prompt 109's interface is `checkTruths(truths: string[], evidence)`. This module does not parse that block and does not treat a green suite as the list. Guide prompt truths are passed the same way: the exact string.

### Also checked

- Empty `truths` throws and the message names `must_haves` (goal-backward.ts lines 41–43). Test `empty truths throw` (goal-backward.test.ts line 90).
- Duplicate truth strings throw before any row is returned (goal-backward.ts lines 45–51). Test `duplicate truths throw` (goal-backward.test.ts line 102).
- Note length is `note.length`. The note is not trimmed. A 10-character note of spaces would be `FOUND`. The prompt's rule is "shorter than 10 characters," and the tests lock 9 and 10. This review does not change that.
- No `any`. The function does not spawn tests.

## 110 Score the six pillars plus motion and brand

### Truths

- The audit has eight pillars, not six. `PILLAR_NAMES` is `copy`, `visuals`, `color`, `type`, `spacing`, `experience`, `motion`, `brand` (`packages/qa/src/pillars.ts` lines 19–40). `summarizePillars` lists every name that was not present, in that order, and sets `worst` to `BLOCKER` when the list is non-empty (lines 97–102). Test `an empty row list names all eight and is a BLOCKER` (`packages/qa/test/pillars.test.ts` line 43) requires `missing.length === 8` and the full order. Test `six visual pillars without motion and brand are a BLOCKER` (line 50) filters to the six visual names and requires `missing` to be `["motion", "brand"]` with `worst` `BLOCKER`. Test `missing names are listed in pillar order and outrank FIX` (line 58) requires `["copy", "type", "brand"]` even when another row is `FIX`.

- The worst status is computed, not guessed. `STATUS_RANK` is `PASS` 0, `FIX` 1, `BLOCKER` 2 (pillars.ts lines 50–55). The fold starts at `BLOCKER` when any name is missing, otherwise `PASS`, then keeps the higher rank (lines 102–107). Test `eight passing pillars summarize to PASS with nothing missing` (pillars.test.ts line 37). Test `BLOCKER beats FIX and FIX beats PASS` (line 67) checks all `PASS`, one `FIX` on type, and `FIX` plus a motion `BLOCKER`. Test `a motion BLOCKER blocks a review that otherwise passes` (line 85) uses the note `The report says two scroll owners.` and requires `worst` `BLOCKER` with nothing missing. Test `a brand BLOCKER blocks a review that otherwise passes` (line 95) uses the note `A testimonial was invented.` Test `worst does not depend on row order` (line 105) reverses the rows and requires the same `BLOCKER`.

### Key link

A motion `BLOCKER` is how a coexistence failure surfaces. The motion test above is that path: status `BLOCKER` on `motion`, every other pillar `PASS`, result `worst === "BLOCKER"`. The brand test is the invented-testimonial path, same fold. The function does not read a screenshot. Test `the scorer does not read a screenshot or launch a browser` (pillars.test.ts line 249) requires all eight names in the source and requires `child_process`, `node:fs`, `fetch(`, `readFile`, `playwright`, `puppeteer`, `.png`, and `fallback` to be absent.

### Also checked

- An empty note throws, including whitespace (pillars.ts lines 82–84). Test `an empty note throws` (pillars.test.ts line 116). Test `a whitespace-only note throws` (line 132).
- A duplicate name throws, including when another pillar is already missing (pillars.ts lines 90–93). Tests at pillars.test.ts lines 148 and 161.
- An unknown name throws. A status outside `PASS` | `FIX` | `BLOCKER` throws. Both checks use a set (pillars.ts lines 42–48 and 74–81). Tests at pillars.test.ts lines 175 and 191.
- A note that contains `replace GSAP` in any case throws, and the message says it is not an allowed fix (pillars.ts lines 57 and 85–89). Test `a note that says replace GSAP throws` (pillars.test.ts line 207) covers `replace GSAP` and `Replace GSAP`. Test `replace GSAP throws before a missing pillar is reported` (line 235). Test `a GSAP note that does not ask to replace it is allowed` (line 222) passes a Lenis-on-`gsap.ticker` note and expects `PASS`.
- No `any`. No browser.

## Live model calls

108, 109, and 110 do not call a model. There is no scripted stub standing in for a live call. The 011 adapter is not involved.

## UI

No prompt in this group changed a file under `packages/app/`. There is no screen to open. This review did not take 375 or 1440 screenshots. The capture contract is a unit-tested opener, and the Playwright opener is prompt 126.

## Conflicts recorded

These are prompt-versus-prompt or prompt-versus-v2. The code follows the interface and the numbered steps. The tests lock those steps. They are not failed must-have truths, so this review does not change them.

- Shot kinds. v2 §11.3 item 1 and the 108 goal sentence name full page, above the fold, and a short scroll strip for motion-led sections. The interface in the same prompt is one `Buffer` per width. `captureAll` returns that map. Prompt 108 says the real Playwright opener is wired in 126, and prompt 126's opener is the file that captures full page, fold, and an 8-frame strip. This module does not parse `MOTION.md` and does not import Playwright.
- Pillar scale. v2 §11.3 item 4 scores six pillars 1–4 and brand dimensions 1–10. Prompt 110, and this review's truths, require eight names scored `PASS`, `FIX`, or `BLOCKER`. `summarizePillars` follows the prompt. Matt's answers and `DECISIONS.md` do not define a pillar scale.
- Absent motion or brand. The 110 context sentence says `requireMotionAndBrand` throws when those keys are absent. Step 1 says missing names are listed and `worst` is `BLOCKER`. The interface returns `{ worst, missing }` and does not declare that function. The code follows step 1. Test `six visual pillars without motion and brand are a BLOCKER`.
- Phone widths elsewhere. v2's responsive section names 375, 390, and 430. Prompt 108 step 13 says a width outside `REVIEW_WIDTHS` throws. `decideVisual` throws on 390 and 430. Review capture stays on the four widths.

## Verdict

PASS. Every truth for 108, 109, and 110 has a test and a file line. `pnpm --filter @hitchhiker/qa test` exited 0 (45 pass, 0 fail). `pnpm exec tsc -p packages/qa --noEmit` exited 0. No UI file changed. No fix. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 112 is not started.
