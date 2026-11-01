# 244b - Visible-copy close gate: a site-wide copy pass that is not QA or launch is judged by the baseline, and a site-wide pass gets the one feedback rerun

## Context

Desk run 11 (project Run Eleven C) prompt 102 "Run the anti-slop pass on copy and layout." ran 35 minutes, committed real work, and failed at close with "Visible copy failed." followed by a full-site list of hits: `data-copy-es="TODO"` on every page (Spanish strings for the en-es toggle are still TODO in shared components), and "not written yet" text on blog, eco-building-and-food and how-buying-works (guides and methods that have no real content yet). Compared with the copy baseline taken before 102 (`.hitchhiker/build-run.json` copyBaseline), counts went DOWN sharply: dist/index.html `todo` went from 108 to 10, about/index.html from 108 to 9 `data-copy-es="TODO"` hits. So the pass made the site much better and still failed.

Two engine problems:
1. A site-wide copy pass that is not a QA or launch prompt (the anti-slop pass 102 and the later elevate pass 116 "Elevate pass for copy. Never show a missing fact as TODO...") is judged with an empty baseline over the whole site, like the final QA scan. Missing Spanish copy and missing-fact placeholders are the elevate pass's job (116 runs after 102), and the final QA/launch prompts keep the strict full-site scan, so an earlier site-wide pass can never pass and the ordered queue deadlocks (same shape as BUG-119 and BUG-122).
2. `canRerunVisibleCopy` in `packages/engine/src/guide/site-build.ts` refuses the one feedback rerun when `startedOverPrevious` is true and the reason has no "Owned source:" section. A site-wide pass owns the whole site's source, but its reason is the full-site form with no "Owned source:" header, so it never gets the rerun that hands the reason back.

Confirm both by reading `judgeVisibleCopy` in `packages/engine/src/spec/visible-copy.ts`, how site-wide vs QA/launch prompts are told apart (find where the full-site scan is chosen), `canRerunVisibleCopy` / `failOrRerunVisibleCopy`, and the existing tests (`git grep -n "judgeVisibleCopy" -- packages/engine/test`). If the real cause is different, fix that instead and say so in the commit body.

## Deliverables

1. Site-wide copy passes that are not QA or launch prompts are judged by the increased-count rule against the copy baseline: a file/pattern fails only if its count went up versus the baseline. With no baseline (dist did not exist before the prompt), such a pass fails only on hits in files it wrote, and the run-log note says so.
2. QA and launch prompts keep the strict full-site scan exactly as now, with no baseline allowance. The final QA must still fail on any TODO, data-copy-es="TODO", "not written yet" narration, data-job, data-launch-check, or PUBLIC_ name.
3. When a site-wide (non-QA) pass does fail on increased counts, its failure is eligible for the one feedback rerun even if it started over a previous prompt's run record, as long as the run record handoff that the existing comment protects is preserved; read why `startedOverPrevious` blocks reruns and keep that guarantee. If keeping it is not possible, leave the rerun rule alone and explain in the commit body.
4. Page-copy prompts (244a owned-page rule) and owned-source hits keep behaving exactly as now.
5. The failure reason stays bounded (existing cap) and labels increased hits clearly.
6. Smallest change that fits the existing code; remove anything that becomes dead. Do not change app UI code or generated site prompts.
7. Do not loosen or delete any existing assertion in any test or spec. Add new tests instead.

## Tests

In the engine unit tests for visible-copy and site-build:
- site-wide non-QA pass whose counts are equal or lower than baseline passes;
- same pass with one file/pattern count higher than baseline fails and names that hit;
- site-wide non-QA pass with no baseline fails only on hits in files it wrote;
- QA/launch prompt still fails on any hit, with or without baseline;
- page-copy owned-page and owned-source tests from 244a still pass unchanged;
- if deliverable 3 is done, a test that a site-wide pass failure gets one rerun with the reason and a second failure halts.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(engine): judge site-wide copy passes by the copy baseline and keep the strict scan for QA and launch (244b)
```