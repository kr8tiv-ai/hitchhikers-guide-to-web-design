# 243y - Desk Run 11: Let a Section Prompt Fix the Plan Metadata It Owns (Dev-Only Guard, Fix-First Notice, One Feedback Rerun)

## Context

Desk run 11 (project Run Eleven C, site-c) re-ran copy prompt 026 (Files: `src/components/SectionHero.astro`) after 243w/243x. It failed at close with:

```
Visible copy failed. Owned source: src/components/SectionHero.astro: emap= sitemapId data-component= component data-job= job data-requirement="REQ-IMAGE-hero" ...
```

`SectionHero.astro` (written by earlier prompts before 243u) carries plan metadata attributes such as `data-job={job}`, `data-component={component}`, `data-sitemap={sitemapId}` on the section element. `enforcePromptClose` in `packages/engine/src/guide/site-build.ts` scans owned visitor source with `scanVisibleCopyText` (`packages/engine/src/spec/visible-copy.ts`) and the `data-job` markup pattern matches. Three engine problems make this prompt fail every time:

1. The site rule (`SITE_RULES` in `packages/engine/src/spec/site-rules.ts`) says plan metadata attributes "stay dev-only or are stripped", but the owned-source scan matches `data-job\s*=` in source no matter what, so even a correct dev-only guard such as `data-job={import.meta.env.DEV ? job : undefined}` would still fail the gate.
2. The model is never told that the file it owns already holds a hit. The copy was already correct, so the session reported "nothing in that file needed a new edit", made no change, and then failed a check it never saw.
3. On a visible-copy close failure the prompt halts at once. The failure reason is never given back to the model, so a desk Retry repeats the same blind run.
4. The reason text is hard to act on: the owned-source line shows the stripped snippet (`emap= sitemapId data-component= component ...`) with no line number.

## Deliverables

1. Dev-only guard counts as stripped. In the owned-source scan only (not the dist scan), a markup-scope metadata hit (`data-job`, `data-launch-check`, `data-component-path`) is not a hit when that attribute's value expression is guarded by `import.meta.env.DEV` (for example `data-job={import.meta.env.DEV ? job : undefined}` or `{...(import.meta.env.DEV ? { "data-job": job } : {})}`). A plain `data-job={job}` or `data-job="..."` is still a hit. The dist scan of production HTML is unchanged.
2. Fix-first notice. Before a prompt for which `shouldScanVisibleCopy` is true is spawned, scan its owned visitor source files (same ownership rules as `enforcePromptClose`). When there are hits, add a short engine-owned block to the text sent to the session (not to the task text in the prompt file) titled `Fix before you finish`, listing each hit as `file:line` plus the raw source text of the attribute or line, and the instruction: remove the plan metadata attribute or guard it with `import.meta.env.DEV`; replace TODO and build narration with visitor copy. No block when there are no hits.
3. One feedback rerun. When `enforcePromptClose` fails a prompt with a visible-copy reason and that prompt has not had a recovery rerun yet, requeue it once (reuse the existing `recovery` / `recoveryRerun` run-record fields) and include the failure reason in the fix-first block of the rerun. A second visible-copy failure fails and halts as today. Other close failures keep today's behaviour.
4. Readable owned-source hits. Owned-source hit lines show `file:line` and the original source text around the match (for example `src/components/SectionHero.astro:130 data-job={job}`), not the attribute-stripped snippet.
5. Keep the change small: reuse `scanVisibleCopyText`, `ownedSourcePaths`, `isVisitorSource` and the existing recovery flow; remove code that becomes dead. Do not touch site-c or any generated site.

## Constraints

- Do not loosen or edit existing assertions in `desk-run11-243u.test.ts`, `desk-run11-243w.test.ts`, `desk-run11-243x.test.ts` (if present) or `site-build-043.test.ts`. Never use `--no-verify`.
- The full-site visible-copy scan for QA and launch prompts stays as it is.

## Tests

Add `packages/engine/test/desk-run11-243y.test.ts` covering:
- owned source with `data-job={job}` is a hit; with `data-job={import.meta.env.DEV ? job : undefined}` it is not; production dist HTML containing `data-job=` is still a hit;
- the spawned session text for a copy prompt whose owned file holds a hit contains `Fix before you finish` with `file:line`; a clean owned file gives no block;
- a first visible-copy close failure requeues the prompt once with the reason in the rerun's fix-first block, and a second failure fails the prompt;
- owned-source hit lines include the line number and raw attribute text.

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/desk-run11-243y.test.ts packages/engine/test/desk-run11-243w.test.ts packages/engine/test/desk-run11-243u.test.ts packages/engine/test/site-build-043.test.ts`
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(engine): accept dev-only plan metadata in owned source, tell a section prompt about hits in its own files, and rerun once with the close-check reason (243y)
```