---
id: "251c"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: []
time_cap_min: 90
title: "Score reference sites against the brief instead of using file order"
---

# 251c. Reference-site matching by brief (time box 90 min)

## Evidence (`build-plan/evidence-run11/LIBRARY-AUDIT.md`, read-only code audit of d529dde5)
- `packages/engine/src/brand/directions.ts` `dealDirections(root, projectDir)` (:152) -> `pagesForDeal()` (:470) -> customer-named refs first (DP-5.1/5.2 vs `NAMED_REFERENCES`), then `loadGalleryPages()` (:582) in FILE ORDER of `packages/knowledge/galleries/curated.json`; the deal takes the first 3 with distinct section orders. No brief / style-world / industry matching. Callers: `design-stage-desk.ts:25` `saveDirectionDeal(dealDirections(undefined, projectDir))`, `brand/kit-from-interview.ts:159`.
- `packages/engine/src/spec/design-language.ts` `techniqueNotes()` (:186) -> `galleryExcerpt(rows, styleText)` (:216) puts only the first 2 rows whose `styleWorld` equals `styleWorldFrom(brief)`, in file order, into every prompt's Technique notes.
- `curated.json` = 128 sites. Every entry carries: `id, name, url, industry, family, styleWorld, styleTags[], why, palette{note,hex[]}, typography, borrow, motionLevel (0-10), award, verified, checked, noted`. Design-library entries (`packages/knowledge/design-library/entries/*.json`, see `SCHEMA.md`) carry `styleWorld, sectionTypes[], moods/notes, libraries[]` (check the schema). A library ingest is running on another branch and may add entries/fields later: missing fields must score 0, never throw.

## Spec
1. One pure, deterministic scorer module (e.g. `packages/engine/src/brand/reference-score.ts`) `scoreReference(page, briefSignals)` and `rankReferences(pages, briefSignals)`; and `briefSignals(briefOrFacts)` that extracts: industry (map brief words to curated `industry` values), style world (`styleWorldFrom`), moods/style tags (calm, editorial, bold, minimal, dark, luxurious, playful, technical, warm, organic ... matched against `styleTags`, `why`, `noted`, `palette.note`), motion appetite (low/high vs `motionLevel`), and section needs (sections the brief names: gallery, booking, map, testimonials, pricing, team, story ... vs the page's section order/`sectionTypes` when present).
2. Weighted sum with documented weights (put them in one exported const), tie-break by `id` ascending so the order is fully deterministic. Do not use randomness, dates, or network.
3. `dealDirections`/`pagesForDeal`: customer-named sites stay FIRST, in the order the customer named them; the gallery remainder is ranked by the scorer (then the existing "distinct section orders" rule applies). Pass the brief/facts in from `projectDir` (read the brief/interview the same way the callers already can); with no brief, fall back to today's file order so nothing regresses for empty projects.
4. `galleryExcerpt`: pick the top 2 by score (style world match is one weighted signal, not a hard filter, so a strong industry+mood match can still appear), deterministic.
5. If `guide/suggest.ts` `referenceCards()` also uses plain file order, route it through the same scorer; otherwise leave it.

## Acceptance criteria and tests (`packages/engine/test/reference-score-251c.test.ts`)
- Fixture gallery (small inline array, not the real file) + a calm, organic real-estate/hospitality brief (like `build-plan/evidence-run11/PARADISE-FOUND-BRIEF.md`): the top results are the matching industry/mood sites, and a file-order-first unrelated site (e.g. a dark WebGL personal site placed first in the array) is NOT in the deal. Fails on d529dde5.
- Customer-named refs stay first and in the named order even when they score low.
- Same input twice -> identical order; shuffled input array -> identical order (determinism).
- Entries missing `styleTags`/`industry`/`motionLevel` score without throwing.
- `galleryExcerpt` picks the 2 best-scoring rows, not the first 2 in file order.
- Empty brief -> previous file-order behavior (existing direction-deal tests stay green unchanged).
- Real data smoke: with the real `curated.json` and the Paradise Found brief, the deal has 3 directions and the ranking is stable (assert ids are a deterministic snapshot only if stable; otherwise assert properties).

## Commit
```
feat(engine): rank reference sites against the brief, named sites first (251c)
```

## Rules (all 251 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix251-wt` (branch `fix-251`, base `d529dde5`). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\hh-fix250-wt`, `C:\Users\lucid\Desktop\hh-fix250b-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. The run 11 evidence you need is copied into `build-plan/evidence-run11/` (read only). Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Spec first, test first: write the new test(s) from the Acceptance criteria below, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test. Do not touch `vendor/`, `.hh-driver/` or `build-plan/`. Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test is running on 4175). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build or a live Grok interview call; tests use fakes or `HH_CASSETTE=replay`.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm --filter @hitchhiker/qa test`, `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(251x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes. Pushing to `main` needs Matt's explicit yes.
- Line numbers are for `d529dde5`; re-find the code if it moved.
