# Live fix 020. Desk usability B: map links, mobile map, footer

Items 5 and 6 of heavy-review-3.

## Read first

- `packages/app/src/map.ts`, `packages/app/test/map.test.ts`, `packages/app/src/server/routes.ts` (`routeNav`, status/footer HTML, `statusHtml`), `packages/app/src/shell.ts`, `shell.css`

## Spec

1. Map phases are links to their desks (Desk `/`, Brand `/brand`, Approvals `/approve`, Drive `/hh-dashboard`) where a desk exists; the current one has `aria-current="step"`. Phases without a desk stay plain text.
2. Under 720px the map collapses to one line ("Don't Panic · 2/22") with a native `<details>` disclosure for the full map. No JS needed.
3. Footer/status shows only the next action, e.g. "Saved · DP-0.2 · 20 left", not the repeated "Guide is quiet" text. Keep a real error or replay-mode notice (fix 001/003) visible when there is one.

## Tests

- map: links and `aria-current="step"`; the collapsed summary text.
- status: the saved line with the remaining count; an error notice still shows.

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
feat(app): map phases link to their desks and the footer shows the next step
```
