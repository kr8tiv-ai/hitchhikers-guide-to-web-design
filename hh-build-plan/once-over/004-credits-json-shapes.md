# 004. CREDITS.json has two shapes

Status: **proposed**. Not applied.

## Miss

v2 §12 says the credits file and the credits page match.

- `packages/assets/src/three-d/credits.ts` writes an array of `{ name, author, license, link, usedFor, category }` with licence `CC0-1.0` or `CC-BY-4.0`. `renderCreditsSnippet` renders that array.
- `packages/templates/shared/fetch-assets.ts` `parseCredits` requires `{ assets: [{ file, source, license, author, url? }] }` and allows the licence string `CC0`, which rejects `CC0-1.0`.

Review 087 recorded the split. Both tests still lock their own shape. A file written by the 3D fetcher does not parse as the starter credits file.

## Fix

One parser accepts both shapes and emits one page model. `CC0` and `CC0-1.0` both mean public domain. Do not drop either writer's fields. Add a test each way: an 085 array renders on the credits page, and an 086 `{ assets }` object still downloads.

## Why this pass did not do it

Unifying the types changes two locked test contracts. That is not a local obvious edit.
