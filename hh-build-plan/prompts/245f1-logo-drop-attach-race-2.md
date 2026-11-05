---
id: 245f1
title: Logo-drop attach always renders its file name, second pass (context-213 still flakes after 245u1)
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245f
---

# 245f1 - Logo-drop attach always renders its file name, second pass (BUG-135, fifth hit)

## Context

245u1 (commit 17817131) fixed one cause of BUG-135: a late Guide job poll snapshot replaced the live slot after a skip, so the drop zone lost `.hh-attach__name`. Session updates now keep a just-saved logo until a snapshot agrees. That fix was real, but the flake is back.

On Nov 5 2026, CI E2E on main for 3a080e0f (245f, run 41981877324) failed the same assertion again, with 191 other tests passing:

- `packages/app/e2e/context-213.spec.ts:38` ("the context view keeps answers, the logo, and a correction") skips to DP-0.4, calls `page.locator("#hh-logo-file").setInputFiles(logoPath)`, then expects `[data-logo-drop] .hh-attach__name` to have text `paradise-found-logo.png` within 5 s. The element is not found at all, so the attach result never rendered or was wiped.

245f touched no app files, so a second path still loses the attach. Earlier hits: 8c262f0d, c32a4cea (244j), 6d13b188 (245b), 66727213 (245u), now 3a080e0f (245f).

Find the remaining cause by reading the code, starting from what 245u1 changed in `packages/app/src/client/desk.ts` and its test `packages/app/test/logo-drop.test.ts`. Look for every other path that can rebuild or replace `[data-logo-drop]` or the question region after the input is set: the event stream painting a card, a poll or SSE snapshot that is not covered by the 245u1 guard, a reconnect, a re-render on focus or resize, the change handler being bound after the input is interactive, the upload response arriving before or after a re-render, or the skip to DP-0.4 still settling (a second paint for the same card) when the file is set. Reproduce it locally if you can, for example with `--repeat-each` plus CPU throttling, a delayed upload response, or a delayed poll/event.

## Deliverables

1. Fix the root cause in product code if the race is in the app. A real person who picks a logo must always see its name, whatever order the upload response, polls and stream events arrive in. Prefer one source of truth for the attach state that every render path reads, over another special-case guard. Say what the cause was in the commit body.
2. If, and only if, the product behaviour is correct and the test itself races (for example it sets files while the DP-0.4 card is still being painted twice), make the test wait on a real, observable readiness signal before `setInputFiles`. Never just raise timeouts, add sleeps, add retries, or weaken or delete the assertion.
3. Smallest change that fits; remove dead code, including any 245u1 guard the new fix makes redundant. Do not touch the design-system, qa or engine 245 work, site-c, any generated site, or srv.js.

## Tests

- Add a regression test that fails before the fix and passes after (unit or e2e, whichever pins the cause; short timeouts). Keep the 245u1 regression test passing.
- Run `pnpm --filter @hitchhiker/app e2e -- e2e/context-213.spec.ts --repeat-each 30` and report the pass count; it must be 30/30. Also run it with CPU throttling or an injected delay if you built one.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0.

## Done when

All of the above pass, one commit `fix(app): logo-drop attach survives every render path (245f1, BUG-135)`, no push.