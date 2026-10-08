# 006. The desk does not persist a brand approval

Status: **proposed**. Not applied. Do not add a new approval model.

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
