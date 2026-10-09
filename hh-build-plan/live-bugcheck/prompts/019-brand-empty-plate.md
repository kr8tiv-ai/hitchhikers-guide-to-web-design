# Live fix 019. /brand on a fresh project looks stuck

From `hh-build-plan/live-bugcheck/heavy-review-2.md` item 7. Verify first.

## Read first

- `packages/app/src/server/routes.ts` (the `/brand` route and the "not printed yet" plate text), `packages/app/src/server/brand-desk.ts`, `packages/app/src/brand-kit.ts`, `packages/app/src/design/voice.md`, `packages/app/test/brand-desk.test.ts`

## Spec

When there is no brand kit yet, `/brand` says what happens next and gives one action: for example "The brand kit prints after the interview's brief is approved." with a link back to the desk (`/`) and, if the brief is already approved, the real next step (the `/hh-babel-fish` slash command or whatever the code actually uses; verify). No fake progress, no spinner. In the Guide's voice. Test: a fresh project's `/brand` HTML contains the next step and a link to `/`.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the app tests. Exit 0.

## Commit

```
fix(app): an empty brand plate says what prints it and links back to the desk
```
Do not push.
