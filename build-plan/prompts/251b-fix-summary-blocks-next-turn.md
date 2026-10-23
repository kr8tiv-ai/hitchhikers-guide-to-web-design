---
id: "251b"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: []
time_cap_min: 75
title: "Interview turns: the next answer must not wait on the previous turn's context summary"
---

# 251b. Take the context summary off the NEXT turn's critical path (S4) (time box 75 min)

## Evidence (confirm it yourself first; report what you find)
Desk run 11 interview turns took 68-421 s (about 4 min average, see `build-plan/evidence-run11/QA-LOG.md`). Log: `build-plan/evidence-run11/ai.ndjson`.
How to read it: for model calls (`task` pushback-judge / guide-message / mirror / context-summary) `at` is the call START and `durationMs` its length; for `task: "answer-stage"` rows `at` is the stage END. Example from run 11:
- `21:31:45.744Z` answer-stage "Writing the next question" ends (card shown).
- `21:31:44.832Z` context-summary starts, `durationMs 124697` -> ends about `21:33:49.5Z`.
- `21:33:49.743Z` the next turn's pushback-judge starts, 0.2 s after the summary ended. The same pattern holds on every turn (21:27:40.060 summary end -> 21:27:40.095 judge start; 21:17:34.587 -> 21:17:34.653; ...).
So 249b (`86fa7df2`, `perf(engine): run the context summary off the answer turn critical path`) moved the summary off the turn that starts it, but its step 3 "perform awaits any context-summary still running for this project" (`awaitPendingSummary` in `packages/engine/src/context/packet.ts`, called from the answer-turn path, find it with `git grep -n awaitPendingSummary`) puts it on the NEXT turn's critical path: when the person answers within ~2 min, the judge waits for the summary.
Also in the log: many `context-summary` calls end with `Error: max turns reached` (then a 0 ms retry that also errors), and some guide-message calls do too. Look at why (max-turns setting for that task) and fix it if it is a small, clear config error on the same path; otherwise list it in the report.

## Spec
1. Confirm from code (call graph from the app answer route through `runTurn`/`perform`/`answerText`/`advance`) and from the log above. If the code does not await the pending summary before the judge/guide, stop, write that in the report, and make the commit only add the regression test that proves the turn does not wait.
2. If confirmed: the answer turn (judge, store, mirror, guide-message, card) must never await a summary job. The judge and guide read whatever `CONTEXT-SUMMARY.md` is on disk (stale by one turn is fine, as 249b already accepted for the current turn).
3. Keep 249b's guarantees: summary writes stay serialized per project (no two overlap, no torn file), a failed summary keeps the last good file and logs `context-summary` outcome `error`. Coalesce: if several turns queue summaries while one runs, run at most one more afterwards (latest state), not one per turn.
4. Anything that genuinely needs a fresh summary (e.g. plan/brief drafting, export, desk "Approve plan") may still await it; list those call sites.

## Acceptance criteria and tests (`packages/engine/test/summary-off-path-251b.test.ts`, plus app if the route changes)
- With a fake `think` whose `context-summary` call blocks on a promise you control (never resolved during the assertion), turn N+1's pushback-judge and guide-message are both called and the turn returns its next card while the turn-N summary is still pending. This test must FAIL on d529dde5 (it times out/deadlocks or the judge is not called), then pass.
- Three quick turns while the first summary is still blocked queue at most one follow-up summary; when unblocked, the final `CONTEXT-SUMMARY.md` reflects the latest decisions, and two summaries never run at once.
- A summary that throws leaves the answer saved, logs an `error` outcome, and does not delay or fail the next turn.
- `packages/engine/test/summary-249b.test.ts` stays green (update only an assertion that encoded the "next turn waits" behavior, and say so in the report).

## Commit
```
perf(engine): do not make the next answer wait on the context summary (251b)
```

## Rules (all 251 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix251-wt` (branch `fix-251`, base `d529dde5`). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\hh-fix250-wt`, `C:\Users\lucid\Desktop\hh-fix250b-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. The run 11 evidence you need is copied into `build-plan/evidence-run11/` (read only). Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Spec first, test first: write the new test(s) from the Acceptance criteria below, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test. Do not touch `vendor/`, `.hh-driver/` or `build-plan/`. Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test is running on 4175). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build or a live Grok interview call; tests use fakes or `HH_CASSETTE=replay`.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm --filter @hitchhiker/qa test`, `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(251x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes. Pushing to `main` needs Matt's explicit yes.
- Line numbers are for `d529dde5`; re-find the code if it moved.
