---
id: 245q
title: Coherence reviewer - whole-site screenshots every page (or 5-8 sections) and a drift report the next prompts must address
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245p
---

# 245q - Coherence reviewer and drift report (BUG-153)

## Context

Per-page loops can still drift apart. The orchestrator already inserts review items (`review-after-<id>`, every third build prompt and at phase end, `packages/orchestrator/src/schedule.ts`); `captureSitePages` (beauty-gate.ts) shoots pages; `think()` gives a Grok CLI vision review; VISUAL-CONSTITUTION.md (245b) is the yardstick.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. After each completed page (or every `design.coherenceEvery` sections, default 6, whichever comes first), run a coherence review: shoot every built page at 1440 and 375, send a contact sheet with VISUAL-CONSTITUTION.md to `think()`, and get JSON drift items `{ id, pages, issue, expected, fix }` (type, colour use, spacing rhythm, imagery grade, motion feel, signature moments).
2. Write `.hitchhiker/drift/<n>.md` and `.json`. 245k's generator lists open items in the next prompts' must_haves; an item closes when the next coherence review no longer reports it. An item open across two reviews queues one targeted fix prompt.
3. Hook it into the existing review schedule instead of a new scheduler; the review-every-3 items keep running.

## Tests

Add `packages/engine/test/desk-run11-245q.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- after a page completes, one coherence review runs and writes a drift report;
- open items appear in the next page prompt; an item reported twice queues one fix prompt;
- the existing every-3 review items are unchanged;
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
feat(orchestrator): a coherence reviewer writes a whole-site drift report that later prompts must address (245q)
```
