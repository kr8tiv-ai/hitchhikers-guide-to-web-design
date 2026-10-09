# Live fix 018. Desk usability A: the card, progress, composer and buttons

Items 1, 2, 3, 4, 7, 8, 9 of heavy-review-3, plus heavy-review-4 items 6 and 7 (mode, questions left, assumption badges). Runs after every bug, Windows, security, quick-start and CLI fix (001-017), so read what 003, 004, 006 and 010 changed in `packages/app/src/card.ts`, `client/desk.ts` and `server/routes.ts` first and build on it.

## Read first

- `packages/app/src/card.ts`, `packages/app/src/card.css`, `packages/app/src/shell.ts`, `packages/app/src/shell.css`, `packages/app/src/client/desk.ts`, `packages/app/src/server/routes.ts` (desk page, `renderTranscript`, status), `packages/engine` interview (how many questions are in the current depth, which are required: `requiredFor`)
- `packages/app/test/card.test.ts`, `desk-voice.test.ts`, `desk-motion.test.ts`, `server.test.ts`, e2e desk specs

## Spec

1. Show the question once: the card title (`#hh-card-ask`) is the page's question; remove the duplicate heading.
2. After the first answer the DON'T PANIC mast shrinks to one line ("Don't Panic · DP-0.2"); the first visit keeps the big mast.
3. Card kicker: "DP-0.2 · 2 of 22 · Don't Panic" from the real depth's question count and phase name, plus "N required still open" when any required question was skipped. The session JSON carries these numbers; the client renders them; no counting in the browser that can drift from the engine.
4. Composer: on screens under 720px the textarea and the Answer/Suggest/Skip row stick to the bottom of the viewport (CSS `position: sticky`, safe-area inset); the why-text scrolls. Desktop unchanged.
5. Buttons: Answer is the only filled (primary) button and is enabled only when the draft has text. Enter submits, Shift+Enter is a newline, with a one-line hint under the field; IME composition (`isComposing`) never submits. Suggest reads "Suggest — I'll mark it as assumed". Skip reads "Skip — we'll assume" and the next card shows the assumption that was written; if the question is required (`requiredFor` non-empty), Skip asks for a confirm click first (inline, not `window.confirm`).
6. Textarea placeholder: one example answer per question (use the question's `suggest` text when present, otherwise a short generic one).
7. Hold to talk becomes a small mic button beside the field, off the primary row, still `data-voice="hold"` with the same pointer/keyboard hold behaviour from 9010874 and the in-place partial updates from fix 004 (do not reintroduce a full card repaint during listening). When no SpeechRecognition exists, it is disabled with the visible text "Talk needs Chrome or Edge".
8. Depth visibility (heavy-review-4 item 6): the card shows the interview mode (Express, Standard or Deep, from config `interviewDepth`) and, for Express, one line that skipped-by-depth questions are deferred with written assumptions, not dropped (verify that is what `seedExpressAssumptions` does and say exactly that). "N questions left" comes from the engine.
9. Assumption state (heavy-review-4 item 7): answers that came from Suggest, Skip or an Express default carry an "Assumed" badge in the transcript/log, and the card right after a Suggest or Skip shows the assumption that was written ("Assumed: ..."), so the person can see and change it. Never auto-approve anything because it was assumed; approval gates stay exactly as they are.

## Tests

- card: mode line and "Assumed" badge render from session data; the count "2 of 22" and phase render; the question text appears once; Answer disabled with an empty draft; Skip on a required question needs a confirm.
- desk: Enter submits, Shift+Enter does not, composition does not; voice tests still pass (update selectors, not behaviour).

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
feat(app): one question, real progress, a pinned composer and honest buttons
```
