---
id: "222"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
title: "Turn fix-220 green after 220+221: logo DP-1.1 ask, DP-0.2 advance, live-guide ask copy, voice binds"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["221"]
files: ["packages/engine/src/guide/", "packages/engine/src/", "packages/app/src/server/", "packages/app/src/client/", "packages/engine/test/", "packages/app/test/", "packages/app/e2e/"]
review_checkpoint_embedded: false
---

# 222. Turn fix-220 green after 220 and 221 (CI unit + Playwright)
## RULES

Same RULES block as 220/221 (spec first, at most two attempts then BLOCKED, never weaken/skip/delete/loosen a test, never lower model or effort from `grok-4.7-build-fast` at `xhigh`, never skip the judge, commit at least every 20 minutes, never bypass hooks if Git Bash cannot fork (`0xC0000142`), no edits to `.hh-driver/`, `hh-build-plan/` or CI, do not push, no new deps, tests never spawn real Grok). This session runs in the worktree `C:\Users\lucid\Desktop\hh-fix-wt` on branch `fix-220`; never touch `C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design` (main working tree), `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), or the desk on 127.0.0.1:4175 / 4173 / 4174.

Additional for this session:

- Green first. Root-cause only. Never loosen assertions.
- Commit as soon as each failure cluster is green. Prefer one commit per root cause.
- There is no wall-clock time limit on this session; keep going until the verification block is green or every item is BLOCKED with evidence.
- Do not merge to main and do not force-push. The driver pushes `fix-220`.

## Why this prompt exists

Prompts 220 and 221 finished on tip `d32fc709` (BUG-034 settle + BUG-034b recovery, Paradise Found round 4). Origin `fix-220` is at that tip. GitHub CI on that tip is red:

- **CI unit** run 38441076819 (ubuntu / macos / windows): 343 pass, **1 fail** — `packages/app/test/paradise-logo-211.test.ts:40` `a Logo file upload is named on the DP-1.1 call and survives reload`. Assertion at line 106: expected ask to match `/paradise-found-logo\.png/`, **actual `'Change?'`**. Same failure on all three OSes.
- **Playwright E2E** run 38441077035: **148 passed, 7 failed**:
  1. `e2e/brief-027.spec.ts:13` finished interview drafts brief / starts one build (timeout around reload / "The build is started.")
  2. `e2e/draft-persist.spec.ts:260` picked choice saved without helper in draft — `DP-0.2` never becomes visible after clicking choice B + Answer
  3. `e2e/live-guide.spec.ts:11` Towel and Tea — expected ask `"right number of hands"`, got `"Have you built a website before, and which parts still feel like yours?"` (skill-level / experience question order or copy drift)
  4. `e2e/paradise-found.spec.ts:15` logo survives reload — ask shows `"Change?"` instead of naming `paradise-found-logo.png` (same root as unit fail)
  5. `e2e/voice-no-spend.spec.ts:48` — `DP-0.2` not visible after Answer
  6. `e2e/voice-toggle.spec.ts:501` answer/enter/skip/suggest settle — `DP-0.2` not visible
  7. `e2e/voice-toggle.spec.ts:1070` revised interim — `bindsAfter.document` expected `1`, received `2` (duplicate document listener bind)

Audit (Secret scan + Licence) is green. Do not merge or fast-forward main until this prompt leaves unit + Playwright green.

221's own summary already noted `paradise-logo-211` still fails on HEAD with ask=`Change?` and that a full Playwright run was 145/10 with the same failures reproducing — so these are known leftovers, not flakes.

## Read first

- `packages/app/test/paradise-logo-211.test.ts` (esp. around the DP-1.1 ask assertion)
- `packages/app/e2e/paradise-found.spec.ts`, `draft-persist.spec.ts` (~260), `live-guide.spec.ts`, `voice-no-spend.spec.ts`, `voice-toggle.spec.ts` (~501 and ~1070), `brief-027.spec.ts`
- Product code that builds the DP-1.1 / logo-slot ask text, advances from DP-0.1 → DP-0.2 after Answer / choice pick, and binds voice document listeners
- `git show d32fc709`, `git show 20b1c0b3`, and any 220 commits that touched option-click / guide ask / logo (1018d10f BUG-012, 2335d874 BUG-032, 5a047800 BUG-033)
- `gh run view 38441076819 --log-failed` and `gh run view 38441077035 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. On this worktree tip, run the verification block below and list every failure. Confirm the unit ask is still `'Change?'` and the seven Playwright failures still reproduce. If something is already green, prove it and skip that item.
2. Fix the **logo / DP-1.1 ask** root cause so after a Logo file upload (and after reload) the ask names `paradise-found-logo.png` (or the uploaded logo filename) and does **not** collapse to bare `"Change?"`. Unit `paradise-logo-211` and `paradise-found.spec.ts` must both pass with original assertions intact. Commit `fix(app): DP-1.1 ask names the uploaded logo (222)`.
3. Fix **DP-0.2 advance** after Answer / picked choice so `data-question-id='DP-0.2'` becomes visible. Cover draft-persist choice pick, voice-no-spend, and voice-toggle settle. One root cause if they share it. Commit `fix(app): Answer advances to DP-0.2 (222)`.
4. Fix **live-guide** ask sequence/copy so the Towel and Tea replay reaches the expected `"right number of hands"` ask (product behavior first; only change the test if the product intentionally changed the question text, and then keep the assertion at least as strict and say why in the summary). Commit `fix(app): live-guide ask order (222)` or the matching product fix message.
5. Fix **brief-027** so a finished interview still drafts the brief, approves it, and starts one build (including after reload). Commit when green.
6. Fix **voice document bind** so a revised interim keeps a single document listener (`bindsAfter.document === 1`). Commit `fix(app): voice binds once on revised interim (222)`.
7. Re-run the full verification block. As a checkpoint, review once like Zaphod and fix at most one leftover in a `fix(review):` commit.

## Non-goals

- Do not redo BUG-034 / BUG-034b except where the failing tests prove a regression from 221.
- No new dependencies. No CI workflow edits. No `.hh-driver/` or `hh-build-plan/` edits.
- Do not touch the 4175 desk or the main working tree.
- Do not loosen, skip, delete, or gate any failing test.

## Acceptance criteria

- [ ] `pnpm -r test` fully green on this branch (including paradise-logo-211).
- [ ] `pnpm --filter @hitchhiker/app exec playwright test` fully green (0 failed).
- [ ] `pnpm lint` and `pnpm typecheck` / `pnpm exec tsc -b --pretty false` green.
- [ ] Each root cause named with evidence in `.hitchhiker-dev/summaries/222.md`.
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- After a Logo upload, DP-1.1's ask names the logo file (not bare "Change?").
- Answering DP-0.1 (typed or picked choice) reveals DP-0.2.
- Voice document listeners are bound once, not twice, across a revised interim.
- Unit + Playwright suites are fully green on tip before this prompt finishes.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 250 words in the last commit body and `.hitchhiker-dev/summaries/222.md`: step-1 failures, root cause per cluster, commits landed, verification results, any BLOCKED items with reasons.

## Commit

```
fix(app): turn fix-220 green after 220 and 221 (222)
```
