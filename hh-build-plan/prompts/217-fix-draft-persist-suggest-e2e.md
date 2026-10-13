---
id: "217"
kind: checkpoint
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix draft-persist Suggest E2E to match BUG-015 (choices only, no auto-save)"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["216"]
files: ["packages/app/e2e/draft-persist.spec.ts", "packages/app/src/client/desk.ts", "packages/engine/src/guide/live-turn.ts", "packages/engine/src/guide/answer-guard.ts", "packages/app/src/server/routes.ts"]
review_checkpoint_embedded: false
---

# 217. Fix draft-persist Suggest E2E to match BUG-015 (choices only, no auto-save)
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
- Do not edit run-build.ps1, the driver, `STATE.json`, `.hh-driver/`, or `hh-build-plan/` except this prompt is already in prompts. Work on `main`. Do not stash.
- Do not undo BUG-015: Suggest must stay proposal-only (choices), must never save helper/placeholder/hint/why text as an answer, and must never overwrite a typed draft.

## Goal

Main is red on the E2E workflow at tip `d5ead177` (and on `474f3c0b`, `f65d841e`) because `packages/app/e2e/draft-persist.spec.ts:173` "a placed suggestion is saved and does not land on the next question" still asserts the pre-215 Suggest behavior. Prompt 215 (BUG-015) intentionally changed Suggest so it only offers pickable options, does not advance, does not write Assumed text into the draft, and does not save anything until the user picks or types. Align the draft-persist coverage with that product rule without losing draft-persist guarantees, and leave CI green.

## Why this prompt exists

Red main hides later regressions. CI is already green on `d5ead177` (216 fixed grok-plugin `COMMANDS` / `brief`). E2E is the remaining red. The failing test encodes the old "Suggest auto-places helper text and advances" bug that BUG-015 removed.

## Known failures

1. 2026-10-13, E2E run 38362799156 on `d5ead177` (CI green, Audit green): only failure is `e2e/draft-persist.spec.ts:173` "a placed suggestion is saved and does not land on the next question". After Suggest + reload, `questionId` is still `"DP-0.1"` (assertion at line 187: `expect(...).not.toBe("DP-0.1")`). `suggest.spec.ts` and `suggestion-choices.spec.ts` are green on the same run.
2. 2026-10-13, E2E run 38360384785 on docs/plan commit `474f3c0b`: same draft-persist test plus related Assumed/`#hh-card-draft` expectations failing (empty draft / missing `[data-assumed='suggested']`).
3. 2026-10-13, E2E run 38359691698 on `f65d841e` (215): same draft-persist failure (`toHaveValue` expected `"Yourself, or one named client."`, received `""`). That string is DP-0.1's placeholder/helper, which BUG-015 forbids saving as an answer.
4. Last fully green tip before the break: `24df65f5` (214) and `a602cd0c` (BUG-003) had E2E success. The break landed with 215's `answerSuggest` / `placeSuggestion` changes.

## Root cause (confirm or reject with evidence)

In `f65d841e` (215):

- `packages/engine/src/guide/live-turn.ts` `answerSuggest` no longer calls `storeCommand({ type: "suggest" })` or `advance(...)`. It returns choices and stays on `current.id`.
- `packages/app/src/client/desk.ts` `placeSuggestion` no longer writes suggestion text into the draft or calls `showAssumed` / `rememberDraft` for that text; it keeps the existing draft.
- `bannedAnswer` / server `static-answer` reject posting helper/placeholder/hint/why strings.

Those match BUG-015 acceptance in `215-paradise-found-e2e-fixes-2.md` Group A2. The draft-persist test still expects Suggest to fill `#hh-card-draft` with `"Yourself, or one named client."` and, after reload, to have left `DP-0.1`. That is the old buggy contract. Confirm by reading the test, 215's diff, and the green `suggestion-choices` / `suggest` specs.

## Read first

- `packages/app/e2e/draft-persist.spec.ts` (the failing test at ~173 and helpers)
- `packages/app/e2e/suggest.spec.ts`, `packages/app/e2e/suggestion-choices.spec.ts` (current intentional Suggest UX)
- `packages/app/src/client/desk.ts` (`submit` suggest branch, `placeSuggestion`, `acceptSuggestion`, `requestSuggestion`)
- `packages/engine/src/guide/live-turn.ts` (`answerSuggest`), `packages/engine/src/guide/answer-guard.ts`
- `hh-build-plan/prompts/215-paradise-found-e2e-fixes-2.md` Group A2 BUG-015
- `gh run view 38362799156 --log-failed` (and 38359691698 / 38360384785 if useful)

## Steps

1. Verify first. Run `pnpm --filter @hitchhiker/app exec playwright test e2e/draft-persist.spec.ts` and confirm the failure matches tip. Also run `e2e/suggest.spec.ts` and `e2e/suggestion-choices.spec.ts` and confirm they pass.
2. Decide with evidence: product regression vs obsolete test. If BUG-015's contract is intact (Suggest offers choices, no advance, no helper saved, typed draft survives), the draft-persist test must be rewritten to that contract. If Suggest is broken relative to BUG-015 (for example it clears a typed draft, auto-saves helper text, or fails to show choices), fix the product first and keep the test strict.
3. Replace the obsolete assertions in `draft-persist.spec.ts` with a test (or tests) that are at least as strict and cover draft persist around Suggest under the new rules. Required coverage:
   - Typing a draft, pressing Suggest, and still seeing the same typed draft (not cleared, not overwritten by helper/placeholder text).
   - Suggest does not advance the interview (still on the same question id).
   - Suggest does not write Assumed helper text into `#hh-card-draft` or localStorage as if it were the user's answer.
   - After the user picks a choice (or types their own words) and presses Answer, the answer is recorded, the draft for that question is cleared appropriately, and a reload does not resurrect the helper string as a draft on the next question.
   - Helper/placeholder string `"Yourself, or one named client."` (or the question's real suggest/why/tip) is rejected if posted as an answer (reuse existing server/engine coverage if already present; do not weaken it).
4. Do not weaken `suggest.spec.ts` or `suggestion-choices.spec.ts`. Do not restore auto-advance Suggest or auto-Assumed helper placement.
5. Run `draft-persist`, `suggest`, and `suggestion-choices` specs until green, then the full app E2E suite once.
6. As a checkpoint prompt, finish by reviewing your own work as Zaphod would: re-read each truth above against the code, run the full suite, and fix at most one defect in a `fix(review):` commit. Do not add features during the review.

## Verification

```bash
pnpm --filter @hitchhiker/app exec playwright test e2e/draft-persist.spec.ts e2e/suggest.spec.ts e2e/suggestion-choices.spec.ts
pnpm --filter @hitchhiker/app exec playwright test
```

Plus any existing engine/server tests for `bannedAnswer` / static-answer if you touch those files.

## Done when

- Tip would pass the E2E workflow for this failure (draft-persist Suggest coverage matches BUG-015).
- Suggest still never saves helper/placeholder text and never overwrites a typed draft.
- Summary names the evidence, what changed in the test vs product, and why the new assertions are at least as strict.
- Commits are local only; the driver pushes.
