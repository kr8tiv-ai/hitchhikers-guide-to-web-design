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
