---
id: "250c"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: []
time_cap_min: 60
title: "Spawn grok through the cmd.exe wrapper in the build runner on Windows"
---

# 250c. Build runner uses the same Windows launcher as the model path (time box 60 min)

Evidence (REVIEW.md F4, P2 #6):
- `packages/engine/src/guide/site-build.ts:436` `spawnLive` calls `spawn(command, args)` directly.
- `packages/engine/src/ai/grok-cli.ts:534-549` `launch()` runs a `.cmd`/`.bat` grok shim through `ComSpec /d /s /c "<quoted line>"` with `windowsVerbatimArguments: true` and `quoteCmdArg` per argument. A `.cmd` shim given to bare `spawn` fails with EINVAL on win32 (documented in `packages/cli/src/improve/pnpm-command.ts:23`).

## Do
1. Test first (engine): export or inject the launcher so a test can check, with `process.platform` simulated as `win32` (inject a platform value; do not monkeypatch globals unsafely), that a `grok.cmd` command makes the build runner spawn `cmd.exe` (or `ComSpec`) with `["/d","/s","/c", "\"...\""]`, verbatim args, and every build arg (prompt path with spaces, `--cwd` with spaces) quoted. A `grok.exe` path still spawns directly. On non-win32 nothing changes.
2. Fix: share one launcher between `grok-cli.ts` and `site-build.ts` (move `launch`/`quoteCmdArg` use into a shared helper inside engine; no new package). Keep `hiddenChildOptions`, stdio, and the kill-tree behavior.

## Acceptance
- New test fails before, passes after. engine tests green, typecheck and lint green.

## Commit
```
fix(engine): run grok.cmd through cmd.exe in the build runner (250c)
```
## Rules (all 250 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix250-wt` (or the lane worktree you were started in). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Test first: write the new test(s) first, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test (the only allowed env guard is the one 250i asks for). Do not touch `vendor/`, `.hh-driver/` or `build-plan/` (250z alone writes its report there). Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test may be running). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(250x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes.
- Source: `build-plan/REVIEW.md` (full code review, 2026-10-23). Line numbers there are for `d529dde5`; re-find the code if it moved.
