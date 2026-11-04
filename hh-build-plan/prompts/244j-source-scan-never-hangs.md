---
id: 244j
title: The HTML walker always advances, and the close-check source scan reads only template markup
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 244i
---

# 244j - The HTML walker always advances, and the close-check source scan reads only template markup (BUG-134)

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c), running on main 8c262f0d (244i, CI/E2E/Audit green), retried prompt 034. The Grok session finished and the generated files were committed (build-034.log, 7:58 PM MST), then the desk froze inside the close checks: build-run.json stayed "running", every HTTP request to the desk on :4175 timed out (event loop blocked), and the desk node process ran at about one full CPU core for 35+ minutes until it was killed.

Reproduced outside the desk:
- `duplicateSourceCounts(projectDir, 'heading "Caretaker program" appears 2 times')` and `conceptSourceFiles(projectDir, ...)` from `packages/engine/src/spec/site-structure.ts` (both new in 244i, called from `surfaceCloseReason` in `packages/engine/src/guide/site-build.ts` via `nameDuplicateSources`, `ownsDuplicate`, `ownsConcept`) never return when `src/` contains site-c's `src/pages/privacy.astro` or `src/pages/terms.astro`. The other 39 src files take about 5 ms each.
- Bisected privacy.astro: the hang appears once the prefix reaches the Astro frontmatter line `if (countingCard.body.replace(/\D/g, "").length !== 0) {`. A `<` earlier in the TypeScript frontmatter (generics, comparisons) is read as a tag start; inside that fake tag `readTag`'s attribute loop meets a lone `/` that is not followed by `>`. The attribute-name scan `/[^\s=\/>]/` does not advance on `/`, nothing else consumes it, and the `while (index < html.length)` loop spins forever.

Suspected causes (confirm by reading the code; if the real cause differs, fix that and say so in the commit body):
1. `readTag` (and any similar scanner loop in site-structure.ts and its siblings in packages/engine/src/spec/) can fail to advance on some input. Every scanner loop must make progress on every iteration: a lone `/` (and any other character no branch consumes) must be skipped.
2. `srcVisitorFiles` feeds raw `.astro`/`.mdx`/`.tsx`/`.jsx`/`.svelte`/`.vue` source to `walkHtml`, including Astro frontmatter (`---` fences) and script code, which is not markup. The source scan should read only the template markup: strip a leading Astro/MDX frontmatter fence and script/style blocks before walking, so TypeScript never reaches the tag reader.
3. The source scan runs once per hit with no reuse: parse each src file at most once per close check (cache per call of `surfaceCloseReason`), so many hits do not multiply the work.

## Deliverables

1. Fix the non-advancing loop in `readTag` so `walkHtml` terminates on any input (prove it with a test, see below). Check the other hand-written scanner loops in packages/engine/src/spec/ for the same class of bug and fix any you find.
2. The 244i source scan reads only template markup (frontmatter fence and scripts removed) and parses each source file at most once per close check.
3. Keep 244i behaviour exactly: the 244i tests must pass unchanged, and duplicate/concept ownership results on real markup must not change.
4. Smallest change that fits; update doc comments; remove dead code. Do not edit site-c, any generated site, srv.js, or app UI code. Generic: no site-c names, page names or prompt numbers hard-coded.
5. Do not loosen, delete or change any existing assertion in any test. Add new tests.

## Tests

Add `packages/engine/test/desk-run11-244j.test.ts` (failing first, then green; give each test a vitest timeout of a few seconds so a regression fails instead of hanging the suite):
- `walkHtml`-based scans (`scanDuplicateBlocks`, `scanConceptImages` on a temp dist, and `duplicateSourceCounts` / `conceptSourceFiles` on a temp project) return promptly on markup containing a stray `<` followed later by a lone `/` (for example `<a b / c>` and `a < b; x.replace(/\D/g, "")`);
- an `.astro` source whose frontmatter has TypeScript generics, comparisons and a regex literal with `/`, followed by a template with two visible `<h2>Caretaker program</h2>` headings: `duplicateSourceCounts` returns that file with count 2 and finishes in well under a second;
- frontmatter or script text that merely contains `<h2>Caretaker program</h2>` inside a string is not counted;
- all 244a-244i tests pass unchanged.

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
fix(engine): the HTML walker always advances past a stray slash, and the close-check source scan reads template markup only, once per file (244j)
```