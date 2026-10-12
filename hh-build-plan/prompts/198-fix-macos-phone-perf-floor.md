---
id: "198"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Make the starter fixture clear the 90 phone performance floor reliably on macOS CI"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["197"]
files: ["packages/qa/test/live-gates.test.ts", "packages/qa/src/", "packages/qa/test/fixtures/", "packages/qa/fixtures/"]
review_checkpoint_embedded: false
---

# 198. Make the starter fixture clear the 90 phone performance floor reliably on macOS CI
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

The CI unit test `packages/qa/test/live-gates.test.ts:436` "the starter fixture clears the real phone gates" has now failed twice on macos-latest only, both times on the Lighthouse phone performance floor. Ubuntu and Windows pass the same commits. Two occurrences means this is no longer a one-off. Find the real reason the starter fixture scores 80 to 81 on macOS runners and fix it so the fixture clears 90 with margin on every runner, with the 90 floor and every assertion intact.

## Known failures

1. 2026-10-11, run 38151857776 (workflow CI) on 6d8d736, macos-latest: phone performance 81 < 90, total-blocking-time score 0.36. A rerun of the failed job passed.
2. 2026-10-11, run 38187793053 (workflow CI) on be9d486, macos-latest: `not ok 16 - the starter fixture clears the real phone gates`, `Phone performance is 80, below the floor of 90. | total-blocking-time 0.33 | max-potential-fid 0 | render-blocking-resources 0.5 | bf-cache 0 | network-dependency-tree-insight 0 | render-blocking-insight 0.5`, `'BLOCKER' !== 'PASS'` at live-gates.test.ts:474. Ubuntu and Windows jobs were green on the same commit; E2E and Audit were green.

Leads to confirm or reject by evidence (do not assume any of them):

- The fixture itself has render-blocking CSS or script and main-thread work that costs total blocking time. On a fast runner it scrapes past 90; on the slower, throttled macOS runner it does not. If so, the product fix is in the fixture or in what the starter template ships (inline critical CSS, `defer` or module scripts, no blocking font or motion bundle before first paint), which also makes real starter sites faster.
- The gate runs Lighthouse while other heavy work in the same test (the 16 review screenshots captured just before, or parallel test files) is still using the CPU. If so, fix the ordering or isolation so Lighthouse measures the page and not the runner's other work.
- How the gate aggregates its runs (`row.runs >= 3`). Check whether it takes the median as Lighthouse recommends. If it takes the worst or the first run, that is a real measurement bug; fixing it to the median is allowed only if the code and docs already say median, and the summary must say why.

## Read first

- `packages/qa/test/live-gates.test.ts` (the test at 436 and `startFixtureSite`)
- The gate code it calls (`runGates`, the Lighthouse runner and its config, throttling and run aggregation) under `packages/qa/src/`
- The starter fixture site it serves, and the starter template it mirrors
- `.github/workflows/ci.yml` to see how the macOS job runs tests (parallelism, concurrency)
- `.hh-driver/FLAKES.md` if present
- `gh run view 38187793053 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. Run the targeted qa test on Windows and record the performance score and the total-blocking-time and render-blocking audit numbers for each run. If a later commit already made macOS CI green on this test across several runs, prove it with run ids, change nothing else, and finish.
2. Find the cause with evidence. Use the Lighthouse JSON (main-thread tasks, render-blocking resources, TBT contributors) from a local run with the same throttling settings CI uses. Name what costs the blocking time and what blocks render.
3. Fix the root cause in product code or the fixture it represents, not in the threshold. The fixture must keep representing what a real starter site ships, so a fix that only makes the fixture fake-fast is not allowed.
4. Add or tighten a test that pins the fix (for example, the starter page has no render-blocking stylesheet or script in the head, or the gate reports the median of its runs).
5. Run the targeted qa test 5 times in a row on Windows and record each performance score. Every run must be 90 or higher, and the lowest should have a clear margin above 90. Run `pnpm -r test` twice.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not lower the 90 floor, lower Lighthouse throttling, drop the phone form factor, reduce `runs`, retry until green, or gate or skip the test on macOS (no `process.platform === "darwin"` checks, no `test.skip`, no `todo`).
- No new dependencies. No change to run-build.ps1, the queue runner, or the CI workflow files.
- Do not restyle the app. Do not start the next prompt.

## Acceptance criteria

- [ ] The cause is named with Lighthouse evidence from step 2.
- [ ] The starter fixture clears every phone gate at 90 or above in 5 of 5 local runs, with the numbers in the summary.
- [ ] A test pins the fix.
- [ ] No floor, throttle, run count, or assertion was weakened, skipped, or platform-gated.

## must_haves

truths:

- The phone performance floor stays at 90 for every route.
- The starter page ships no render-blocking resource it does not need before first paint.
- The live gate measures the page, not other work on the runner.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` pass locally on Windows.

artifacts:

- The fix in the fixture, starter template, or gate code
- The regression test
- Root-cause notes and the 5 run scores in the commit body

key_links:

- The fixture the test serves matches what the starter template ships.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not weaken, skip, or delete a test.
- Do not start the next prompt.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm --filter @hitchhiker/qa test
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/198.md` if that directory exists. Name the cause with evidence, the files changed, the 5 local scores, the tests run, and anything assumed.

## Commit

```
fix(qa): starter fixture clears the phone performance floor with margin on every runner
```