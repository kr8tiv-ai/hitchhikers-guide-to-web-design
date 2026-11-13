---
id: 260d
title: Desk comps stage - pick, change, upload and approve comps in plain words
kind: build
effort: xhigh
model: grok-4.7
depends_on: 260b
---

# 260d - Desk comps stage - pick, change, upload and approve comps in plain words

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
The owner sees the Imagine comps on the desk, side by side per page (desktop, phone, long), picks one per view, asks for changes in their own words, or uploads their own comp, before Start build opens.

## Must haves
1. A "Look and feel" step inside the design stages, after Direction and before Pre-build checks (the stage list in `design-stages.ts` and its desk view `packages/app/src/server/design-stage-desk.ts` and the existing page-renders desk in `reference-desk.ts`; extend those, do not fork). `designReadyForBuild` also requires every required comp approved, naming the first missing one.
2. Per page: candidates in a grid at their real aspect, a radio pick per view, "Use this one", "Try again with these changes" (text box, calls `requestCompChange` then redraws that view only), "Upload my own" (png/jpeg/webp, same size limits as attachments), and status words ("Drawing...", "Ready to pick", "Approved"). Approved motion clips play muted inline with a "Use this motion" approve.
3. Routes follow the existing desk route/token/CSRF patterns in `packages/app/src/server/routes.ts`; images are served only from the project's `reference/` folder with path checks.
4. Copy: plain, short, no jargon, no em dashes. Example: "These are sketches of your pages. Pick the one that feels right. The words are added later, so ignore the grey bars."
5. Keyboard and screen-reader usable; works at 375 wide.

## Files
`packages/app/src/server/*` (design-stage desk, reference desk, routes), client files the desk already uses, engine design-stages, tests `packages/app/test/comps-desk-260d.test.ts` and one Playwright e2e `packages/app/e2e/comps-260d.spec.ts` with a fixture project and a fake provider (no network).

## Tests (failing first)
- the stage shows candidates for each view and approving writes comps.json and the fixed render path;
- a change request redraws only that view with the words;
- an upload becomes a candidate and can be approved; a .svg or oversize file is refused;
- Start build stays closed until desktop and phone comps are approved for every primary page;
- path traversal on the image route is refused.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (app, engine), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: desk comps stage (260d)
```
