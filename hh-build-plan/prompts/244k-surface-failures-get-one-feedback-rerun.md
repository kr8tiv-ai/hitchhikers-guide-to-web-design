---
id: 244k
title: Surface close failures get one feedback rerun, and the repeated-sentence reason names its sources
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 244j
---

# 244k - Surface close failures get one feedback rerun, and the repeated-sentence reason names its sources (BUG-136)

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c), running on main c32a4cea (244j, CI/E2E/Audit green). After the 034 retry, prompts 035 and 036 passed. Prompt 037 (layout for one page; Files: one Section component and the page file) failed at close:

"Repeated sentence failed. dist/how-buying-works/index.html: A licensed Costa Rican lawyer and a notary close the purchase offline."

The 12-word sentence is visible three times on that page: the section's lead line and one step card (both rendered by the component the prompt owns), plus a FAQ answer rendered by a feature component owned by a later prompt. The check itself is correct: the prompt could pass by rewording its own step copy. But the session never got the chance:

1. `surfaceCloseReason` in `packages/engine/src/guide/site-build.ts` returns Repeated sentence / Placeholder contact / Concept image / Empty gallery / Duplicate block / Home listings failures, and these halt the prompt as failed. Only reasons starting with "Visible copy failed." go through `failOrRerunVisibleCopy` / `canRerunVisibleCopy`, which hand the reason back to one recovery rerun. So a surface failure gives no feedback, and a desk Retry repeats the same blind run (the same problem BUG-120 fixed for visible copy).
2. The repeated-sentence reason (`formatRepeatedSentenceFailure` in `packages/engine/src/spec/site-surface.ts`) does not say how many times the sentence appears or which source files contain it, so the session cannot tell which copy it owns. Duplicate-block hits already get `; sources: ...` from `nameDuplicateSources`.

Confirm by reading the code; if the real cause differs, fix that and say so in the commit body.

## Deliverables

1. A per-prompt (non-final-QA) close failure from the surface checks gets exactly one recovery rerun with the failure reason handed back, using the same mechanism, record shape and "one rerun, a second failure halts" rule as visible copy. Combined reasons (visible copy plus surface) also rerun once. The final QA / launch prompts keep their current behaviour. Generalize the existing helpers rather than adding a parallel path; rename them if the old names become wrong, and update every caller and doc comment.
2. The recovery prompt text tells the session plainly what to change: for a repeated sentence, reword or remove the copies in files it owns so the sentence appears at most twice on the page; never edit files owned by other prompts; never weaken a check.
3. The repeated-sentence hit detail includes the count and the source files under `src/` whose template markup or data contains the sentence (reuse the 244j once-per-file source scan; template markup and data strings, not frontmatter logic), for example `"<sentence>" appears 3 times; sources: src/components/A.astro, src/components/B.astro`. Keep the 180-character clip on the sentence only.
4. Smallest change that fits; remove dead code. Do not edit site-c, any generated site, srv.js, or app UI code. Generic: no site-c names, page names or prompt numbers hard-coded.
5. Do not loosen, delete or change any existing assertion in any test, and do not change the repeat limit (two copies allowed, a third fails) or the 12-word threshold. Add new tests.

## Tests

Add `packages/engine/test/desk-run11-244k.test.ts` (failing first, then green; short vitest timeouts):
- a page prompt whose owned page shows a 12-word sentence three times fails close with a Repeated sentence reason, is set back to queued with `recoveryRerun: true` and the reason recorded as recovery, and a second identical failure settles it as failed;
- the same for a Placeholder contact failure on an owned page;
- the repeated-sentence detail reports the count and lists the src files that contain the sentence (one owned component, one other component), and does not list a file where the sentence only appears inside frontmatter code;
- the recovery prompt text built for a surface failure includes the reason and the "reword copies in files you own" instruction;
- the final QA prompt still fails without a rerun exactly as before;
- all 244a-244j tests pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm typecheck`
- `pnpm lint`

If a fixture trips a check, fix the fixture, never weaken the check.

## Commit

```
fix(engine): surface close failures get one feedback rerun, and the repeated-sentence reason names its count and source files (244k)
```