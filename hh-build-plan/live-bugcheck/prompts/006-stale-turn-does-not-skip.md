# Live fix 006. A failed Guide turn must not answer the next question

Depends on 003 for the words. This prompt is the cursor. Do not put the generic "did not save" string back.

## Read first

- `packages/app/src/server/routes.ts` (`createLiveTurn` around 220–256, `selectGuideThink` around 281–294, `turnError` around 1906–1917)
- `packages/engine/src/guide/live-turn.ts` (`perform` around 157–179, `answerText` / `storePlain` around 206–210 and 429–432, `isQuiet` around 474–482)
- `packages/app/src/client/desk.ts` (`postTurn` around 183–188, `submit` around 447–476)
- `hh-build-plan/live-bugcheck/REPORT.md` finding F-01

## Bug

The id check uses the interview object kept in the desk process. `runTurn` opens a new one from disk and never sees the id. The answer is written, then the model runs. A cassette miss is not a quiet error, so it throws after the write, and `setInterview` is skipped.

Repro, temp project, port 0, `HH_CASSETTE=replay`, not under `node --test` (that path installs `unavailableGuideThink`, which is quiet and hides this):

1. `POST /api/answer` for `DP-0.1` returned 500 `The answer did not save. Try again, or skip.`
2. `interview.json` already contained `DP-0.1` as `ANSWERED`.
3. The same post again returned the same 500, and the file then contained `DP-0.1` and `DP-0.2`, both `ANSWERED`, both the same text.

Suggest and Skip use the same `perform` path. The client throws away any session on a non-ok response, so the card stays on the old question and the button comes back (`pending` is already cleared at `desk.ts` 467).

## Spec

1. `runTurn`'s input includes the question id. `perform` writes only when `openInterview().next()` is that id. A mismatch throws `InterviewError` `command` and does not write an answer, a suggest, or a skip.
2. `createLiveTurn` loads the interview from disk at the start of every request. It reloads in a `finally` when `runTurn` throws, so the next request cannot pass a stale id check. On a throw after the answer is already on disk, the JSON error uses 003's saved-wording if that commit has landed, otherwise `Saved. The Guide's next question failed.` The body includes the reloaded session. The client paints that session, clears the draft, and does not leave the person on the question that was just stored.
3. A throw before the write (empty answer, validation, a miss during the pushback judge that does not store) still keeps the draft and does not advance the card. 003's "second click works" stays true for that case.
4. Do not weaken `isQuiet`. A cassette miss may still throw. The desk has to notice the write anyway.

## Tests

Inject the guide `think` (a `guideThink` option on `createDeskApp` / `startServer` is fine). Do not replace the whole turn handler, and do not depend on `NODE_TEST_CONTEXT`: that installs the quiet guide.

- The injected think throws `CassetteMissError` on the guide-message task and succeeds on the pushback task. One answer post stores one id. A second post of that same id stores nothing more. The error JSON includes a session whose question is the next id, or done.
- A think that throws before any store leaves `interview.json` unchanged and the client draft in place.
- Skip and suggest, same rule: a throw after their store does not apply the command to the following id.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` and `pnpm --filter @hitchhiker/engine test`. All exit 0.

## Commit

```
fix(app): do not apply a failed turn's text to the next question
```
Do not push.
