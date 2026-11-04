---
id: 245l
title: Closed screenshot loop - each page prompt shoots 375/768/1440, Grok lists visual faults against DESIGN.md and the render, fix and reshoot up to N rounds
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245k
---

# 245l - Closed screenshot loop per page prompt, compared with the render, not with the last pass (BUG-148)

## Context

In run 11 nobody looked at the site between prompts. The generated `tests/visual.spec.ts` (REQ-GATE-VISUAL, defined around line 1336 of `packages/engine/src/spec/site-prompts.ts`, title "Compare screenshots with the baselines from the last pass.") only compares new shots with the last passing JPEGs in qa/screenshots, so an ugly page that stays ugly passes.

Existing pieces to reuse (read them first):
- Shots: `captureDeviceShot` / `captureReviewShots` / `withProjectBrowser` in `packages/qa/src/playwright-opener.ts`; `captureSitePages` in `packages/qa/src/beauty-gate.ts`.
- Vision review through the logged-in Grok CLI: `think()` in `packages/engine/src/ai/think.ts` (spawns `grok` via `spawnGrok` / `planGrokCall` in `ai/grok-cli.ts`, with cassettes for tests), used by `zaphodReview` / `zaphodReviewSections` in `packages/qa/src/zaphod-vision.ts`. Never call the paid xAI API.
- Per-prompt close: `surfaceCloseReason` and the 244k one-feedback-rerun mechanism in `packages/engine/src/guide/site-build.ts`; `BEAUTY_MAX_ROUNDS` in beauty-gate.ts.

## Deliverables

1. After a page/section prompt's Grok session finishes and the build succeeds, the close step: builds and previews the site on a free port (never 4175 or another desk port), shoots that page at 375x812, 768x1024 and 1440x900 (above the fold and full page) into `qa/loop/<promptId>/round-<n>/`, and calls `think()` with the shots, `reference/renders/<page>.png`, and DESIGN.md. The model returns JSON (validate with `validateJson`): `faults: [{ width, area, fault, expected, fix }]`, concrete and visual ("hero headline wraps to 4 lines at 375; render shows 2"), not rule restatements.
2. If faults remain, the faults list goes back to the same session as a fix turn (reuse the recovery-rerun path from 244k, generalized to N rounds for this loop only), then reshoot. Stop when the list is empty or after `design.screenshotRounds` rounds (config, default 3). Out of rounds with faults left fails the prompt with the remaining faults as the reason. Write `qa/loop/<promptId>/faults.md` each round.
3. Replace the REQ-GATE-VISUAL meaning: the generated visual check compares with the approved render, not the last pass. Update the skeleton entry title and the golden (`packages/knowledge/golden/qa.md` or the file `goldenName` maps it to) so `tests/visual.spec.ts` asserts the per-page loop result (`qa/loop/*/faults.md` final round empty) and keeps the console-error / 404 checks. The last-pass pixel diff may stay as a regression check only if renamed and not counted as the visual pass; say which in the commit body.
4. The loop is skipped (with a logged reason, not a pass) for prompts that own no page (setup, tokens, SEO, deploy).
5. Generic. Preview processes are always killed at the end, with timeouts, and the loop never blocks the desk event loop.

6. Focused critique for key sections. For the hero and the 3-4 key sections with reference stills (245k), the review also gets those stills and a focused instruction ("compare composition, type scale, imagery and the signature moment of this section with the stills"); faults are tagged with the section id. Key sections get at most `design.keySectionRounds` (default 2) auto-fix rounds inside the overall cap.

7. Run the 245c CDP assertion layer (`runCdpAssertions`) on the same page at the same widths each round. Its BLOCKERS join the vision faults (with selector, actual and expected) in the fix turn; the loop is not clean until both lists are empty.

## Tests

Add `packages/engine/test/desk-run11-245l.test.ts` and `packages/qa/test/245l-screenshot-loop.test.ts` (fake shooter, cassette or fake `think`, no real browser or grok; short timeouts):
- a page prompt whose first review returns two faults gets one fix turn carrying both faults, and passes when the second review returns none;
- three rounds of faults fail the prompt with the last faults in the reason;
- shots are requested at exactly 375, 768 and 1440 and the render path is passed to `think`;
- `think` is called through the Grok CLI path; a test asserts no fetch to an xAI API origin happens;
- a setup prompt skips the loop and logs why;
- the generated visual check text references the render and the loop result, not "last pass";
- a hero section's review receives its two reference stills and its faults carry the section id; a third key-section round is not started;
- a CDP blocker (font-family mismatch on the hero h1) with no vision faults still triggers a fix turn whose text contains the selector and the actual and expected values;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/qa test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): page prompts close with a screenshot loop judged by Grok against DESIGN.md and the approved render (245l)
```
