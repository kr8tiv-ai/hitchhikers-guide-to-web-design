---
id: "223"
kind: checkpoint
phase: improbability-drive
slice: Forty-Two
title: "CI green on fix-220: draft skip clear, live-guide Answer enable, Windows templates path"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["222"]
files: ["packages/app/src/", "packages/app/e2e/", "packages/templates/", "packages/engine/src/"]
review_checkpoint_embedded: false
---

# 223. Turn origin fix-220 CI green (Playwright + Windows unit)

## RULES

Same RULES block as 220/221/222 (spec first, at most two attempts then BLOCKED, never weaken/skip/delete/loosen a test, never lower model or effort from `grok-4.7-build-fast` at `xhigh`, never skip the judge, commit at least every 20 minutes, never bypass hooks if Git Bash cannot fork (`0xC0000142`), no edits to `.hh-driver/`, `hh-build-plan/` or CI workflows, do not push, no new deps, tests never spawn real Grok). This session runs in the worktree `C:\Users\lucid\Desktop\hh-fix-wt` on branch `fix-220`; never touch `C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design` (main working tree), `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), or the desk on 127.0.0.1:4175 / 4173 / 4174.

Additional for this session:

- Green first. Root-cause only. Never loosen assertions.
- Commit as soon as each failure cluster is green. Prefer one commit per root cause.
- There is no wall-clock time limit on this session; keep going until the verification block is green or every item is BLOCKED with evidence.
- Do not merge to main and do not force-push. The driver pushes `fix-220`.

## Why this prompt exists

Prompt 222 finished on tip `01655c1a` (`fix(app): turn fix-220 green after 220 and 221 (222)`). Local verification claimed lint/typecheck/unit/Playwright green. Origin CI on that tip is still red:

### Playwright E2E run 38454939704 — 153 passed, **2 failed**

1. `e2e/draft-persist.spec.ts:426` **skip removes the draft and an empty box stores nothing**
   - After fill `"Skip me"`, click Skip, advance to DP-0.2, draft box is empty — but `draftKeys(page)` still includes `"Skip me"`.
   - Assertion: `expect(keys.includes("Skip me")).toBe(false)` received `true`.
   - Root: Skip clears the visible draft but leaves the persisted draft key/value for that question (or does not remove the old key when advancing).

2. `e2e/live-guide.spec.ts:11` **replays ten Towel and Tea turns at 375…**
   - Fails on the first `say(...)` at line 65: fill `"The shop is mine, Towel and Tea."` then click Answer.
   - Answer button stays **disabled** for the full 60s timeout (`element is not enabled`).
   - Expected next ask: `"right number of hands"` / `DP-0.2`.
   - Likely regression from 222 typed-answer / pushback / Answer-enable changes (`ba10f765`, `5715708c`, `33d8030e`): Playwright `fill()` may not fire the input/composition events the enable logic now requires, or enable state ignores a filled draft on the first DP-0.1 card.

### CI unit — Windows only (ubuntu + macos green)

- Job: Lint, typecheck, and unit tests (windows-latest) run 38454939713 / job 115495124725 — **failed**
- `packages/templates` test: 36 pass, **1 fail**
- Error while building starter under `%TEMP%\hh-starters-*\vite-react-world`:
  ```
  RolldownError: The "fileName" or "name" properties of emitted chunks and assets must be strings that are neither absolute nor relative paths, received "../../../../../../RUNNER~1/AppData/Local/Temp/hh-starters-aNt4qo/vite-react-world/world.html".
  ```
- Windows short 8.3 path (`RUNNER~1`) / relative path from temp outDir into HTML emit. Ubuntu/mac do not hit this. Fix the templates starter build or the test harness so Vite/Rolldown emit a plain basename (or a path that stays inside the project root) on Windows. Do not skip the Windows matrix job.

Secret scan + Licence audit are green. Do not fast-forward main until this prompt leaves all six checks green on the new tip.

## Read first

- `packages/app/e2e/draft-persist.spec.ts` (skip test ~426), `packages/app/e2e/live-guide.spec.ts` (`say` helper ~111 and first turn ~65)
- Client code that enables/disables `[data-action="answer"]` from `#hh-card-draft` (input/change listeners, pushback clear, finishTurn)
- Client/server draft persistence: what Skip writes/removes in local/session storage and in the project draft file
- `packages/templates/test/templates.test.ts` (~626 and vite-react-world / world.html emit), starter vite config under templates
- Commits on tip: `01655c1a`, `5715708c`, `ba10f765`, `33d8030e`, `4dbed1b9`
- `gh run view 38454939704 --log-failed` and `gh run view 38454939713 --log-failed` if `gh` is authenticated (read-only)

## Steps

1. Verify first. On this worktree tip (`01655c1a`), reproduce:
   - `pnpm --filter @hitchhiker/app exec playwright test e2e/draft-persist.spec.ts -g "skip removes"`
   - `pnpm --filter @hitchhiker/app exec playwright test e2e/live-guide.spec.ts`
   - On this Windows machine: `pnpm --filter @hitchhiker/templates test` (or the single failing templates case). List every failure. If something is already green, prove it and skip that item.
2. Fix **Skip draft clear** so after Skip the persisted draft keys no longer contain the skipped text (`"Skip me"`), the box is empty, and DP-0.2 is visible. Keep the original assertions. Commit `fix(app): skip clears the persisted draft key (223)`.
3. Fix **Answer enable after fill** so the first live-guide `say` (and any typed Answer) enables `[data-action="answer"]` when `#hh-card-draft` has non-empty text, whether the text arrived via `input` events or Playwright `fill`. Prefer product fix over changing the e2e helper; if the helper must dispatch `input`, keep it minimal and say why. The full Towel and Tea replay must pass. Commit `fix(app): Answer enables when the draft has text (223)` (or the matching root-cause message).
4. Fix **Windows templates / Rolldown HTML emit** so the vite-react-world (and any sibling) starter builds under a Windows `%TEMP%` short path without emitting `../`-prefixed or absolute `fileName`s. Prefer fixing how the starter sets `build.outDir` / HTML input / emit names, or how the test copies/builds it, over skipping Windows. Commit `fix(templates): Windows-safe vite HTML emit (223)`.
5. Re-run the full verification block. As a checkpoint, review once like Zaphod and fix at most one leftover in a `fix(review):` commit.

## Non-goals

- Do not redo 220/221/222 fixes except where these CI failures prove a regression.
- No new dependencies. No CI workflow edits. No `.hh-driver/` or `hh-build-plan/` edits (except this one new prompt file already on disk).
- Do not touch the 4175 desk or the main working tree.
- Do not loosen, skip, delete, or gate any failing test.

## Acceptance criteria

- [ ] `pnpm lint` and `pnpm typecheck` / `pnpm exec tsc -b --pretty false` green.
- [ ] `pnpm -r test` fully green on this Windows machine (including `@hitchhiker/templates`).
- [ ] `pnpm --filter @hitchhiker/app exec playwright test` fully green (0 failed), including draft-persist skip and live-guide.
- [ ] Each root cause named with evidence in `.hitchhiker-dev/summaries/223.md`.
- [ ] No test was skipped, deleted, gated, or loosened.

## must_haves

truths:

- Skip removes the persisted draft key for the skipped answer text.
- A non-empty `#hh-card-draft` enables Answer so live-guide `say` can advance.
- Templates starters build under Windows temp (including 8.3 short paths).
- Unit + Playwright are fully green on tip before this prompt finishes.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

## Report back

At most 250 words in the last commit body and `.hitchhiker-dev/summaries/223.md`: step-1 failures, root cause per cluster, commits landed, verification results, any BLOCKED items with reasons.

## Commit

```
fix(app): turn fix-220 CI green after 222 (223)
```
