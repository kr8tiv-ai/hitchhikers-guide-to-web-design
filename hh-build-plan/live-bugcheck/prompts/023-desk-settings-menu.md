# Live fix 023. Desk usability E: one Desk menu for settings

Item 20 of heavy-review-3, merged with heavy-review-2 item 8 and fix 017. Read what 017 decided and built first; extend it, do not duplicate it.

## Read first

- fix 017's commit and files, `packages/app/src/server/routes.ts` (`routeNav`), `packages/engine` config (`ai.model`, `ai.effort`, voice/STT), `packages/voice/src/xai-stt.ts` (`quoteStt`), `/hh-settings` skill in `packages/grok-plugin`

## Spec

1. Settings live in one "Desk" menu (a native `<details>` menu in the header, not a seventh nav item) with: voice input (browser speech / local whisper / xAI STT), model, effort, and the xAI speech rate.
2. xAI STT can only be turned on after the menu shows both `quoteStt` labels (--.10/h REST, --.20/h streaming) and the person accepts them; the POST is CSRF-protected and refuses without acceptance. Model and effort only accept values the config already allows.
3. No paid call is made by opening or saving the menu.

## Tests

- the menu renders inside the header, not in the route nav; both rates come from `quoteStt`; enabling xAI STT without acceptance is refused; with acceptance the config saves.

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
feat(app): one Desk menu for voice, model, effort and the STT rate
```
