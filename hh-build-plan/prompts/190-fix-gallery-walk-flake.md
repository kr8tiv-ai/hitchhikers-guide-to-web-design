---
id: "190"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix the flaky gallery walk E2E test at its root"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["189"]
files: ["packages/app/e2e/gallery-walk.spec.ts", "packages/app/src/", "packages/app/test/"]
review_checkpoint_embedded: false
---

# 190. Fix the flaky gallery walk E2E test at its root
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

The E2E test `packages/app/e2e/gallery-walk.spec.ts:26` "walks a fixture pack to 10 loves and a 4 site shortlist at 375 and 1440" has now failed twice on docs-only commits, so it is a repeated flake, not a one-off. Find the real cause and fix it so the test passes every time on Windows, macOS, and Linux, without weakening any assertion.

## Why this prompt exists

Red main hides later regressions and blocks the improve loop, whose score treats any red test as a regression. A flaky test that sometimes fails on commits that change no code trains everyone to ignore red.

## Known failures

1. 2026-10-10, run 38081671086 on docs-only commit 9e1d11b: `toHaveAttribute` failed in this test. The next two commits passed.
2. 2026-10-11, run 38154097529 (workflow E2E) on docs-only commit 63965bc (only a prompt file changed). Exact log:

```
✘ 5 [chromium] › e2e/gallery-walk.spec.ts:26:1 › walks a fixture pack to 10 loves and a 4 site shortlist at 375 and 1440 (6.8s)
Error: expect(locator).toHaveAttribute(expected) failed
Timeout: 5000ms
- Expect "toHaveAttribute" locator('#hh-gallery') with timeout 5000ms
>  99 |     await expect(page.locator("#hh-gallery")).toHaveAttribute("data-phase", "narrowing");
   100 |     await expect(page.locator("#hh-gallery")).toHaveAttribute("data-loves", "10");
```

So after the loop of ten `keepLove` calls the gallery never reached the narrowing phase, which means at least one love was not kept.

Leading suspect, to confirm or reject by evidence: `keepLove` clicks Keep and then only waits for `#hh-gallery` to exist. It never waits for the kept card to leave or for `data-loves` to increase. The next call can grab `.hh-site` first before the re-render, so it may click love, fill the textarea, or press Keep on a card that is being replaced, and that keep is lost. The other possibility is a real product bug: a fast second Keep, or a re-render while the user is typing, drops a love or the reason. If it is a product bug, fix the product, because a real user can click that fast too.

## Read first

- `packages/app/e2e/gallery-walk.spec.ts` (the test, `keepLove`, `columnCount`, `fits`)
- The gallery screen source in `packages/app/src/` (find it by `#hh-gallery`, `data-keep`, `data-loves`, `data-phase`)
- `.github/workflows/e2e.yml` and the Playwright config for retries, workers, and timeouts
- `gh run view 38154097529 --log-failed` and `gh run view 38081671086 --log-failed` if `gh` is authenticated (read-only)
- `.hh-driver/FLAKES.md` if present, for the list of other known flaky tests

## Steps

1. Verify first. Reproduce locally: run this one spec many times in a row (for example `pnpm --filter @hitchhiker/app exec playwright test e2e/gallery-walk.spec.ts --repeat-each=40`), and also under CPU pressure or with `--workers` matching CI. Record the failure rate before the fix. If it never fails locally, add temporary tracing (the `data-loves` value after each keep) and reason from the code which step can drop a keep. Remove the tracing before committing.
2. Decide: product race or test race. Write the evidence in the summary.
3. Fix the root cause. If the product drops a keep or a reason under fast input, fix the gallery state handling and add a unit or E2E test that clicks Keep quickly in a row and proves no love is lost. If it is a test race, make `keepLove` wait for the exact expected state after each keep (for example `data-loves` equals the new count and the kept card is gone), which is stricter than today, not looser.
4. Run the spec at least 40 times in a row with 0 failures, then run the whole E2E suite twice.
5. Check the other entries in `.hh-driver/FLAKES.md` for the same pattern (acting on a list item right after a click that re-renders it, such as `e2e/suggestion-choices.spec.ts` "arrow keys + Enter pick a choice at 1440"). Fix the same pattern there only if the evidence shows it is the same race, and record each one as fixed or not the same issue.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not add Playwright retries, `test.slow`, `test.fixme`, `test.skip`, or longer timeouts to hide the failure.
- Do not delete, loosen, or reorder assertions in a way that checks less than before.
- Do not weaken approval gates: brief approval, prompt approval, Elevate, Hostinger yes.
- Do not restyle anything. No new dependencies. No change to run-build.ps1 or the queue runner.
- Do not start the next prompt.

## Acceptance criteria

- [ ] The root cause is named with evidence (failure rate before and after, and which step lost the keep).
- [ ] The gallery walk spec passes 40 times in a row locally with every original assertion intact.
- [ ] If the product had a race, a new test proves fast repeated Keeps lose nothing.
- [ ] No test was skipped, deleted, or loosened, and no retries or longer timeouts were added.

## must_haves

truths:

- Ten kept loves always move the gallery to the narrowing phase with `data-loves` at 10.
- The fix is in the product or in a stricter wait, never in a retry or a looser assertion.
- `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, and the E2E suite pass locally on Windows.
- No approval gate behavior changed and nothing was restyled.

artifacts:

- The fix in `packages/app/src/` or `packages/app/e2e/gallery-walk.spec.ts`
- Any new regression test
- Root-cause notes in the commit body

key_links:

- `keepLove` in the spec and the gallery Keep handler in the app agree on when a keep is done.

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
pnpm --filter @hitchhiker/app exec playwright test e2e/gallery-walk.spec.ts --repeat-each=40
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/190.md` if that directory exists. Name the root cause with evidence, the files changed, the failure rate before and after, the other flakes checked, the tests run, and anything assumed.

## Commit

```
fix(e2e): make the gallery walk test reliable by fixing the keep race at its root
```