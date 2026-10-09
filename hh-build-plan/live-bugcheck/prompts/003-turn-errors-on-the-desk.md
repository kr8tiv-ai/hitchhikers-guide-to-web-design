# Live fix 003. A failed Guide turn must say why, and the desk must not freeze

Depends on 001.

## Read first

- `packages/app/src/server/routes.ts` (`/api/answer`, `/api/suggest`, `/api/skip`, where `Desk error:` is logged, `sendJson`)
- `packages/app/src/client/desk.ts` (`postTurn`, `submit`, `pending`, SSE `applyStream`)
- `packages/engine/src/guide/live-turn.ts`, `packages/engine/src/ai/*` (error types: cassette miss, timeout, usage limit, not signed in, grok missing)
- `packages/app/test/server.test.ts`, `packages/app/test/desk-voice.test.ts`, `packages/app/e2e/live-guide.spec.ts`

## Bug

On DP-2.6 Matt pressed Answer and saw only "The answer did not save. Try again, or skip." The real cause (`cassette miss`) was only in the server log. The card stayed busy, and retrying did the same thing.

## Spec

1. The server maps known turn failures to a short, plain reason in the JSON error, in the Guide's voice and without stack traces or secrets:
   - cassette miss / replay: "The Guide is in replay mode and has no recorded answer for this. Restart hh app without HH_CASSETTE."
   - timeout: "The Guide took too long to answer. Your answer is kept. Try again."
   - grok missing / not signed in / usage limit: say which, and that the typed answer is kept.
   - otherwise: "The Guide hit an error: <one-line message>." (message trimmed to ~160 chars).
2. Whether the answer itself was saved must be true: if the answer was written to state before the Guide failed, say "Saved. The Guide's next question failed: ..." and do not ask for a re-send that would duplicate it.
3. The client never stays `pending` after a response or network failure; the typed draft is kept; a second click works.
4. The log line keeps the full error.

## Tests

- server: a turn handler that throws a cassette miss returns the replay message; one that throws a timeout returns the timeout message; the draft is not lost.
- client: after a failed post, `pending` is false and the Answer button is enabled with the same draft.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` and `pnpm --filter @hitchhiker/engine test`. All exit 0.

## Commit

```
fix(app): show why a Guide turn failed and keep the desk usable
```
Do not push.

## Heavy review notes (verified against the code)

`hh-build-plan/live-bugcheck/heavy-review-1.md` item 1, confirmed: `routes.ts` `turnError` maps every non-`InterviewError` to 500 "The answer did not save. Try again, or skip."; `live-turn.ts` `isQuiet` accepts only `GrokMissingError`, `GrokUnavailableError`, `ThinkTimeoutError`, `ThinkRunError`, `ThinkSchemaError`, `PersonaError`, so `CassetteMissError` (engine `ai/cassette.ts`) and the plain `Error("cassette miss: ...")` from `guideThinkFromScript` escape `askGuide`'s calm fallback.

Also do:
- Treat `CassetteMissError`/`CassetteError` and `/^cassette miss:/` as quiet in `isQuiet`, so the desk falls back to the calm tree ask (and, with 001, says it is in replay mode).
- Order: `answerText` thinks (`judgePushback`) before `storePlain`; `advance` then thinks again in `askGuide`. If the second think fails after `interview.json` was written, the in-memory session is stale and a retry gets "That question is no longer on the desk." Reload the interview from disk after a failed turn (`finally`), and return the real next question instead of a 409/500. Only say "did not save" when the write itself threw.
- Map engine `LockHeld` to "Another Guide process is writing. Wait a moment." (409).
- `desk.ts` SSE `error` listener is empty: after a few failed reconnects show a quiet "The desk lost its connection to hh app. Is the PowerShell window still open?" status.
