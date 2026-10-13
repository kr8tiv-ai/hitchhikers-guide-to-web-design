---
id: "224"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
title: "CI green on fix-220 after 223: judge-003 Answer enable after fill"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["223"]
files: ["packages/app/src/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 224. Turn origin fix-220 CI green after 223 (Playwright judge-003)

## RULES

Same RULES block as 220/221/222/223 (spec first, at most two attempts then BLOCKED, never weaken/skip/delete/loosen a test, never lower model or effort from `grok-4.7-build-fast` at `xhigh`, never skip the judge, commit at least every 20 minutes, never bypass hooks if Git Bash cannot fork (`0xC0000142`), no edits to `.hh-driver/`, `hh-build-plan/` or CI workflows, do not push, no new deps, tests never spawn real Grok). This session runs in the worktree `C:\Users\lucid\Desktop\hh-fix-wt` on branch `fix-220`; never touch `C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design` (main working tree), `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), or the desk on 127.0.0.1:4175 / 4173 / 4174.

Additional for this session:

- Green first. Root-cause only. Never loosen assertions.
- Commit as soon as each failure cluster is green. Prefer one commit per root cause.
- There is no wall-clock time limit on this session; keep going until the verification block is green or every item is BLOCKED with evidence.
- Do not merge to main and do not force-push. The driver pushes `fix-220`.

## Why this prompt exists

Prompt 223 finished on tip `f9bc1acb` (`fix(app): turn fix-220 CI green after 222 (223)`). Origin CI on that tip:

- Lint/typecheck/unit: **ubuntu, macos, windows all success**
- Licence audit + Secret scan: **success**
- Playwright E2E run 38484551333 / job 115594946145: **154 passed, 1 failed**

### The one failure

`e2e/judge-003.spec.ts:14` **a concrete answer advances and a cited gap asks only once**

- Fails on the first `answer(...)` at line 39 via helper line 58: `fill` then `click` Answer.
- Call log: locator `[data-action="answer"]` resolves to a **disabled** primary Answer button; after brief "not stable", then 114× "element is not enabled" until the 60s test timeout.
- Filled text: `"30 qualified inquiries a month"` into `#hh-card-draft`.
- Live-guide on the same tip is green (`say` uses the same fill+click pattern). So 223's Answer-enable fix did not cover this path (custom tree / judge cassette / first card after Skip tour / paint timing).

Do not fast-forward main until this prompt leaves all six checks green on the new tip.

## Read first

- `packages/app/e2e/judge-003.spec.ts` (`answer` helper ~56, first call ~39)
- Client code that enables/disables `[data-action="answer"]` from `#hh-card-draft` (input/change/composition, pushback clear, finishTurn, card repaint)
- What 223 changed for Answer enable / draft persist / same-card repaint (commits on tip: `e8a6e47e`, `48017f35`, `4a06c97f`, `c1a45dc7`, `f9bc1acb`)
- Why live-guide `say` passes and judge-003 `answer` fails on the same tip
- `gh run view 38484551333 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. On this worktree tip (`f9bc1acb`), reproduce:
   - `pnpm --filter @hitchhiker/app exec playwright test e2e/judge-003.spec.ts`
   - Optionally confirm live-guide still green. List every failure. If already green locally, still prove CI root cause or race and harden so CI stays green.
2. Fix **Answer enable after fill** on the judge-003 path so the first (and later) `answer` helper clicks succeed when `#hh-card-draft` has non-empty text, whether text arrived via Playwright `fill` or real input events. Prefer a product fix over changing the e2e helper; if the helper must dispatch `input`, keep it minimal and say why. The full judge-003 scenario must pass (concrete advance, cited gap once, then advance). Commit with a root-cause message such as `fix(app): Answer enables after fill on judge cards (224)`.
3. Re-run the full verification block. As a checkpoint, review once like Zaphod and fix at most one leftover in a `fix(review):` commit.

## Non-goals

- Do not redo 220/221/222/223 fixes except where this CI failure proves a regression or incomplete fix.
- No new dependencies. No CI workflow edits. No `.hh-driver/` or `hh-build-plan/` edits.
- Do not touch the 4175 desk or the main working tree.
- Do not loosen, skip, delete, or gate any failing test.

## Acceptance criteria

- [ ] `pnpm lint` and `pnpm typecheck` / `pnpm exec tsc -b --pretty false` green.
- [ ] `pnpm -r test` fully green on this Windows machine.
- [ ] `pnpm --filter @hitchhiker/app exec playwright test` fully green (0 failed), including judge-003.
- [ ] Each root cause named with evidence in `.hitchhiker-dev/summaries/224.md`.
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- A non-empty `#hh-card-draft` enables Answer on judge-003's first and later turns so `answer` can advance.
- Playwright on tip is fully green before this prompt finishes.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 250 words in the last commit body and `.hitchhiker-dev/summaries/224.md`: step-1 failures, root cause, commits landed, verification results, any BLOCKED items with reasons.

## Commit

```
fix(app): turn fix-220 CI green after 223 (224)
```
