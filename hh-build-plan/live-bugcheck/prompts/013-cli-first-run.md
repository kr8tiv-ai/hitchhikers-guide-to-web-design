# Live fix 013. hh first-run: unknown commands, the Node floor, and doctor's verdicts

From `hh-build-plan/live-bugcheck/heavy-review-2.md` items 2, 3, 5, 9 and 10. Verified on Oct 9: `pnpm exec hh frobnicate` prints only `hh doctor [--project <dir>]` and exits 2. Verify the others before changing code.

## Read first

- `packages/cli/src/main.ts` (command dispatch), `packages/cli/src/doctor.ts`, `packages/cli/src/session-probe.ts`, `packages/cli/package.json` (`bin: ./src/main.ts`), root `package.json` `engines`
- `hh-build-plan/once-over/010-hh-bin-on-windows.md` (the System32 `hh.exe` clash) and `hh-build-plan/once-over/007-doctor-auth-probe.md`
- `packages/cli/test/*`

## Spec

1. Unknown command: print the real command table: the CLI commands that exist (read them from the dispatcher, do not hand-maintain a second list if avoidable) and, separately, the Grok Build slash commands (`/hh-new`, `/hh-dont-panic`, ...) that are skills, not CLI commands. Exit 2. Do not run or print doctor's usage as if it were the only command. `hh --help` / `hh help` print the same table and exit 0.
2. Node floor: the `hh` bin is a `.ts` file. Confirm which Node versions run it without flags (22.18+ and 23.6+ strip types by default). Set `engines.node` in root and cli `package.json` to the real floor, and have `main.ts` (or a tiny `.mjs` shim if needed) print one clear sentence on an older Node instead of `ERR_UNKNOWN_FILE_EXTENSION`. Keep imports erasable-syntax only. Test the version check with an injected version.
3. Doctor verdicts: grok missing is a failure (exit 1) because the Guide and the build need it; playwright, whisper and pdftotext stay warnings. Node below the floor stays a failure. If `node_modules/@hitchhiker/engine` cannot be resolved, doctor says "Run pnpm install in the repo first." On Windows, doctor checks that `hh` resolves to the workspace bin and not `C:\Windows\System32\hh.exe` (HTML Help), and says how to run it (`pnpm exec hh`) if it does. Update existing doctor tests that assert exit 0 with grok missing.
4. Keep doctor's existing promise: never runs `grok login`.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/cli test` (and any package whose tests call doctor). Then, in a shell WITHOUT HH_CASSETTE, run `pnpm exec hh doctor` once and `pnpm exec hh frobnicate` once and paste both outputs in the commit body.

## Commit

```
fix(cli): real command table, an honest Node floor, and doctor fails without grok
```
Do not push.
