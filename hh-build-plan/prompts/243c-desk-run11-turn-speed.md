---
id: "243c"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243b"]
title: "Desk Run 11: 243b made the Guide turn slow, so two summary-249b tests time out in the full suite"
---

# 243c. Keep the next Guide card fast after 243b

## Why
After 243b (48655aac) the full gate is red. typecheck and lint pass, but `pnpm test` fails twice in a row in packages/engine, both times with the same two tests in packages/engine/test/summary-249b.test.ts:
- "the next card is returned before context-summary resolves": Error: next card timed out after 2000ms
- "the next turn waits for a pending summary before it builds a prompt": Error: second card timed out after 2000ms
Run alone, the file passes, but the first test takes about 1,076 ms and the second about 1,795 ms, which is far too close to the 2,000 ms limit. Under the full suite they go over it. The 243b diff changed packages/engine/src/guide/live-turn.ts (+212 lines), brief-loop.ts, named-host.ts (new) and session-state.ts. Evidence: C:\Users\lucid\Desktop\desk-e2e-run11\hh-driver11\logs\gate-243b.log and engine-rerun.log.

## Do
1. Measure runTurn for a simple answer with a stubbed think (as in summary-249b) on 2b30b446 versus HEAD and find what 243b added on the path to the next card (for example a recap or named-host step that runs on every turn, extra disk reads or writes, a sync scan, an awaited model call, or a wait on the pending summary in the wrong place).
2. Fix the root cause in the source so the next card for an ordinary answer is returned well under the limit (target under 300 ms alone with the stub). Recap and suggested-host work only runs when it applies (closing recap, the hosting question), not on every turn, and never waits for context-summary before the card is returned. Keep every 243b behavior and its tests passing.
3. Do not change, loosen, skip or retime any existing test, including the 2000 ms limits in summary-249b. You may add a test that pins the fast path (for example that runTurn on an ordinary answer does not call the recap or host step).
4. Run `pnpm run typecheck`, `pnpm run lint` and the full `pnpm test` from the repo root. All must pass. Run the engine suite twice to show it is not flaky. Commit with message `fix(engine): keep the next Guide card fast after the 243b recap and host changes (243c)`. Never use --no-verify and do not push.
