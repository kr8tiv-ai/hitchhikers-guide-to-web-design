---
id: "219"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Turn main green after 218 ran out of turns (brief revise keeps the correction), then finish 218's PERF-001 leftover"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["218"]
files: ["packages/engine/src/guide/brief-loop.ts", "packages/engine/src/guide/brief-desk.ts", "packages/engine/src/guide/live-turn.ts", "packages/engine/src/", "packages/app/src/server/", "packages/app/src/client/desk.ts", "packages/app/src/client/", "packages/engine/test/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 219. Turn main green after 218 ran out of turns, then finish 218's PERF-001 leftover
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

- Green first. Do not start the PERF-001 work until `pnpm -r test` is fully green and committed.
- Fix root causes. Never weaken, skip, delete, or loosen a test or an assertion to get green. A test may change only when it asserts something the product intentionally changed, and then the new assertion must be at least as strict and the summary must say why. The failing assertion below checks that a user's "Change something" correction actually changes the brief, which is exactly what BUG-030 promised, so expect to fix the product, not the test.
- Owner rule: never lower any Grok call's model or effort (`grok-4.7-build-fast` at the chosen effort, default `xhigh`). Never skip the pushback judge. Speed work means streaming, progress, fewer redundant calls, and parallel non-AI work only.
- Sessions are cut off after about 55 minutes. Commit as soon as each item is green, at least every 20 minutes of work. Never hold more than one item uncommitted.
- If a commit hook fails because Git Bash cannot fork (`0xC0000142`), do not bypass hooks (no `--no-verify`, no `core.hooksPath`). Leave the work staged, record it in the summary, stop.
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network except read-only `gh run list` and `gh run view --log-failed` if `gh` is already authenticated.
- Do not edit run-build.ps1, the driver, `STATE.json`, `.hh-driver/`, `hh-build-plan/`, or CI workflows. Work on `main`. Do not stash.
- Do not touch `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), the desk on 127.0.0.1:4175, 4173, 62828, or `C:\Users\lucid\hh-desk-test`. Use a temp project and another port; stop any server or build process you start.

## Goal

Prompt 218 (Paradise Found e2e fixes, round 3) hit max turns. It committed BUG-031 (5d8cedcc), BUG-028 (9275af81), BUG-030 (b7d4f2f9), BUG-029 (b74e8a1a) and the DP-id heading leftover (999293b3). Its last item, PERF-001 / BUG-017 (12-140 s per answer), was cut off mid-work and the driver auto-committed the dirty tree as 5d53434a ("Committed by .hh-driver after the Grok session ended with a dirty tree"): `packages/app/src/client/desk.ts` (+3), `packages/engine/src/guide/live-turn.ts` (+75/-9), `packages/app/test/answer-timing-218.test.ts`, `packages/engine/test/answer-timing-218.test.ts`. That work is unverified. 218 wrote no summary.

Main is red in CI on tip 5d53434a. Turn it green with a root-cause fix, then finish PERF-001 properly.

## Known failures

1. 2026-10-13, CI run 38378403907 on 5d53434a, unit tests on ubuntu-latest, macos-latest and windows-latest: `packages/engine test: not ok 262 - ten Towel and Tea turns push twice, suggest four cards, and approve the brief` at `packages/engine/test/guide-live.test.ts:466`, assertion at line 536:
   `assert.match(revised.value?.draft.vibe ?? "", /quieter than before/)` after `loop.next("The vibe should say warm paper.")`. Actual vibe: `'Calm, about a three, enough to feel considered.'` (the recorded interview answer). It is the only failing test. Deterministic on all three OSes, not a flake.
2. Suspects (all landed in one push, so there is no per-commit CI to bisect): 9275af81 BUG-028 ("Recorded answers fill every Site Brief field ... A model line of 'not stated yet' cannot replace a recorded answer") and b7d4f2f9 BUG-030 ("The model draft replaces the pending brief ... A changed fact supersedes the live decision"). Both touched `brief-loop.ts` / `brief-desk.ts`. The likely shape: the BUG-028 recorded-answer fill now runs after or over a brief revision, so a user's explicit correction is overwritten by the original answer. Prove or disprove this; do not assume it.
3. E2E run 38378403752 on 5d53434a was still running when this prompt was queued. Check it read-only with `gh run view 38378403752 --log-failed` if authenticated, and run the Playwright suite locally either way. Fix any real E2E failure from 218 in this prompt too, one commit per root cause.
4. Last fully green main before 218: f3b76ee6 (CI, E2E, Audit all green).

## Read first

- `packages/engine/test/guide-live.test.ts` around 466-545, and the stub model it uses for the revise turn
- `packages/engine/src/guide/brief-loop.ts`, `packages/engine/src/guide/brief-desk.ts`
- `git show 9275af81`, `git show b7d4f2f9`, `git show 5d53434a`
- `hh-build-plan/prompts/218-paradise-found-e2e-fixes-3.md` (bug 3 BUG-030 and item 6 PERF-001 checklists)
- `.hh-driver/FLAKES.md` if present (read-only)

## Steps

1. Verify first. Run `pnpm --filter @hitchhiker/engine test` and confirm test 262 fails the same way. Run `pnpm -r test`, `pnpm typecheck`, `pnpm lint`, and the E2E suite and list every failure. If a later commit already turned everything green, prove it with run ids, change nothing else, and go to step 4.
2. Find the root cause of the brief-revise regression with evidence (which commit and which line makes the recorded answer win over the user's correction). Fix it in the product so both promises hold at once: recorded answers still fill empty or "not stated yet" fields (BUG-028), and an explicit "Change something" correction always changes the field it names and survives into SITE-BRIEF.md (BUG-030). Add a focused regression test that covers both together. Keep every existing assertion in guide-live.test.ts and the BUG-028/BUG-030 tests intact.
3. Verify the auto-committed PERF-001 partial work in 5d53434a: do its two answer-timing-218 tests test real behavior, pass, and match the code? Keep what is correct, fix what is half-done, and revert any partial product change you cannot finish green. Commit `fix(engine): brief revise keeps the user's correction` (and any E2E fix) as soon as `pnpm -r test` is green.
4. Finish 218 item 6, PERF-001 / BUG-017:
   - Stream the Guide's next-question text to the card as it arrives (or, if streaming is not available from the CLI, keep staged progress plus elapsed seconds) so the user sees movement within 2 s of pressing Answer.
   - Run the non-AI work for an answer (context writes, file saves, asset indexing, preflight checks, transcript render) in parallel with or after the model calls, not serially before them. Measure and log per-stage timings to `logs\ai.ndjson`.
   - Model, effort and judging unchanged (keep the invariant test from 212).
   Tests: server test that progress or stream events start within 2 s with a slow stub; timing-log test; invariant test still passes. Commit `perf(app): PERF-001 answer progress within 2 s and parallel non-AI work`.
5. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth below against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Non-goals

- Do not redo BUG-031, BUG-028, BUG-029 or the DP-id heading fix except where the root cause in step 2 requires it.
- No new dependencies. No change to run-build.ps1, the queue runner, or CI workflows.
- Do not restyle anything. Do not start the next prompt.

## Acceptance criteria

- [ ] The brief-revise root cause is named with evidence.
- [ ] guide-live.test.ts "ten Towel and Tea turns..." passes with every original assertion intact.
- [ ] A new test proves recorded answers fill empty fields and a user correction still wins for the field it names.
- [ ] The 5d53434a partial work is either verified and kept or cleanly reverted.
- [ ] PERF-001 checklist done with its tests, or marked BLOCKED with a reason after two real attempts and its partial product change reverted.
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- A "Change something" correction changes the named Site Brief field and SITE-BRIEF.md, once.
- Recorded interview answers fill every field the model leaves empty or "not stated yet".
- Every Guide call stays on `grok-4.7-build-fast` at the chosen effort (default `xhigh`) with the pushback judge on.
- The user sees progress within 2 s of pressing Answer.
- `pnpm lint`, `pnpm typecheck`, `pnpm -r test` and the E2E suite pass locally on Windows.

prohibitions:

- Do not push, deploy, or create a remote.
- Do not weaken an approval gate (brief approval, prompt approval, Elevate, Hostinger yes).
- Do not weaken, skip, or delete a test.
- Do not lower any model or effort.
- Do not edit run-build.ps1.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
pnpm -r test
pnpm --filter @hitchhiker/app e2e
```

(If the E2E script has a different name, use the one in `packages/app/package.json`.)

## Report back

Put a summary of at most 150 words in the final commit body and in `.hitchhiker-dev/summaries/219.md` if that directory exists. Name the root cause with evidence, the files changed, the tests run, and anything assumed or BLOCKED.

## Commit

```
fix(engine): brief revise keeps the user's correction
perf(app): PERF-001 answer progress within 2 s and parallel non-AI work
```