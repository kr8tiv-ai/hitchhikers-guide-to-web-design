---
id: "183"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Show Suggest and weak-answer follow-ups as pick-on-the-spot choices"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["182"]
files: ["packages/engine/src/guide/", "packages/engine/test/", "packages/app/src/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 183. Show Suggest and weak-answer follow-ups as pick-on-the-spot choices
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
- The driver pushes after checkpoints. You do not push, and you do not run `gh` against the network.

- Playwright runs use the existing app e2e setup in packages/app/e2e/. Fixtures and cassettes only. No live xAI or other paid API call in any test or script.
- Reproduce first. The failing Playwright e2e is written and run red before any fix is applied, and it is committed in the same commit as the fix. Record the red output.
- Assumption marking stays: a value that came from Suggest or from a pick on the spot is marked as assumed until the user edits it or confirms it, and the next card shows it.

## Goal

When the Guide says an answer is weak and asks for more, and when the user taps Suggest, the options appear at once on the question card as 2 to 4 labelled multiple-choice options (A, B, C, D) plus a last option, "Other: I'll write my own". One tap, or one keypress, picks one. A pick fills the answer field and submits it, marked as assumed where it was not the user's own words. The user never has to scroll down to find the suggestions.

## Why this prompt exists

Prompt 175 (commit 0fea0ed) kept the card in place and shows one suggestion string in the field, marked assumed. It did not fix where the multiple suggestions go. The engine's `suggest()` returns up to four grounded options, `answerSuggest` in `live-turn.ts` puts them on `turn.options`, and `routes.ts` `renderLiveExtras` renders each as a plain `<p class="hh-turn" data-suggest-option>` line in the transcript region, which sits below the card. The client `desk.ts` `placeSuggestion` reads only `session.assumption` or `question.suggest`, one string, so the options are never offered as choices on the card. For a weak answer, `answerText` returns status `pushed` with a message, a quote, and `sharperChoice` is read by `pushback-judge.ts` but never shown as options. The user is told to give more and gets nothing to pick. A user who does not know the answer is lost at the exact moment the desk should help.

## Read first

- `git show 0fea0ed --stat` and `git show 0fea0ed -- packages/app/src` (what 175 fixed: card stays, one suggestion in place, assumed marker, edit posts the original id, failed call keeps the draft). Keep all of it.
- `packages/app/src/server/routes.ts` (`renderLiveExtras`, `overlayFrom`, `LiveOverlay.options`, `/api/suggest`, `/api/answer`, the session view and `transcriptHtml`, the SSE session event)
- `packages/app/src/server/card.ts` and `packages/app/src/card.ts` (card state, `SUGGEST_LABEL`, `previousAssumption`, the assumed marker)
- `packages/app/src/client/desk.ts` (`submit`, `requestSuggestion`, `placeSuggestion`, `suggestHold`, `showAssumed`, focus and live region code from 170)
- `packages/engine/src/guide/live-turn.ts` (`answerText`, `answerSuggest`, `advance`, `GuideTurn.options`), `suggest.ts` (`suggest`, `groundedOptions`), `pushback-judge.ts` (`judgePushback`, `sharperChoice`, the phrase floor, at most two pushes then SOFT), `schemas.ts` (`SUGGEST_SCHEMA`, `PUSHBACK_SCHEMA`, `SuggestOption`), `validators.ts`, `packages/engine/src/ai/schema-validate.ts`
- `packages/app/e2e/suggest.spec.ts`, `live-guide.spec.ts`, `polish.spec.ts`, and `packages/app/test/suggest-flow.test.ts`
- `packages/app/src/design/` (assumed style, error style, radio or option styles) and the 170 focus and live-region work
- `DECISIONS.md` and `context/matt-answers.md` (authority)

## Files to create or change

- `packages/app/e2e/suggestion-choices.spec.ts` (new, written first, red first)
- `packages/engine/src/guide/schemas.ts` (a choices schema with ids A to D), `suggest.ts`, `pushback-judge.ts`, `live-turn.ts`
- `packages/engine/test/` unit tests for schema parsing and the fallback
- `packages/app/src/server/routes.ts`, `server/card.ts`, `card.ts`, `card.css`, `client/desk.ts`
- `packages/app/test/` unit tests for the choices render and the pick path
- `packages/app/src/design/` only a choice-row state that reuses existing tokens, no restyle

## Non-goals

- No restyle and no new visual system. Reuse the cream editorial desk, the rust rule, and existing option styles.
- No change to approval gates (brief approval, prompt approval, Elevate, Hostinger yes).
- No new dependency.
- No live API calls. Use fixtures and the cassette.
- Do not change what SUGGESTED, SKIPPED, SOFT, and ANSWERED mean, and do not undo 175.
- Do not hide a failure with a retry loop, a longer timeout, or a swallowed error.
- Do not start the next prompt.

## Steps

1. Verify first. Read the current code and `git log` before editing. For each must_have decide whether the defect still exists. If one is already satisfied and has a test, change nothing for it and record "already fixed: <evidence>". Do only what is still needed. Confirm the root cause above against the code and state it in one or two sentences in the summary.
2. Write the failing Playwright e2e first, `packages/app/e2e/suggestion-choices.spec.ts`, at 375 and 1440, using the cassette. Cases: (a) tap Suggest, assert 2 to 4 choices labelled A to D plus "Other: I'll write my own" appear inside the same card, under the question, visible without scrolling at both widths, and are not in the transcript below; (b) answer with a weak reply, the Guide asks for more, assert the same component appears on the same card; (c) pick with a tap, and separately with the A to D keys, and with arrow keys then Enter, assert the answer is submitted, marked as assumed, and shown on the next card; (d) pick Other, assert the field is focused and empty and the user can write and submit their own, stored as the user's answer; (e) a real suggest failure leaves the draft intact, shows a non-red retryable notice under the field, and Retry works; (f) bad model JSON falls back to one suggestion and shows it as a single choice plus Other; (g) no red error class or `role="alert"` unless a call truly failed, no console errors, same card node and same URL throughout. Run it, record the red output, commit nothing yet.
3. Engine schema. Add a validated choices schema: an array of 2 to 4 items, each `{ id: "A"|"B"|"C"|"D", label, why, source }`, ids in order and unique, labels non-empty and within the existing length limits. Parse with the existing `schema-validate.ts` path and keep the grounded checks (`sourceExists`, `guideTextIssues`). If the model returns bad JSON, fewer than 2 valid options, or fails the schema, fall back to a single suggestion (the question's own `suggest` text or the best grounded option) as one choice. Never throw to the user for bad JSON. Extend `PUSHBACK_SCHEMA` or add a follow-up call so a weak-answer turn also returns 2 to 4 choices, with `sharperChoice` as the first when valid, under the same parsing and fallback.
4. Turn shape. Carry the choices on the turn for both `suggest` and `pushed` status, with a marker saying which came from the model and which is the fallback. Do not change the stored statuses.
5. Server. Stop rendering suggestion options as transcript lines. Render them inside the question card article, under the question text, as one component shared by Suggest and weak-answer follow-ups. Put the choices in the session view so the client and the server HTML agree, and make the SSE session event carry them.
6. Component and a11y. A `role="radiogroup"` with an accessible name tied to the question, each choice a `role="radio"` with `aria-checked`, roving tabindex, labels "A", "B", "C", "D" shown and spoken, the Other option last. Keys: A to D choose directly, arrow keys move, Enter or Space confirms, Escape returns focus to the field with the draft intact. An `aria-live="polite"` region announces "Options ready: N choices" when they appear and the result of a pick. Focus moves to the group only when the user asked for Suggest or answered and was pushed back. Touch targets are at least 44px at 375. No horizontal scroll at 375. Respect reduced motion.
7. Pick behavior. Picking A to D fills the field with the option text and submits it through the existing answer route as assumed (the same SUGGESTED meaning as 175, an unedited pick keeps it, an edit makes it ANSWERED). Picking Other empties a pending suggestion, focuses the field, and submits nothing until the user writes and answers; that answer is ANSWERED. The assumption shows on the card first and on the next card via `previousAssumption`.
8. Error handling. A failed suggest or follow-up call keeps the draft, shows the message under the field in the non-error notice style with a Retry button, and uses the error style and `role="alert"` only for a genuine failure. Never swap the screen.
9. Unit tests. Engine: valid 2, 3, 4 options pass; 1 and 5 fail to the fallback; duplicate or out-of-order ids; non-JSON text; missing fields; ungrounded source dropped; fallback yields exactly one choice. App: card HTML contains the radiogroup inside the article and not in the transcript; the pick path posts the right body and marks assumed.
10. Run the new e2e at 375 and 1440 until green, then the full verification list. The 175 `suggest.spec.ts` and the polish e2e must still pass without loosening.

## Acceptance criteria

- [ ] The new e2e exists, was red before the fix, and is green at 375 and 1440.
- [ ] Suggest and a weak answer both show 2 to 4 choices labelled A to D plus "Other: I'll write my own" on the card, with no scroll needed to see them.
- [ ] One tap, an A to D key, or arrow keys plus Enter picks and submits.
- [ ] A picked answer is marked assumed and shows on the next card; Other stores the user's own words.
- [ ] Bad model JSON yields a single-suggestion fallback, not an error.
- [ ] A real failure keeps the draft and offers Retry; no red state on success.
- [ ] Radiogroup, labels, and live region work with the keyboard and a screen reader.
- [ ] No test was skipped, deleted, or loosened; no approval gate changed; no restyle.

## must_haves

truths:

- Suggest and weak-answer follow-ups render as one shared choices component inside the question card, under the question, not in the transcript below it.
- The engine returns a validated schema of 2 to 4 options with ids A to D, and falls back to a single suggestion when the model returns bad JSON or too few valid options.
- Choices are keyboard and screen-reader accessible: a radiogroup, A to D keys, arrow keys with Enter, and an aria-live announcement.
- Picking a choice submits it as assumed; Other lets the user write their own and stores it as theirs.
- Assumptions are marked on the card and shown on the next card.
- No red error styling unless a call truly failed, and a failure leaves the draft intact with a Retry.
- The choices are visible without scrolling at 375 and 1440.
- A Playwright e2e at 375 and 1440 was written first, and unit tests cover the schema parsing.

artifacts:

- `packages/app/e2e/suggestion-choices.spec.ts`
- The choices schema, parser, and fallback in `packages/engine/src/guide/` with unit tests
- The shared choices component in `packages/app/src/` with unit tests

key_links:

- The e2e asserts what the user sees: choices on the card, one-step pick, assumed on the next card.
- The root cause is named in the summary: options rendered as transcript lines and the client reading one string.

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
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app e2e
```

## Report back

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/183.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, the root cause, files changed, the red e2e output, tests run, and anything assumed.

## Commit

```
fix(app): show Suggest and weak-answer follow-ups as pick-on-the-spot choices
```
