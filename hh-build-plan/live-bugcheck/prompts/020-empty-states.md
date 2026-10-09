# Live fix 020. Desk usability C: empty states with one next click

Items 10, 11, 12 of heavy-review-3. Builds on fix 019 (empty brand plate); extend it, do not undo it.

## Read first

- `packages/app/src/server/routes.ts` (`/brand`, `/approve`, `/hh-dashboard`, the empty-question card), `packages/app/src/server/brand-desk.ts`, `packages/app/src/approval.ts`, `packages/app/src/dashboard.ts`, `dashboard.css`, `packages/app/src/client/drive.ts`, `packages/app/src/card.ts` (EMPTY_TITLE), tests `brand-desk`, `approval`, `dashboard`, `drive-client`

## Spec

1. Fresh desk: instead of "No question yet", a "Start the interview" button that starts/resumes the interview through the existing route (CSRF), then shows the first card.
2. Empty /brand: one button "Approve the brief to print the kit" that goes to where the brief is approved (verify the real route), plus a link back to the open question (`/` with the question id).
3. Empty /approve: one sentence on what will appear and a link to the open question.
4. Drive (/hh-dashboard): Pause, Approve, Elevate and Deploy are real `disabled` buttons (not only `aria-disabled`) until something is actionable; the empty headings become one line "No queue yet. The plan lands here after you approve the prompts."; remove the text "Not xAI's agent dashboard".

## Tests

- a fresh project's `/` has "Start the interview"; `/brand` empty links back to the open question; Drive gates are `disabled` with an empty queue and enabled when the fixture has an actionable item.

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
feat(app): empty desks show one next click instead of empty plates
```
