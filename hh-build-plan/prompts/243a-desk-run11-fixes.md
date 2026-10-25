---
id: "243a"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["242d"]
title: "Desk Run 11 fixes: project-file scrubber eats paths, billing Retry, tour position"
---

# 243a. Desk Run 11 fixes

## Why
Desk Tester Run 11 (main d529dde5, then 80bcb1fc) found three bugs. Evidence: C:\Users\lucid\Desktop\desk-e2e-run11\ (BUGS.md, shots\). Write the failing test first for each bug, then fix. All tests use a stubbed model: no Grok spawn, no billed call.

## BUG-068 (S2) Saved .hhproject cannot be reopened when a folder name contains "sk-", "pk-", "rk-" or "xai-"
Run 11 saved a project at C:\Users\lucid\Desktop\desk-e2e-run11\site. The .hhproject sourceDir, resumeMd and snapshot read `C:\Users\lucid\Desktop\de[redacted]\site`, so Resume > Open said "The saved folder is not on this machine" (shots\bug068-not-on-machine.png). Cause: packages/engine/src/project-file/scrub.ts `TOKEN = /(?:sk|pk|rk|xai)-[A-Za-z0-9_-]{8,}/gi` has no left boundary, so "desk-e2e-run11" matches "sk-e2e-run11". Ordinary words such as "desk-", "task-", "disk-", "kiosk-" and "park-" all trigger it.

Do:
1. Only redact real token shapes: require a boundary before the prefix (start of string or a character that is not a letter or digit), and keep the minimum length. Path separators, hyphens inside words and Windows paths must survive unchanged.
2. Never scrub path fields: sourceDir and every path written into resumeMd/resumePrompt/snapshot must stay byte-exact. Scrub only free text values.
3. Keep SECRET_PATTERN in sync with packages/orchestrator/src/progress.ts if it shares the same flaw (fix both the same way, with tests).
4. Tests: scrubText keeps "C:\\Users\\lucid\\Desktop\\desk-e2e-run11\\site", "task-12345678", "kiosk-abcdefgh" unchanged and still redacts "sk-abcdefgh12345", "xai-ABCDEFGH1234", "key=sk-abcdefgh12345". A save/open round-trip test for a project in a folder named "desk-e2e-run11" reopens without the "not on this machine" message.

## BUG-069 (S4) The billing error says "press Retry" but there is no Retry button
Run 11: after the Grok Build balance ran out, the question card showed "Your Grok Build usage balance is used up. Top up your balance, then press Retry." but only Answer, Suggest and Skip were shown (shots\billing-state.png).

Do: when a turn fails with GrokBillingError (packages/engine/src/ai/think.ts), show a real Retry button on the card that re-sends the same saved draft for the same question, keeps the typed text, and does not count as a new answer. Test: a route/render test that a billing failure renders a Retry control, and that pressing it re-runs the same turn with the stub.

## BUG-067 (S3) The tour sits far below the fold and Replay tour does not bring it into view
Run 11 at 1440x900: after Create project the page reloads to the splash at scrollY 0 and the [data-tour] card is at y=2392. Desk menu > Replay tour leaves it at y=2392 and focus stays on BODY (shots\tour-visible.png, shots\tour-replay.png).

Do: when the tour opens (first run after Create project, or Replay tour), scroll it into view and move focus into the tour (its heading or first control), respecting prefers-reduced-motion. Escape still closes it. Test: a Playwright e2e at 1440x900 and 390x844 that the tour's bounding box is within the viewport after Create project and after Replay tour, and that focus is inside [data-tour].

## Done when
pnpm typecheck, the touched packages' tests and the new e2e pass. Do not touch other bugs.

## Commit
```
fix(app,engine): Desk Run 11 fixes for project-file paths, billing retry and tour position (243a)
```
