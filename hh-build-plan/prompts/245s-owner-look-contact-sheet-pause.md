---
id: 245s
title: Owner look between pages - after a page passes, the desk shows a contact sheet and pauses until the owner says OK
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245r
---

# 245s - Owner look: contact sheet and a pause after each page (BUG-155)

## Context

In run 11 the queue ran 121 prompts without the owner seeing the site. The queue already supports a queue-wide pause: `queue.pause` (`{ at, after }`), `holdInterruptedQueue`, `resumePausedQueue` and `continueSiteBuild` in `packages/engine/src/guide/site-build.ts`; the desk drive view lives in `packages/app/src/drive-markup.ts`, `packages/app/src/client/drive.ts` and routes in `packages/app/src/server/routes.ts` / `desk-flow.ts`. This prompt may edit those app files (unlike 244k), only as far as needed.

## Deliverables

1. When a page/section prompt has passed its loop (245l) and jury (245m), the engine writes a contact sheet: `qa/contact/<promptId>.png` (the final 375 / 768 / 1440 shots side by side with the render, labelled; built with the existing Playwright/Chromium tooling or `sharp` if already a dependency, no new paid service) plus `qa/contact/<promptId>.json` (paths, jury scores, rounds used).
2. Then it sets `queue.pause = { at, after: promptId, reason: "owner-look" }` (extend the pause type; old pause files without `reason` keep working) and does not start the next prompt.
3. The desk drive view shows, for an owner-look pause: the contact sheet, the jury scores against the bar, and two actions: "Looks right, continue" (calls `resumePausedQueue`) and "Needs changes" with a text box, which queues a fix prompt after this one carrying the owner's words plus the render (same builder as 245m) and then resumes. Plain words, no jargon. Auto-retry never clears an owner-look pause.
4. A config switch `design.ownerLook` (default true) lets the owner turn it off; when off, nothing pauses and the contact sheet is still written.
5. Generic; do not touch the running run-11 desk or its queue.

## Tests

Add `packages/engine/test/desk-run11-245s.test.ts` and an app e2e `packages/app/e2e/owner-look-245s.spec.ts` (fixture project, fake runner; short timeouts):
- after a page prompt passes, queue.pause has reason owner-look and the next prompt stays queued;
- "Looks right" resumes and the next prompt starts; "Needs changes" with text inserts one fix prompt containing the text and the render path, then resumes;
- a legacy pause without a reason still resumes as before;
- with `design.ownerLook: false` nothing pauses and the contact sheet exists;
- setup/SEO prompts never pause for a look;
- the drive view shows the contact sheet image and both actions;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/app test` and the new e2e spec through the app's existing Playwright e2e script.
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(app): the desk shows a contact sheet after each page and waits for the owner's OK before the next (245s)
```
