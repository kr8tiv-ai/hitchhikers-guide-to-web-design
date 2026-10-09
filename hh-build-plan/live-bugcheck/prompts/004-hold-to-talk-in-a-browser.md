# Live fix 004. Prove Hold to talk in a real browser

Depends on 9010874 (`fix(app): wire Hold to talk on the desk with the browser's speech recognition`).

## Read first

- `packages/app/src/client/desk.ts` (startVoice, stopVoice, finishVoice, voiceMessage, browserEnv)
- `packages/app/src/card.ts` (`talkButton`, notice line), `packages/app/src/card.css`
- `packages/app/test/desk-voice.test.ts` (unit tests with a fake recognizer)
- `packages/app/e2e/answer-one.spec.ts` and `packages/app/playwright.config.*` (how e2e starts a desk with a replay turn handler)

## Goal

The unit tests drive fake events. Add one Playwright e2e that runs the real served `/client/desk.js` in Chromium:

1. `page.addInitScript` installs a fake `webkitSpeechRecognition` (start emits onstart and a final result "testing one two"; stop fires onend).
2. Mouse down on `[data-voice="hold"]`, wait, assert the button reads "Listening. Release to stop" and `aria-pressed="true"`; mouse up; assert `#hh-card-draft` contains "testing one two", the notice says "Heard you", and no request went to `/api/answer` (voice never submits).
3. Keyboard: focus the button, hold Space, release, same result.
4. A recognizer that fires `onerror({ error: "not-allowed" })` shows the blocked-microphone alert.
5. No `webkitSpeechRecognition` at all shows the unsupported message.
6. No page errors in the console during any of it.

Also check by reading the code: `pointerup` outside the button still stops; a disabled button never starts; a question change from SSE aborts listening. Fix any real bug you find in `desk.ts`/`card.ts` in this same commit, with a unit test.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'`: `pnpm --filter @hitchhiker/app test` and the new spec through the app's e2e command (for example `pnpm --filter @hitchhiker/app exec playwright test e2e/hold-to-talk.spec.ts`). All exit 0. Make sure the e2e spec is picked up by the same CI job as the other app e2e specs.

## Commit

```
test(app): hold to talk in Chromium with a stubbed speech recognizer
```
Do not push.
