---
id: 260z
title: Checkpoint - full suite and a fake-provider end-to-end of the Imagine-first flow
kind: checkpoint
effort: xhigh
model: grok-4.7
depends_on: 260a, 260b, 260c, 260d, 260e, 260f, 260g
---

# 260z - Checkpoint - full suite and a fake-provider end-to-end of the Imagine-first flow

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
Prove the chain works together and nothing else broke.

## Must haves
1. `packages/orchestrator/test/imagine-first-260z.test.ts`: on the towel sample (or a copy in a temp dir), with fake providers and fake think/build runners: brief approved -> design locked -> comps drafted (3 views x K) -> one change request -> approvals -> a motion clip approved -> prompts generated and they name the comps -> one page prompt "built" with a fake shooter that first returns a mismatch (one fix turn) then a match -> section done; and a second page that stays mismatched pauses with reason comp-mismatch.
2. Run the full suite: `pnpm -r --no-bail test`, `pnpm typecheck`, `pnpm lint`. Fix real regressions (one commit per fix, failing test first). A known flaky test from `build-plan/250z-CHECKPOINT.md` may be re-run once; note it.
3. Write `build-plan/260z-CHECKPOINT.md`: what each 260 prompt delivered (by file), test counts per package, anything left open, and the open questions for Matt (key storage choice, default K, cost cap, whether the long comp is on by default, whether the compare gate should block or advise for the first real run).

## Files
the new test, any fixes, `build-plan/260z-CHECKPOINT.md`.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (all), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
chore(checkpoint): full suite and imagine-first end-to-end (260z)
```
