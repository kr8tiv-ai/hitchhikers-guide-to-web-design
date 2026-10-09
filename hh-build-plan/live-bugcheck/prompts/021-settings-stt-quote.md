# Live fix 021. The STT rate must be shown and accepted before xAI STT can be enabled

From `hh-build-plan/live-bugcheck/heavy-review-2.md` item 8. Check first what post-159 fix 009 did (`hh-build-plan/once-over/009-stt-rate-on-a-settings-screen.md`, commit e9c6b41: the `/hh-settings` skill prints both `quoteStt` labels). Do not duplicate it.

## Read first

- `packages/voice/src/xai-stt.ts` (`quoteStt`), the `/hh-settings` skill in `packages/grok-plugin`, `packages/engine` config (`ai`, voice/STT settings), `packages/app/src/server/routes.ts` (route table, CSRF, nav), `hh-build-plan/CONTEXT-PACKAGE.v2.md` (what the spec says about where the rate is shown)

## Decide, then do one of

- If the spec (v2) requires the rate on a desk screen: add a `/settings` route with the STT choice (whisper.cpp local, default; xAI STT with both rates from `quoteStt`, $0.10/h REST and $0.20/h streaming), an explicit "I accept this rate" control, CSRF on the POST, and config only changes after acceptance. Link it from the desk nav. Tests: GET shows both labels from `quoteStt` (not hard-coded), POST without acceptance is refused, POST with acceptance saves.
- If the spec only requires it in the skill and fix 009 covers it: make no route; add a one-line pointer on the desk (where voice is offered) to `/hh-settings`, and record the decision in the commit body.

Do not enable any paid call. Do not touch keys.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run app, voice and grok-plugin tests. All exit 0.

## Commit

```
feat(app): show and accept the STT rate before xAI STT can be enabled
```
(or `docs(app): point voice settings at /hh-settings` if no route was needed). Do not push.
