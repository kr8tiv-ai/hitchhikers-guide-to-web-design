# Live fix 026. Desk usability D: focus, live region, errors, transcript

Items 13, 14, 15, 16, 18 of heavy-review-3. After 003 (errors keep the draft) and 018 (composer); check what they already did.

## Read first

- `packages/app/src/client/desk.ts` (`paint`, `submit`, `applyStream`), `packages/app/src/card.ts`, `packages/app/src/server/routes.ts` (`renderTranscript`, edit/answer routes), `packages/engine` interview commands (is there an edit/revise command?), `packages/app/src/design/tokens.css` / `tokens.ts` (`--color-focus`, `--color-accent`), `packages/app/test/design-contrast.test.ts`

## Spec

1. After a successful submit, focus moves to the new question heading (`tabindex="-1"`), and the latest Guide turn is announced through one `aria-live="polite"` region that is not replaced by innerHTML swaps (update its text only).
2. A save error never replaces the card: it shows under the field (`aria-describedby`), the draft stays, and Answer stays usable (keep 003's wording).
3. Transcript shows the last three turns; earlier ones sit behind a native `<details>` "Earlier".
4. Each previous answer in the log has an Edit action only if the engine supports revising an answer; if it does not, add the smallest engine command that reopens that question (it must keep the state lock and the same atomic write path) or, if that is not small, leave Edit out and say so in the commit body.
5. Focus ring: give `--color-focus` its own value, ink on light and light cream on dark, with at least 3:1 against the button and page backgrounds; extend the contrast test to assert it and that it differs from `--color-accent`.

## Tests

- desk: focus target and live-region text after a submit; an error keeps the card and draft.
- transcript: 5 turns render 3 visible plus "Earlier".
- tokens: focus differs from accent and passes 3:1.

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
fix(app): focus follows the question, errors stay under the field, and focus has its own ring
```
