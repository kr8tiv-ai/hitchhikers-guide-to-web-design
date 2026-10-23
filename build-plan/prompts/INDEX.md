# hh 251: fixes from Desk Tester run 11 (main d529dde5)

Source: `build-plan/evidence-run11/` (copied read-only from `C:\Users\lucid\Desktop\desk-e2e-run11`: BUGS.md, LIBRARY-AUDIT.md, QA-LOG.md, PROGRESS.md, out-004.txt, cmd-004.js, ai.ndjson, PARADISE-FOUND-BRIEF.md).

Baseline: branch `fix-251` from `d529dde5`, worktree `C:\Users\lucid\Desktop\hh-fix251-wt`. Single lane.

Model: `grok-4.7-build-fast --effort xhigh`, one fresh headless session per prompt, one commit each. Every bug fix starts with a failing test written from the prompt's Acceptance criteria. The driver verifies each prompt: tagged commit + new test file (not for 251e) + touched package tests + qa + typecheck + lint. One retry with the failure output, then BLOCKED (work kept on `blocked-251x`, backed out) and the chain moves on. After the chain: full suite `pnpm -r --no-bail test` (HH_CASSETTE=replay), typecheck, lint. Nothing is pushed; pushing to `main` needs Matt's explicit yes.

| Order | Prompt | Time cap | Commit tag |
|---|---|---|---|
| 1 | [251a-fix-tour-into-view.md](251a-fix-tour-into-view.md) BUG-067 S3 | 75 min | (251a) |
| 2 | [251b-fix-summary-blocks-next-turn.md](251b-fix-summary-blocks-next-turn.md) S4 | 75 min | (251b) |
| 3 | [251c-feat-reference-site-scoring.md](251c-feat-reference-site-scoring.md) | 90 min | (251c) |
| 4 | [251d-fix-design-library-errors-and-packs.md](251d-fix-design-library-errors-and-packs.md) | 75 min | (251d) |
| 5 | [251e-plan-component-library.md](251e-plan-component-library.md) docs only, do not build | 30 min | (251e) |
| 6 | FULLTEST (driver, no Grok session) | 150 min | none |

Overlap: 251d touches the same `attachDesignSelection` catch as 250d on `fix-250`; 251d is told to use the same library-error.txt / artDirection "none" shape so the later merge is simple.

## Driver
`C:\Users\lucid\Desktop\hh-pending-251\run-251.ps1` (outside the worktree). State: `build-plan\state.json`. Log: `build-plan\run.log`. Grok and test logs: `build-plan\logs\`. Control: create `build-plan\PAUSE` to pause between prompts.
