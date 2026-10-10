# 004. CREDITS.json has two shapes

Status: **applied** in the post-159 pass.

## Miss

v2 §12 says the credits file and the credits page match.

- `packages/assets/src/three-d/credits.ts` writes an array of `{ name, author, license, link, usedFor, category }` with licence `CC0-1.0` or `CC-BY-4.0`. `renderCreditsSnippet` renders that array.
- `packages/templates/shared/fetch-assets.ts` `parseCredits` requires `{ assets: [{ file, source, license, author, url? }] }` and allows the licence string `CC0`, which rejects `CC0-1.0`.

Review 087 recorded the split. Both tests still lock their own shape. A file written by the 3D fetcher does not parse as the starter credits file.

## Fix

One parser accepts both shapes and emits one page model. `CC0` and `CC0-1.0` both mean public domain. Do not drop either writer's fields. Add a test each way: an 085 array renders on the credits page, and an 086 `{ assets }` object still downloads.

## Why this pass did not do it

Unifying the types changes two locked test contracts. That is not a local obvious edit.

## Applied

Commit d6b7483. `parseCredits` in `packages/engine/src/credits-file.ts` accepts the 3D array, the `entries` object, and the `assets` object. `CC0` and `CC0-1.0` both count as public domain. The writer's spelling stays on the row. Test `CC0 and CC0-1.0 are public domain and the writer spelling stays` in `packages/engine/test/credits-file.test.ts`.
