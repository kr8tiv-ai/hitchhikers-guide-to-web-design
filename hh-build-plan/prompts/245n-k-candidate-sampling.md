---
id: 245n
title: K-candidate sampling for the hero and 2-3 signature sections - K fresh Grok Build sessions, scored by CDP and the jury, winner committed, lessons carried forward
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245m
---

# 245n - K-candidate sampling for critical sections (BUG-150)

## Context

245k marks the hero and 2-3 signature-section prompts `sampling: k`. Sessions run through the Grok Build CLI the desk already uses (`spawnLiveBuild` / `buildSpawnArgs` in `packages/engine/src/guide/site-build.ts`, `spawnGrok` in `ai/grok-cli.ts`). Scoring uses `runCdpAssertions` (245c), the 245f structure gate, and the page jury (245m). Credit use is reported by the existing usage paths (look for how the desk shows Grok usage; if none, count sessions).

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. For a `sampling: k` prompt, run K candidates (config `design.sampling.k`, default 3, max 4; 0 or 1 disables) each in a fresh session. Sampling covers the hero, every prompt that implements a 245v signature moment (front matter `signature: <id>`), and every section DESIGN.md marks `primary`; the generator marks all of them `sampling: k`. For signature prompts, scoring also includes `checkSignature` (245v), the 245w choreography score and the 245x optical findings. Each runs on its own git worktree or temporary branch from the same base commit (use `git worktree`; never touch the main working tree until the winner is chosen; clean up worktrees after).
2. Score each: CDP blockers (any blocker ranks below every clean candidate), structure gate, then jury Design and Creativity. Write `qa/sampling/<promptId>.json` with every score and the session count.
3. Merge only the winner's commit into the build branch with a normal commit; discard the rest. Write a 5-line lessons note (what made the winner better) to `qa/sampling/<promptId>-lessons.md`, and 245k's generator appends it to the next prompt's must_haves.
4. Visible cost: before sampling, the desk shows "This section will run K sessions" with the configured K; the build log and REPORT lines record sessions used. Sampling is never applied to non-critical prompts.

## Tests

Add `packages/engine/test/desk-run11-245n.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- K=3 runs three fake sessions on three worktrees from the same base, keeps the clean highest-jury candidate and merges only its files;
- a candidate with a CDP blocker loses to a clean one with lower jury scores;
- K=1 runs the normal single path; non-sampling prompts never sample;
- worktrees are removed after; lessons are appended to the next prompt;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): sample K candidates for the hero and signature sections and keep the best-scoring one (245n)
```
