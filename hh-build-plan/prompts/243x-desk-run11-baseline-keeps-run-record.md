# 243x - Desk Run 11: Keep the Previous Prompt's Run Record When the Visible-Copy Baseline Is Taken

## Context

243w (commit `4442a760`) added `recordVisibleCopyBaseline(projectDir, promptId, startedAt)` in `packages/engine/src/guide/site-build.ts`. It runs before a prompt's Grok session starts and, when the run file belongs to a different prompt, it replaces the whole run file with a fresh record (`reason: ""`, no `outsideAccess`, empty `lastLines`, etc.) plus `copyBaseline`.

That wipes the previous prompt's run record before the next prompt is spawned. The existing test `packages/engine/test/site-build-043.test.ts` ("a read outside warns on the run record and the queue continues", line ~262) now fails on every run with:

```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /The build looked outside its folder:/. Input: ''
```

because prompt 002's spawn reads `readBuildRun(request.cwd)` and finds 001's warning reason and `outsideAccess` gone. This is a regression from 243w, not a flaky test.

## Deliverables

1. Take the baseline without rewriting the previous prompt's run record. Store the visible-copy baseline so it does not clobber the prior record before the new prompt's own run record is written. Preferred: keep the baseline in memory and pass it into the run record when the new prompt's record is first written, or keep it in its own file (for example `.hitchhiker/copy-baseline.json` holding `{ promptId, startedAt, distExisted, counts }`) that `enforcePromptClose` reads by prompt id. Pick the smallest change that fits the existing code; remove code that becomes dead.
2. A retried prompt must still take a fresh baseline (243w behaviour), and `enforcePromptClose` must still find the baseline for the prompt being closed.
3. Do not change `site-build-043.test.ts` or loosen any assertion in it, in `desk-run11-243w.test.ts`, or in `desk-run11-243u.test.ts`.

## Tests

Add to `packages/engine/test/desk-run11-243w.test.ts` (or a new `desk-run11-243x.test.ts`) a test that a second prompt's spawn still sees the first prompt's run-record reason and `outsideAccess` after the baseline is taken, and that the second prompt's close still uses its own baseline (a pre-existing TODO elsewhere in dist does not fail it, a new one does).

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/site-build-043.test.ts packages/engine/test/desk-run11-243w.test.ts packages/engine/test/desk-run11-243u.test.ts`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

`fix(engine): take the visible-copy baseline without wiping the previous prompt's run record, so outside-read warnings survive into the next prompt (243x)`