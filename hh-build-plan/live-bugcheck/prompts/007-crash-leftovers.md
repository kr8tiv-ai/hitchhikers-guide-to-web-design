# Live fix 007. A half-written lock or interview file must not wedge the desk

## Read first

- `packages/engine/src/lock.ts` (`classify` around 111–121, `STALE_LOCK_MS`, the legacy `state.lock` steal in `settleLegacyStateLock`)
- `packages/app/src/server/routes.ts` (`readAnswers` around 1391–1394, `buildSession`, `turnError` around 1906–1917)
- `packages/engine/src/guide/live-turn.ts` (`seedExpressAssumptions` around 116–125, `markLatestSoft` around 421, `persistSession` around 500–513)
- `hh-build-plan/live-bugcheck/REPORT.md` finding F-02

## Bug

`classify` treats a lock file that is not JSON as held forever (pid 0). A parsed lock whose pid is dead and whose `acquiredAt` is not a date is also held forever, because the 30s floor requires `Date.parse` to succeed. A kill during `writeFile` of `interview.json` (express seed and the soft-mark writer truncate the live file) makes `readAnswers` throw. That function has no try/catch, and `buildSession` runs for the page, `/api/session`, and `/api/events`, so the desk answers 500 `The desk could not finish that request.` `LockHeld` during the intentional 30s floor is reported as `The answer did not save.`

Confirmed with `acquire` and a clock a day ahead: `{not json` stayed `LockHeld` pid 0 and the file remained; a dead pid with `acquiredAt: "not-a-date"` stayed `LockHeld`. A dead pid 60s ago with a real timestamp was stolen. A dead pid 5s ago stayed held. Overwriting `interview.json` with `{` made `GET /api/session` return 500.

## Spec

1. A lock that does not parse is removed and the acquire retries, same as a dead legacy `state.lock`. A parsed lock whose pid is alive stays held, even when the timestamp is bad. A parsed lock whose pid is dead and whose timestamp is not a finite time is stolen. A dead pid with a valid timestamp younger than 30s stays held. Do not shorten `STALE_LOCK_MS`.
2. `seedExpressAssumptions`, `markLatestSoft`, and `persistSession` write through `replaceViaTemp` (or the same temp-and-rename), not `writeFile` on the live path.
3. `readAnswers` / `buildSession` catch a torn `interview.json` and return a short error the page can show: the interview file could not be read and was left half-written. No stack, no invented answers. `/api/session` returns that as JSON 500. The process stays up.
4. `LockHeld` on a turn is 409 with a sentence that the previous save is still closing, and to try again in a moment. It is not "the answer did not save."

## Tests

- Engine: corrupt lock is acquired after the steal, clock a day ahead. Dead pid plus a non-date is stolen. Dead pid plus a timestamp 5s ago still throws `LockHeld`. Live pid is not stolen.
- App: `interview.json` containing `{` makes `/api/session` return the half-written sentence and the process still serves a later request. A `LockHeld` from the turn handler returns the 409 sentence.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/engine test` and `pnpm --filter @hitchhiker/app test`. All exit 0.

## Commit

```
fix(engine): recover a torn state lock and a torn interview file
```
Do not push.
