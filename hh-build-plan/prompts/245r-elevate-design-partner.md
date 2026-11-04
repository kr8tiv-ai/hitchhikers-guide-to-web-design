---
id: 245r
title: Elevate as a design partner - ranked upgrade menu, design-system changes applied site-wide, process scoring after each section, and a cap on free-form rounds
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245q
---

# 245r - Elevate as a design partner with process-level scoring (BUG-154)

## Context

Elevate exists: `runElevate` (`packages/qa/src/elevate-run.ts`), `runElevateLoop` (`elevate-rounds.ts`), `loadElevateMenu` (`elevate-menu.ts`), the ledger (`elevate-ledger.ts`), `runElevatePicks` (`packages/orchestrator/src/runner.ts`), `runElevateCommand` (cli), and the desk elevate cards (`packages/app/src/brand/approve-cards.ts`). After 245k there are no end-of-queue elevate prompts per page.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. Menu: `loadElevateMenu` returns a ranked list of high-impact upgrades of three kinds: token adjustments (type scale step, spacing, accent use), variant swaps (from variants.json alternatives), and signature moments (from the 245d recipes). Each item has expected impact, the scores it targets, and cost. Ranking uses the latest CDP report, jury notes and drift report.
2. Design-system proposals: an accepted token or variant change is applied to DESIGN.md (owner re-approves the lock per 245a), regenerated tokens/constitution, and queued as one site-wide re-apply prompt, never a per-page patch.
3. Cap free-form "make it prettier" rounds at `design.elevate.freeRounds` (default 1); after that only menu items run.
4. Process scoring: during a page build, run `runCdpAssertions` scope `hero` right after the hero is committed and scope `page` after each major section, and record `qa/process/<promptId>.json`; elevate and the next prompts read it, and a new blocker there triggers the 244k feedback rerun immediately rather than at page end.

## Tests

Add `packages/engine/test/desk-run11-245r.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- the menu for a fixture with a low Creativity score ranks a signature moment above a spacing tweak, and every item names its target score;
- accepting a token change edits DESIGN.md, clears the lock, and queues one site-wide prompt;
- a second free-form round is refused with a plain reason;
- a blocker found after the hero commit triggers a rerun before the next section;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/qa test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(qa): elevate offers a ranked design menu, applies design-system changes site-wide, scores each section as it lands and caps free-form rounds (245r)
```
