---
id: 245u1
title: Logo-drop attach always renders its file name, so context-213 stops flaking
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245u
---

# 245u1 - Logo-drop attach always renders its file name (BUG-135, fourth hit)

## Context

CI E2E on main has now failed four times on the same test, each time with 191 other tests passing and the identical commit passing on another run: 8c262f0d, c32a4cea (244j), 6d13b188 (245b) and 66727213 (245u, Nov 4 2026, run 41948874994).

`packages/app/e2e/context-213.spec.ts:38` ("the context view keeps answers, the logo, and a correction") skips to DP-0.4, calls `page.locator("#hh-logo-file").setInputFiles(logoPath)` and then expects `[data-logo-drop] .hh-attach__name` to have text `paradise-found-logo.png` within 5 s. On failure the element is not found at all, so the attach result never rendered (not a wrong name).

This is an intermittent race in the logo-drop attach path or in the test, not noise. Find the real cause by reading the code: the logo input's change handler, the upload request, the code that renders `.hh-attach__name` into `[data-logo-drop]`, and anything that re-renders the question region (live updates, a poll, an SSE or swap that can replace the drop zone after the input was set, or a handler bound only after the input appears). Reproduce it locally if you can (for example by running that spec many times with `--repeat-each` and CPU throttling or a delayed upload response).

## Deliverables

1. Fix the root cause in product code if the race is in the app (for example: the drop zone is replaced by a re-render that drops the attach state, or the change listener is attached after the input is interactive). A real user who picks a logo must always see its name. Say what the cause was in the commit body.
2. If, and only if, the product behaviour is correct and the test itself races (for example it sets files before the question region and its handlers are ready), make the test wait on a real, observable readiness signal before `setInputFiles`. Never just raise timeouts, add sleeps, add retries, or weaken or delete the assertion.
3. Smallest change that fits; remove dead code. Do not touch the design-system, qa or engine 245 work, site-c, any generated site, or srv.js.

## Tests

- Add a regression test that fails before the fix and passes after (unit or e2e, whichever pins the cause; short timeouts).
- Run `pnpm --filter @hitchhiker/app e2e -- e2e/context-213.spec.ts --repeat-each 20` and report the pass count; it must be 20/20.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0.

## Done when

All of the above pass, one commit `fix(app): logo-drop attach always renders its file name (245u1, BUG-135)`, no push.
