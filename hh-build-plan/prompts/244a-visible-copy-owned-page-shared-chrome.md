# 244a - Visible-copy close gate: an owned page fails only for hits the page itself carries, not for shared chrome owned by other prompts

## Context

Desk run 11 (project Run Eleven C, prompt 035, which owns `dist/live-on-the-land/index.html`) failed at close with "Visible copy failed. Owned page: dist/live-on-the-land/index.html: ...". Every listed hit comes from shared components and shared data that other prompts own and that appear on many pages: the footer WhatsApp note ("The WhatsApp number is TODO", "Spanish for this note is TODO", "PUBLIC_WHATSAPP_NUMBER is read from the environment"), the llms.txt / farm list facts ("Water source TODO ... Asking price, set by the seller: TODO"), `data-copy-es="TODO"`, and `data-requirement=` / `data-component=` / `data-job=` attributes from Feature*.astro components (FeatureFooterLegalDisclaimer, FeatureLlmsTxt, FeatureWhatsappLink, FeatureEnEsToggle). Compared with the copy baseline taken before 035, the page's counts went DOWN (todo 161 to 135, data-job 8 to 5), so the prompt made the page better and still failed.

Cause: `judgeVisibleCopy` in `packages/engine/src/spec/visible-copy.ts` compares an owned page to an empty baseline, so every hit on that page fails the prompt, including hits rendered by shared layout/components/data the prompt does not own and is told not to touch. A page-copy prompt early in the queue can therefore never pass until every shared component is finished, which deadlocks the ordered queue the same way BUG-119 did for the whole site.

Confirm this by reading `judgeVisibleCopy`, its callers in `packages/engine/src/guide/site-build.ts` (enforcePromptClose and the feedback rerun added in 243y) and the existing tests. If the real cause is different, fix that instead.

## Deliverables

1. Keep the intent of the owned-page rule: a scaffold placeholder or narration that lives in the prompt's own page (text that only that page carries) still fails, even when it was already there before the prompt.
2. A hit on an owned page whose pattern and snippet also appear on at least one dist HTML page the prompt does NOT own is shared chrome. Judge it by the normal increased-count rule (fails only if that file/pattern count went up versus the baseline), not by the empty-baseline rule. When there is no baseline (dist did not exist), shared hits on owned pages do not fail the prompt; note it in the run-log note.
3. Owned SOURCE hits (patterns in files the prompt owns) keep failing exactly as now. QA and launch prompts keep the full-site scan unchanged.
4. The failure reason must say which hits are page-only and, if any increased shared hits fail, label them separately so the next session knows what it must fix. Keep the reason bounded (existing cap).
5. Small extra found in the same run: `.hitchhiker/queue.json` showed item 029 still `running` after 029 passed and the queue moved on to 032 and 035. Find where a queue item's status is set when its build passes after a retry/feedback rerun and make it end as `passed`. Only fix this if the cause is clear and small; otherwise leave it and say so in the commit body.
6. Smallest change that fits the existing code; remove anything that becomes dead. Do not change app UI code.
7. Do not loosen or delete any existing assertion in any test or spec. Add new tests instead.

## Tests

In the engine unit tests for visible-copy (find them with `git grep -n "judgeVisibleCopy" -- packages/engine/test`):
- owned page with a hit that appears only on that page fails (with and without baseline);
- owned page with a hit whose snippet also appears on a non-owned page, count unchanged or lower than baseline, passes;
- same shared hit with a higher count than baseline fails and is labelled as shared;
- no baseline plus shared hit on owned page passes with a note;
- owned source hit still fails; full-site QA prompt still fails on any hit.
If item 5 is fixed, add a test for the queue status.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(engine): judge shared-chrome hits on an owned page by the baseline so page prompts are not failed for components they do not own (244a)
```