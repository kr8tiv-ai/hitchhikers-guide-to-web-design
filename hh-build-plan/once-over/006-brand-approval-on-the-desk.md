# 006. The desk does not persist a brand approval

Status: **applied**. Do not add a new approval model.

## Miss

v2 §5 and Matt Q11 require "happy with this?" and an approval the user can give. The pieces exist apart:

- `packages/engine/src/brand/approve.ts` `applyStatus` writes `Status: approved` only when every section is true.
- `packages/app/src/brand-kit.ts` renders Approve and Redo buttons.
- `packages/app/src/brand/approve-cards.ts` `bindApproveDeck` calls a callback and does not write a file.
- `packages/app/src/server/routes.ts` `renderBrand` and `renderApprove` are empty plates. No route calls `applyStatus`.

The live desk at `/brand` and `/approve` shows the empty plate. A click on the kit HTML does not reach the file gate. Review 067 recorded the same gap.

## Fix

When a kit file is already on disk, the existing `/brand` route renders `renderBrandKit` and a POST calls `applyStatus` / `redoSection`. Use the section ids those functions already accept. Do not invent new gates. The empty plate stays the state when no kit file exists.

Add a test that a POST flips the status line and that a partial approval stays draft.

## Why this pass did not do it

Wiring the desk to the file gate is a product path, not a local type fix. This pass does not invent that surface.

## Applied

`GET /brand` renders `renderBrandKit` when `.hitchhiker/brand/brand-kit.json` is a brand kit model. If that file is absent and `.hitchhiker/brand/brand-kit.html` is present, the desk serves that HTML. With neither file, the empty plate is unchanged. `/approve` is its own plate, not an alias, and stays as it was.

`POST /api/brand` uses the same CSRF check as the other mutating routes. Approve calls `applyStatus` for `purpose`, `voice`, `tokens`, `imagery`, `logo`, and `neighbors`. Redo calls `redoSection`. Any other section id returns 400. The kit page posts only to this desk. Kit responses allow `style-src 'unsafe-inline'` so the swatches paint. Other routes keep `style-src 'self'`.

Tests: `packages/app/test/brand-desk.test.ts`. `pnpm exec tsc -b` exited 0. With `HH_CASSETTE=replay`, `@hitchhiker/app` exited 0 (129 pass) and `@hitchhiker/engine` exited 0 (603 pass, 1 skipped live smoke).
