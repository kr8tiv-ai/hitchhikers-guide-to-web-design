# 244e - Golden path sample: the towel cassette build writes a page that passes the 244c head check

## Context

244c (commit 8e11c43c, "require branded titles, real meta descriptions ... and check the built head at close") is on main, and GitHub CI went red on ubuntu, windows and macos with one deterministic failure, plus the same failure in E2E:

- Unit tests, `packages/cli/test/golden-path-247b.test.ts:21` "towel sample walks every phase and the preview serves the page": `Error: The build did not finish.` thrown from `cassetteBuild` in `packages/orchestrator/src/golden-path.ts` (the `failed` queue item branch).
- E2E, `packages/app/e2e/golden-path-247b.spec.ts:75` "golden path on the desk > Drive and Launch name the next step at 375 and 1440": same `The build did not finish.` from `cassetteBuild`.

The cassette spawn in `cassetteBuild` writes `dist/index.html` as `<head><meta charset="utf-8"><title>Mostly Towels</title></head>` with no meta description. The likely cause is that the new close head check (`packages/engine/src/spec/site-head.ts`, wired in `packages/engine/src/guide/site-build.ts`) now fails that prompt with "Head check failed." (empty meta description, and possibly a bare title), so the queue item is marked failed. Confirm this by reading site-head.ts, the close flow, and the queue item's recorded failure reason in a quick local run of the cli test. If the real cause is different, fix that instead and say so in the commit body.

## Deliverables

1. Fix the sample, not the check: the cassette page in `cassetteBuild` must be a page the new rules accept, the way a real generated site must now look. Give it a branded title in the 244c form (the home page may be "<site name> | <short promise>", for example "Mostly Towels | Towels for the home") and a real, calm meta description for the visitor (for example "Mostly Towels sells soft cotton towels for the home."). Use the site name the sample project already uses. If the head check also requires something else present in a real layout (for example a header brand), add the smallest markup that satisfies it.
2. Check every other cassette, fixture or sample site writer that runs through the close flow (search the orchestrator, cli, app e2e and engine test helpers for writers of `dist/index.html` or `<title>`), and update any that the new head check now fails, the same way.
3. Do not loosen, skip or delete any assertion in any test or spec, and do not weaken the head check in `site-head.ts` or the close flow. If a test asserted the exact old cassette HTML, update it to the new page text only.
4. Smallest change that fits. Do not edit site-c or any generated site, and do not change app UI code.

## Tests

- `packages/cli/test/golden-path-247b.test.ts` passes.
- `packages/app/e2e/golden-path-247b.spec.ts` passes (run just that spec with Playwright from packages/app).
- 244c's head check tests in `packages/engine/test/desk-run11-244c.test.ts` still pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(orchestrator): give the golden path towel sample a branded title and a real meta description so it passes the close head check (244e)
```