---
id: "175"
kind: build
phase: so-long-and-thanks-for-all-the-fish
slice: Forty-Two
title: "Fix the Suggest flow: card stays, suggestion shows in place"
tier: Heart of Gold
effort: xhigh
model: grok-4.7
depends_on: ["174"]
files: ["packages/app/src/", "packages/app/e2e/", "packages/engine/src/"]
review_checkpoint_embedded: false
---

# 175. Fix the Suggest flow: card stays, suggestion shows in place

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
- Reproduce first. The failing Playwright test is committed in the same commit as the fix, written and run red before any fix is applied. Record the red output.
- Assumption marking stays: a suggested value is always marked as assumed until the user accepts or edits it.
- Errors stay under the field with the draft preserved. Never swap the screen to show an error.

## Goal

When the user taps "Suggest" on a desk card, the card clicks off or disappears. Fix it end to end. Required behavior: (1) the suggestion appears immediately, in place on the same card, marked as assumed; (2) it is reviewable and editable in place; (3) the user can scroll down to the next control and accept it; (4) there is no sudden screen swap; (5) the suggestion never renders in an error-red state unless the suggest call truly failed; (6) the "loading error" that appears when clicking through afterwards is fixed, and the desk no longer stalls or fails to continue after a suggestion; (7) assumption marking is kept, and real errors show under the field with the user's draft preserved.

## Why this prompt exists

Suggest is the main escape hatch for a user who does not know the answer. If the card vanishes or turns red, the one-next-action desk loses the user at the exact moment it should help.

## Read first

- packages/app/src/server/routes.ts (suggest route and response shape)
- packages/app/src/server/card.ts (card state and the assumed marker)
- packages/app/src/client/desk.ts (suggest click handler, render, focus, scroll, fetch error handling)
- The Guide turn handling that produces the next card after a suggestion
- packages/app/e2e/ (existing specs, helpers, cassettes) and packages/app/src/design/ (error and assumed styles)
- DECISIONS.md and context/matt-answers.md (authority)

## Files to create or change

- packages/app/e2e/suggest.spec.ts (new, failing first)
- packages/app/src/server/routes.ts, card.ts, client/desk.ts, and the Guide turn handling, only as the root cause requires
- packages/app/src/design/ (only the error versus assumed state class, no restyle)
- packages/app/test/ unit tests for the card and suggest response where the root cause lives

## Non-goals

- No restyle and no new visual system.
- No change to approval gates.
- No live API calls; use fixtures or the cassette.
- No new dependency.
- Do not hide the failure with a retry, a longer timeout, or a swallowed error.

## Steps

1. Verify first. Before editing, read the current code and the git log. Decide per must_have whether the defect still exists. If a must_have is already satisfied by the current code and has a test, change nothing for it and record "already fixed: <evidence>" in the summary. Do only what is still needed. If everything is already satisfied, make no code change, write the summary, and commit it with the commit line below.
2. Add the failing test first. Write `packages/app/e2e/suggest.spec.ts` at viewports 375 and 1440. Flow: open a card, tap Suggest, assert the same card element is still attached and visible, the suggestion text is shown in place and marked assumed, the field is editable, the next control can be scrolled to and the accept action works, no navigation or screen swap occurred (same URL, same card node), no console errors, no error-red class or role=alert unless the call failed, then click through to the next card and assert the desk continues with no "loading error". Add a second case where the suggest call really fails: the error shows under the field and the draft text is preserved. Run it and record the red output. Commit nothing yet.
3. Find the root cause. Trace the click through client/desk.ts, the route in routes.ts, the card model in card.ts, and the Guide turn handling. Check for: a full re-render that replaces the card node, a response shape mismatch that the client treats as failure, an assumed value routed through the error path, a turn that is marked pending forever so the desk stalls, and a fetch or stream that rejects after click-through. State the root cause in the summary in one or two sentences.
4. Fix the root cause. Keep the card node in place, render the suggestion into it marked as assumed, keep it editable, preserve scroll and focus, and move focus only if the user asked. Make the assumed state use the assumed style, never the error style. Make the turn complete so the next card loads. Keep errors under the field with the draft preserved.
5. Add unit tests where the root cause lived (card state, route response, turn handling) so it cannot regress without the e2e.
6. Run the new e2e at 375 and 1440 until green, then the full verification list. Check the polish e2e still passes.

## Acceptance criteria

- [ ] The suggest e2e exists, was red before the fix, and is green at 375 and 1440.
- [ ] Tapping Suggest keeps the same card on screen with the suggestion shown in place, marked assumed.
- [ ] The suggestion is editable and the user can scroll to the next control and accept it.
- [ ] No screen swap, no red error state on success, no "loading error" when clicking through afterwards, and the desk continues.
- [ ] A real suggest failure shows under the field with the draft preserved.
- [ ] No test was skipped, deleted, or loosened; no approval gate changed; no restyle.

## must_haves

truths:

- Suggest renders in place on the same card, marked as assumed, and never in an error state unless the call failed.
- The desk continues after a suggestion with no loading error and no stall.
- A failing-first Playwright e2e covers 375 and 1440 and now passes.
- Errors stay under the field with the draft preserved.
- Assumption marking is unchanged in meaning.

artifacts:

- packages/app/e2e/suggest.spec.ts
- The fix in routes.ts, card.ts, client/desk.ts, or the turn handling, with its unit test

key_links:

- The e2e asserts the same behavior the user sees: the card stays, the suggestion is marked assumed, the desk continues.
- The root cause is named in the summary.

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

Put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/175.md` if that directory exists. The summary names, per must_have, "already fixed" or "fixed now" with evidence, files changed, tests run, and anything assumed.

## Commit

```
fix(app): keep the card in place when Suggest runs and let the desk continue
```
