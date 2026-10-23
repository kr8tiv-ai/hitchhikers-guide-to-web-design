# hh 250: fixes from the 2026-10-23 full code review

Source: `build-plan/REVIEW.md` (review of `main` @ `d529dde5`). Matt, 3:08 PM CR: "when we find errors, let's get those fixed, but just keep testing. I want to make this and get it finished."

Baseline: branch `fix-250` from `d529dde5`, worktree `C:\Users\lucid\Desktop\hh-fix250-wt`. Lane B (250g, 250h, cli only) runs in parallel in `C:\Users\lucid\Desktop\hh-fix250b-wt` (branch `fix-250-laneb`) and is merged into `fix-250` before 250f.

Model: `grok-4.7-build-fast --effort xhigh`, one fresh headless session per prompt, one commit each. Every bug fix starts with a failing test. Each prompt is verified by the driver: touched package tests + qa + typecheck + lint + the LocalTests rules. One retry with the failure output, then BLOCKED (backed out on a `blocked-250x` branch) and the chain moves on. Nothing is pushed; pushing to `main` needs Matt's explicit yes.

| Order | Prompt | Lane | Depends on | Time cap | Commit tag |
|---|---|---|---|---|---|
| 1 | [250a-fix-missing-brief-split.md](250a-fix-missing-brief-split.md) | A | none | 60 min | (250a) |
| 2 | [250b-fix-build-runner-missing-grok.md](250b-fix-build-runner-missing-grok.md) | A | none | 75 min | (250b) |
| 3 | [250c-fix-windows-grok-spawn.md](250c-fix-windows-grok-spawn.md) | A | none | 60 min | (250c) |
| 4 | [250d-fix-design-library-errors.md](250d-fix-design-library-errors.md) | A | none | 60 min | (250d) |
| 5 | [250e-fix-stack-decision.md](250e-fix-stack-decision.md) | A | none | 90 min | (250e) |
| 6 | [250i-real-grok-e2e.md](250i-real-grok-e2e.md) | A | none | 90 min | (250i) |
| B1 | [250g-fix-pushcheck-auth.md](250g-fix-pushcheck-auth.md) | B | none | 45 min | (250g) |
| B2 | [250h-fix-supervise-flake.md](250h-fix-supervise-flake.md) | B | none | 60 min | (250h) |
| 7 | merge lane B into fix-250 | A | 250g, 250h done or blocked | – | – |
| 8 | [250f-fix-real-lint.md](250f-fix-real-lint.md) | A | merge | 90 min | (250f) |
| 9 | [250z-checkpoint.md](250z-checkpoint.md) | A | all | 120 min | (250z) |

250f runs after the merge so eslint covers every change in the chain.

## Out of scope: needs Matt's call
1. **Deploy host wiring.** `cli/src/main.ts:490` passes only `deps.soLong`; `deploy/src/dispatch.ts:137` says "X is not connected yet". Only `--host preview` works. Wire Hostinger (behind explicit consent) or reword README:195?
2. **Crawler.** `packages/crawler` (2,210 lines) has no runtime import. Use it for the interview's competitor URLs and the library ingest (robots/policy), or drop "crawled for you" from README:168?
3. **Voice.** `packages/voice` (1,082 lines) is unused; the desk uses a copy (`app/src/client/voice-engine.ts`). Collapse onto the package or delete it?

## Driver
`C:\Users\lucid\Desktop\hh-pending-250\run-250.ps1` (outside the worktree). State: `build-plan\state.json` (lane B: `build-plan\state-laneb.json`). Log: `build-plan\run.log`. Grok and test logs: `build-plan\logs\`. Control: create `build-plan\PAUSE` to pause between prompts.
