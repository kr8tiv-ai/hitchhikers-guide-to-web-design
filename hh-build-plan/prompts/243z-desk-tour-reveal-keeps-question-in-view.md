# 243z - Desk: the tour reveal after the splash must not pull a live question out of view

## Context

GitHub E2E on main at `432c814d` failed twice in a row (first run and `--failed` rerun) on `packages/app/e2e/question-focus-211.spec.ts` ("load and resume keep the question in view"), line 60: `expect(box!.y).toBeGreaterThanOrEqual(0)` received about `-886` / `-890` right after the reload + Skip-to-the-app step (spec line 25). The `expect.poll` just above it had already seen the heading in view, so something scrolls the page AFTER the question is placed. The spec passes locally 3/3, so it is a timing race that shows on slower CI, but the race is in product code, not the test.

Likely cause, in `packages/app/src/client/desk.ts` (around lines 1515-1550): `revealTourSoon()` runs on `hh-splash-dismissed` (and when the splash cue was already dismissed before mount) and calls `revealTour(env.document, "auto")` at about 180 ms and again at 420 ms. `revealTour` (`packages/app/src/client/tour.ts`) scrolls `[data-tour]` to the top of the viewport with `block: "start"`, which pushes `#hh-card-ask` far above the viewport. The question placement in desk.ts (`revealHeading`, around line 4750) has already run by then, so the late tour scroll wins. BUG-007 says after load and after resume the question heading is in view and the first-five-minutes tour does not take focus.

Confirm the cause first by reading the code; if it is something else, fix that real cause instead.

## Deliverables

1. After load, reload/resume and Skip to the app, when a live question is on the desk (`[data-region="question"][data-live="true"]`), the question heading `#hh-card-ask` stays in view and nothing scrolls it out afterwards. The plate reveal must only move the page when the tour was explicitly asked for (`/?tour=1` from Create project or Replay tour) or when there is no live question to keep in view. Keep the current behaviour of the explicit tour request (plate brought to the top and its heading focused).
2. Smallest change that fits the existing code; remove code that becomes dead. Do not change engine code.
3. Do not loosen or delete any assertion in any existing spec or test, including the tour specs (`git grep -n "tour" -- packages/app/e2e` to find them) and `question-focus-211.spec.ts`.

## Tests

Tighten `question-focus-211.spec.ts`: after each `expectQuestionInView` call, wait for longer than the tour reveal timers (for example `await page.waitForTimeout(700)`) and assert again that `#hh-card-ask` is still in view (y >= 0 and y < viewport height). This must fail on the old code when the timers fire (verify by running the spec with the fix temporarily reverted, or reason it out in the commit message if you cannot) and pass with the fix. Add a unit test in `packages/app/test` if the desk client has a matching test file for the splash/tour wiring.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/app exec playwright test e2e/question-focus-211.spec.ts --repeat-each 5`
- every tour-related e2e spec under `packages/app/e2e` (run them by file name with playwright)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @hitchhiker/app test`

## Commit

`fix(app): keep a live question in view after the splash by revealing the tour plate only when the tour was asked for (243z)`