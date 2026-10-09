# Live fix 001. HH_CASSETTE outside tests breaks the live Guide silently

## Read first

- `packages/engine/src/ai/cassette.ts` (env read at line ~93, `cassette miss` error at ~24)
- `packages/engine/src/guide/live-turn.ts` (second `cassette miss` path at ~137-142)
- `packages/cli/src/` the `hh app` command and `packages/app/src/server/server.ts` / `routes.ts` (where `Desk error:` is logged)
- `packages/cli/src/doctor.ts`

## Bug

On Oct 9 the desk was relaunched from a PowerShell window that still had `HH_CASSETTE=replay` from a test run. Every live Guide turn threw `cassette miss: <hash>`. The server logged `Desk error: cassette miss: ...` and the browser only showed "The answer did not save. Try again, or skip." Nothing told Matt that the app was in replay mode.

## Spec

1. `hh app` (and any other user-facing command that calls the live model: `hh build`, the Guide) checks `HH_CASSETTE` at start. When it is `replay` or `record` and the process is not a test (no `NODE_TEST_CONTEXT`, and no explicit `--cassette` / `HH_ALLOW_CASSETTE=1` opt-in), it prints one loud line to stderr, for example `HH_CASSETTE=replay is set in this shell. The Guide would only replay recorded answers. Clear it (Remove-Item Env:HH_CASSETTE) or pass --cassette to keep it.` and exits with code 2 without opening a browser. Pick the opt-in name that fits the existing CLI flags and document it in the help text.
2. If replay is explicitly allowed, the desk status line shows `Replay mode: answers come from recorded cassettes.` so a demo can never be in replay by accident.
3. `hh doctor` prints `cassette: off` or `cassette: replay (set in this shell)`, as a warning, not a failure.
4. Tests and e2e that set `HH_CASSETTE=replay` keep working. Check every spawn in `packages/app/e2e/*.spec.ts` and any test that starts the CLI; they must pass the opt-in.

## Tests

- cli: `hh app` with `HH_CASSETTE=replay` and no opt-in exits 2 with the message and does not call the browser opener (inject the opener).
- cli: with the opt-in it starts.
- doctor: reports the cassette line.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/cli test`, `pnpm --filter @hitchhiker/engine test`, `pnpm --filter @hitchhiker/app test`. All exit 0.

## Commit

```
fix(cli): refuse to start the live desk when HH_CASSETTE is set outside tests
```
Do not push.
