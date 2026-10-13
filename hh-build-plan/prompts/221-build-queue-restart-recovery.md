---
id: "221"
kind: fix
phase: improbability-drive
slice: Forty-Two
title: "Recover an interrupted build prompt after a desk restart, and make Resume continue the queue"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["220"]
files: ["packages/engine/src/guide/brief-desk.ts", "packages/orchestrator/src/", "packages/engine/src/", "packages/app/src/server/", "packages/app/src/client/", "packages/cli/src/", "packages/engine/test/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 221. Recover an interrupted build prompt after a restart; Resume continues the queue
## RULES

Same RULES block as 220 (spec first, at most two attempts then BLOCKED, never weaken/skip/delete/loosen a test, never lower model or effort from `grok-4.7-build-fast` at `xhigh`, never skip the judge, commit at least every 20 minutes because sessions are cut at about 55, never bypass hooks if Git Bash cannot fork (`0xC0000142`), no edits to `.hh-driver/`, `hh-build-plan/` or CI, do not push, no new deps, tests never spawn real Grok). This session runs in the worktree `C:\Users\lucid\Desktop\hh-fix-wt` on branch `fix-220`; never touch `C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design`, `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), or the desk on 127.0.0.1:4175.

## Why this prompt exists

Follow-up to 220 item 0 (BUG-034). Desk Tester: after the 4175 desk restarted, prompt 003 went to `interrupted` although its files (public/logo.svg, src/components/Logo.astro) had been written and its grok run had ended with `end_turn`. It did not rerun, 004 never started, and Drive shows a Resume button that does not move the queue on.

## Item. BUG-034b (S1). Restart recovery and Resume
Acceptance criteria:
- [ ] On desk start (and in the 220 watchdog), every `running` row with no live child is recovered: if the prompt's run log shows a clean `end` (end_turn) and its expected outputs exist, run the gates and mark it passed (or failed from the gate result); otherwise mark it interrupted and rerun it once automatically in a fresh session. Recovery is recorded in build-run.json with the reason.
- [ ] Resume in Drive (and `hh next` / `hh build --resume` in the CLI) continues the queue from the first non-passed prompt: it settles or reruns the interrupted one, then starts the next queued prompt. Resume is idempotent (two clicks start one run) and disabled while a run is live.
- [ ] Drive shows what recovery did ("003 recovered: output verified, passed" or "003 rerun after restart") and the queue advances without manual edits to queue.json.
- [ ] Build model and effort stay `grok-4.7-build-fast` at `xhigh`.
Tests: unit tests for recovery decisions (clean end + outputs -> gates -> passed; no end -> rerun; outputs missing -> rerun; gate fails -> failed); Resume idempotency route test; Playwright/E2E with stub grok: run 001-003, kill the desk server mid-way after 003's stub emits `end`, restart it, assert 003 becomes passed (or reruns) and 004 starts and passes; a second case where 003 is cut before `end` and Resume reruns it then runs 004.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 150 words in the commit body and `.hitchhiker-dev/summaries/221.md`: status, root cause, tests added, verification results.

## Commit

```
fix(app): BUG-034b recover an interrupted prompt and resume the queue (221)
```
