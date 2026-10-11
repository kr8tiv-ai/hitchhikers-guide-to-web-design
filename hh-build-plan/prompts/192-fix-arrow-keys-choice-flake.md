---
id: "192"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix the flaky arrow keys choice E2E test at its root"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["191"]
files: ["packages/app/e2e/suggestion-choices.spec.ts", "packages/app/src/", "packages/app/test/"]
review_checkpoint_embedded: false
---

# 192. Fix the flaky arrow keys choice E2E test at its root
## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

Additional rules for this session only:

- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated. If it is not, work from the failure list below.


## Goal

The E2E test `packages/app/e2e/suggestion-choices.spec.ts:155` "arrow keys then Enter pick a choice" has now failed twice, once at 1440 and once at 375, both times with the next question `[data-question-id='DP-0.2']` never appearing. That makes it a repeated flake, not a one-off. Find the real cause and fix it so the test passes every time on Windows, macOS, and Linux, without weakening any assertion.

## Why this prompt exists

Red main hides later regressions, and the improve loop treats any red test as a regression. Prompt 190 step 5 was told to check this test for the same race as the gallery walk. Start by reading what 190 found.

## Known failures

1. 2026-10-11, run 38113279055 (workflow E2E) on f076fc2, "arrow keys + Enter pick a choice at 1440": `locator('[data-question-id=\'DP-0.2\']')` not found in 5000ms. A rerun of the failed job passed.
2. 2026-10-11, run 38156150762 (workflow E2E) on docs-only commit e8385f4 (only a prompt file changed), "arrow keys then Enter pick a choice at 375":

```
1) [chromium] › e2e/suggestion-choices.spec.ts:155:3 › arrow keys then Enter pick a choice at 375
   Error: expect(locator).toBeVisible() failed
   Error: element(s) not found
   Locator: locator('[data-question-id=\'DP-0.2\']')
     at packages/app/e2e/suggestion-choices.spec.ts:172:26
```

Leading suspects, to confirm or reject by evidence: the test presses ArrowDown and Enter as soon as the radiogroup is visible, before focus has moved into the group or before the choice handlers are attached, so the keys land on the page or on the Suggest button. Or a real product bug: a choice picked by keyboard right after the choices render is dropped, or the card re-renders and loses focus. If it is a product bug, fix the product, because a fast keyboard user can do the same thing.

## Read first

- `packages/app/e2e/suggestion-choices.spec.ts` (this test, `openCard`, and the click-based tests that pass reliably)
- The suggestion choice component in `packages/app/src/` (find it by `radiogroup`, `data-question-id`, `data-assumed`)
- `.github/workflows/e2e.yml` and the Playwright config for retries, workers, and timeouts
- The commit and summary from prompt 190 (`.hitchhiker-dev/summaries/190.md` if present), and `.hh-driver/FLAKES.md` if present
- `gh run view 38156150762 --log-failed` and `gh run view 38113279055 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. If prompt 190 already fixed this test, prove it: run `pnpm --filter @hitchhiker/app exec playwright test e2e/suggestion-choices.spec.ts --grep "arrow keys" --repeat-each=40` with 0 failures, also under CPU pressure or with `--workers` matching CI. If it holds, record the evidence in the summary, change nothing else, and finish.
2. Otherwise reproduce and record the failure rate before the fix. If it never fails locally, add temporary tracing (where focus is, which element received each key) and reason from the code. Remove the tracing before committing.
3. Decide: product race or test race. Write the evidence in the summary.
4. Fix the root cause. If the product drops a keyboard pick or loses focus on render, fix the component and add a test that picks by keyboard immediately after the choices appear. If it is a test race, wait for the exact expected state before pressing keys (for example the first radio is focused), which is stricter than today, not looser.
5. Run the targeted test 40 times in a row with 0 failures at both viewports, then run the whole E2E suite twice.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not add Playwright retries, `test.slow`, `test.fixme`, `test.skip`, or longer timeouts to hide the failure.
- Do not replace the keyboard steps with clicks. The test exists to prove keyboard picking works.
- Do not delete, loosen, or reorder assertions in a way that checks less than before.
- Do not weaken approval gates: brief approval, prompt approval, Elevate, Hostinger yes.
- Do not restyle anything. No new dependencies. No change to run-build.ps1 or the queue runner.
- Do not start the next prompt.

## Acceptance criteria

- [ ] The root cause is named with evidence (failure rate before and after, and where the keys went), or 190's fix is proven with 40 clean runs.
- [ ] The arrow keys test passes 40 times in a row locally at 375 and 1440 with every original assertion intact.
- [ ] If the product had a race, a new test proves an immediate keyboard pick is never lost.
- [ ] No test was skipped, deleted, or loosened, and no retries or longer timeouts were added.

## must_haves

truths:

- ArrowDown then Enter on fresh choices always picks the second choice and shows the next question with "Assumed:" set.
- The fix is in the product or in a stricter wait, never in a retry, a click substitute, or a looser assertion.
- `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, and the E2E suite pass locally on Windows.
- No approval gate behavior changed and nothing was restyled.

artifacts:

- The fix in `packages/app/src/` or `packages/app/e2e/suggestion-choices.spec.ts`
- Any new regression test
- Root-cause notes in the commit body

key_links:

- The spec and the choice component agree on when the choices are ready for keyboard input.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not restyle: keep the cream editorial desk, the rust rule, and the Don't Panic wordmark.
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm --filter @hitchhiker/app exec playwright test e2e/suggestion-choices.spec.ts --grep "arrow keys" --repeat-each=40
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/192.md` if that directory exists. Name the root cause with evidence (or the proof that 190 fixed it), the files changed, the failure rate before and after, the tests run, and anything assumed.

## Commit

```
fix(e2e): make the arrow keys choice test reliable by fixing the race at its root
```