# Live fix 018. Reference cards on the desk navigate away from the interview

From `hh-build-plan/live-bugcheck/heavy-review-1.md` item 9. Verify first. Small; can share a commit only if the audit already has a "desk links" prompt, otherwise its own commit.

## Read first

- `packages/app/src/server/routes.ts` `renderLiveExtras`, `packages/app/src/gallery/walk.ts` (already uses `target="_blank"`), and the DP-5.1 "Where to look" links from fix 005

## Spec

Every external link rendered on the desk (gallery cards, reference cards, Where to look) opens in a new tab with `rel="noopener noreferrer"`; internal desk links stay same-tab. Test: rendered extras contain `target="_blank"` and the rel on external hrefs only.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the app tests. Exit 0.

## Commit

```
fix(app): open reference and gallery links beside the interview
```
Do not push.
