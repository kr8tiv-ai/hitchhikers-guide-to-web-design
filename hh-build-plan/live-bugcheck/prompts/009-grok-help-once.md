# Live fix 009. Probe `grok --help` once, and not inside the project

002 hides consoles. This prompt stops the extra process. `launch()` in `packages/engine/src/ai/grok-cli.ts` already sets `windowsHide: true`. Do not spend this commit re-adding it there.

## Read first

- `packages/engine/src/ai/think.ts` (the `flags` line around 298, `probeFlags` around 411–428)
- `packages/engine/src/ai/grok-cli.ts` `planGrokCall` and `launch`
- `packages/cli/src/doctor.ts` `spawnCommand` (the help probe there uses a 10s timeout)
- `hh-build-plan/live-bugcheck/REPORT.md` finding F-04

## Bug

Every `think()` that does not receive `flags` and is not a cassette replay spawns `grok --help` before the real call. The probe uses `ai.timeoutMs` (default 120 seconds) and `cwd` is the project directory. The model call itself uses a scratch directory. One answer runs the pushback judge and then the next-question phrasing, so a live turn starts two help processes and two model processes. A help probe that waits holds the desk on `pending` for up to 120s before the answer starts. Replay returns before `probeFlags`, which is why the cassette-miss repro did not spawn grok. A normal `hh app` with cassette mode off does this on every question. `grok` was not run for the audit.

## Spec

1. Cache the flag set for the resolved grok command for the life of the process. A second `think()` in that process does not spawn `--help`. Callers that pass `flags` stay on the injected set and do not spawn either.
2. The probe's cwd is an empty directory under `os.tmpdir()`, not the project and not `.hitchhiker/`. Remove it afterwards.
3. The help probe's timeout is 10 seconds, matching `hh doctor`, not the answer timeout. On timeout or a missing binary, throw the existing `ThinkTimeoutError` / `GrokMissingError`. Do not start the real call with an empty flag set.
4. The real model call keeps `ai.timeoutMs` and the scratch cwd it has now.

## Tests

A fake spawn counts calls. Two `think()` calls with the same command spawn `--help` once, then two model runs. A call that passes `flags` spawns no help process. The help spawn's cwd is not the project directory. Replay mode still spawns nothing.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/engine test`. All exit 0.

## Commit

```
fix(engine): probe grok --help once, outside the project directory
```
Do not push.
