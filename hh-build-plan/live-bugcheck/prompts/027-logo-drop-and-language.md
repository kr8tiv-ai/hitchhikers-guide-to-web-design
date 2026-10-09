# Live fix 027. Desk usability F: logo drop zone and the language toggle

Items 17 and 19 of heavy-review-3.

## Read first

- `interview/tree.yaml` (the logo / brand-asset questions whose copy says "drop"; e.g. DP-1.1 and the brand-assets question), `packages/app/src/server/routes.ts` (`/api/upload`, `acceptUpload` in `server/uploads.ts`), `packages/app/src/card.ts`, `packages/app/src/client/desk.ts`, the static comp `packages/app/src/design/comps/desk.html` and where the German restatement appears in the live desk

## Spec

1. Questions whose input includes `upload` (check the `input` field in the tree rather than hard-coding ids) show a drop zone with a real `<input type="file">` (keyboard and click accessible), posting to the existing `/api/upload` with CSRF; the allow-list and size cap stay as they are; the card says which file landed and its safe name, and the answer text can reference it. If a question says "drop" but has no upload input, change the copy instead.
2. The restatement in another language (German in the comp) is off by default and shown only behind a "Read this in …" toggle (native `<details>`), wherever the live desk renders it.

## Tests

- an upload-input question renders a file input and drop zone; a non-upload question does not; a successful upload shows the safe name; the language restatement is collapsed by default.

## Ground rules

- Read `hh-build-plan/live-bugcheck/heavy-review-3-usability.md` (the item numbers below are its numbers).
- Do not restyle. Keep the cream editorial desk, the rust rule, the type scale, and the Don't Panic wordmark; use the existing tokens in `packages/app/src/design/tokens.css` / `tokens.ts` and the voice in `packages/app/src/design/voice.md`. No new fonts, colours, or libraries.
- Keep the design contrast and token tests green (`packages/app/test/design-*.test.ts`), and keep the comps in `packages/app/src/design/comps/` in step only if a test compares them.
- Run: `pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test` (and engine if touched), and the app e2e specs that cover the desk (headless). All exit 0.
- One commit, the message given. Do not push.

## Commit

```
feat(app): a real drop zone for upload questions and the restatement behind a toggle
```
