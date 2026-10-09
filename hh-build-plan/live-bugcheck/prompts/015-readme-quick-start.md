# Live fix 015. README quick start points at an npm package that does not exist

From `hh-build-plan/live-bugcheck/heavy-review-2.md` items 1, 2, 4 and 6. Verified on Oct 9: `https://registry.npmjs.org/hitchhikers-guide` returns 404; README line 11 says "`npx hitchhikers-guide` runs the `hh` command"; README "Develop" says "The root package has no test script", but root `package.json` has `"test": "pnpm -r test"`. Viewers of the Oct 8 live will follow this README tonight, so this goes early.

## Read first

- `README.md`, `docs/dont-panic.md`, root `package.json` (`engines`, `packageManager: pnpm@10.32.1`, scripts), `packages/cli/package.json` (`bin: ./src/main.ts`, `files`), `packages/cli/src/commands/app.ts` (how `hh app` finds `packages/app`), `.github/workflows/*` (Node version used in CI)

## Spec

1. Quick start is clone-based and copy-pasteable on Windows (PowerShell) and macOS/Linux:
   `git clone https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design` → `cd` → `corepack enable` → `pnpm install` → `pnpm exec hh doctor` → `pnpm exec hh app` (and `--project <dir>` / `--no-open` explained in one line each). State the Node floor that actually works for a `.ts` bin without flags (check: Node 22.18+ strips types by default; earlier 22.x needs `--experimental-strip-types`). Use the same floor as fix 016 will enforce.
2. `npx hitchhikers-guide` appears only as "not published yet" in one sentence. Do not claim the desk starts from a lone CLI install; say the desk needs the cloned workspace.
3. "Develop": `pnpm -r test` (root `pnpm test`) runs every package; `$env:HH_CASSETTE='replay'` / `HH_CASSETTE=replay` for tests only, with a one-line warning never to start `hh app` from that shell; `pnpm exec tsc -b`; the app e2e command.
4. Keep the tone and length of the existing README. A docs test exists for some README claims (search `packages/*/test` for README); update or add an assertion that the README does not tell people to run `npx hitchhikers-guide` as a working command.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run the tests of any package whose doc test you touched. All exit 0.

## Commit

```
docs(readme): clone-based quick start and the real test commands
```
Do not push.
