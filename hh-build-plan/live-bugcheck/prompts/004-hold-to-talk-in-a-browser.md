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

## Heavy review notes (verify each in the browser test before fixing)

`hh-build-plan/live-bugcheck/heavy-review-1.md` item 4:
- `onresult` calls `paint()`, which replaces the whole card on every partial result. The listeners are on `document`, so pointerup still arrives, but update the textarea value and the notice in place during listening instead of repainting the card (keeps focus, caret and the held button).
- Chrome can end recognition by itself (a pause, or ~60s) while the pointer is still down: track "held" separately from recognition and restart while held.
- If `stop()` happens before `onstart`, Chrome may never fire `onend`; then `recognition` stays non-null and the button is dead until reload. After stop, abort and finish after ~400ms if `onend` has not fired. Add a unit test for this.
- A normal fast release shows the "allow the microphone" sentence even when the mic is already allowed. Show the Allow copy only on `not-allowed` / `service-not-allowed`; a fast release with nothing heard says "Hold the button while you speak."
- Chrome's Web Speech sends audio to Google's speech service. Fix the comment in `desk.ts` that says nothing leaves the machine, and add a one-line note under the button the first time it is used ("Chrome sends this audio to its speech service.").
- `setPointerCapture` on pointerdown where available.
