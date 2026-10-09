# Live fix 008. Retry the state rename when Windows returns EPERM

Depends on 007 only because both touch `packages/engine/src/lock.ts`. Add the retry on top of that steal. Do not remove it.

## Read first

- `packages/engine/src/lock.ts` `replaceViaTemp` (around 214–228)
- `packages/engine/src/interview.ts` `persistPair` (around 454–495). Answers are renamed, then `STATE.md`. A throw on the second rename leaves the new answers file in place.
- `hh-build-plan/live-bugcheck/REPORT.md` finding F-03

## Bug

On this machine, `fs.promises.rename` over an existing file succeeds when the destination is free, and throws `EPERM: operation not permitted, rename` when the destination is open (`open(path, "r+")`). `persistPair` and `replaceViaTemp` try once. A sharing violation from OneDrive, an editor, or an indexer fails the save. If `interview.json` already renamed and `STATE.md` did not, the answer is on disk and the desk reports failure. Prompt 006 stops a retry from writing the next question. The first click still fails for as long as the handle is held.

## Spec

1. One helper used by `replaceViaTemp` and by both renames in `persistPair`. On `EPERM`, `EBUSY`, or `EACCES`, retry a handful of times with a short delay (about 50ms, under a second total). Any other error fails immediately. The temp file is still removed when the rename finally fails.
2. Tests inject the rename. A first `EPERM` and a second success must leave the destination with the new body. A permanent `EPERM` still throws after the retries, and the temp is gone. Do not require a real locked file in CI. A Windows-only extra that opens a handle is fine and must no-op elsewhere.
3. No change to the 30s lock floor or to the corrupt-lock steal from 007.

## Tests

Engine tests for the helper, plus one `persistPair` (or `replaceViaTemp`) test with the injected rename. Existing interview tests stay green.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/engine test`. All exit 0.

## Commit

```
fix(engine): retry a Windows rename when the state file is locked
```
Do not push.

## Heavy review notes (from `heavy-review-1.md` item 6; verify first)

- `packages/engine/src/lock.ts` `isPidAlive` treats any `process.kill(pid, 0)` error other than `ESRCH` as alive. On Windows `EPERM` (a pid we cannot signal, or a recycled pid) then holds a dead lock until `STALE_LOCK_MS`. If 007 did not already handle it: store a lock token plus the owner's start time (or hostname + pid + random), and treat a pid whose start time differs as dead.
- A held lock reaches the desk as "Another Guide process is writing. Wait a moment." (check what 003 already mapped).
