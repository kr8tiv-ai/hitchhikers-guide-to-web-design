# Live fix 024. The desk's first run shows the doctor report and never says Ready without grok

From `hh-build-plan/live-bugcheck/heavy-review-4-product.md` item 9. Builds on 016 (doctor fails when grok is missing) and 001 (cassette mode notice).

## Read first

- `packages/cli/src/doctor.ts` (make sure the checks are callable as a function that returns structured results, not only printed), `packages/cli/src/commands/app.ts`, `packages/app/src/server/routes.ts` (status line, the word "Ready"), `packages/app/src/shell.ts`, `packages/engine/src/boundaries.ts` (app may only import engine; pass the doctor result in from the cli instead of importing cli from app)

## Spec

1. `hh app` runs the doctor checks once at start (no `grok login`, no network prompt, hidden spawns) and hands the result to the desk.
2. On the first run of a project (no interview answers yet), or whenever a check failed, the desk shows a compact doctor panel: each check with ok / warning / failure and the one next step for a failure (e.g. "Install Grok Build, then run pnpm exec hh doctor"). It can be dismissed once everything required is ok.
3. The status line never says "Ready" while grok is missing or a required check failed; it says what is missing instead. Replay mode (fix 001) is also shown.
4. Approval gates unchanged.

## Tests

- app server with an injected doctor result: grok missing → no "Ready", the panel shows the failure and its next step; all ok on a project with answers → no panel, "Ready" allowed.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run cli and app tests. All exit 0.

## Commit

```
feat(app): first-run doctor panel, and no Ready while grok is missing
```
Do not push.
