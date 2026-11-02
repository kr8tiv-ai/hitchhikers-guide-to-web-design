# 244g - Empty-gallery and home-listings close checks fail only the prompt that owns the gallery or listings, not a section prompt that happens to share the page

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c) failed prompt 025 "Build the hero layout on Home." twice (Files: src/components/SectionHero.astro, src/pages/index.astro; Requirements: REQ-STRUCT-hero, REQ-ART-hero). The close reason was:

    Empty gallery failed. dist/index.html: gallery has no image
    Home listings failed. dist/index.html: no card links to a listing page

The offending markup is not the hero. It is the separate home-gallery section (section id "home-gallery", h2 "Farms", a text line naming PF-001..PF-005, no images and no card links). Later prompts own that work: 093 "Add the feature: gallery." (REQ-FEAT-gallery) and 058 farms-main image set (REQ-IMAGE-farms-main), plus the home page / listing card jobs. 244f wired the new structure checks (`packages/engine/src/spec/site-structure.ts`) into `surfaceCloseReason` in `packages/engine/src/guide/site-build.ts` using only the owned-dist-file rule, so any prompt that lists `src/pages/index.astro` (here a hero section prompt) is failed for a gallery and listing cards it was never asked to build, and cannot pass until 093/058 run. That deadlocks the queue.

Read `packages/engine/src/spec/site-structure.ts`, `packages/engine/src/spec/site-surface.ts`, `surfaceCloseReason` / `ownedSourcePaths` / `distHtmlForOwnedSource` / `promptRequiresFullVisibleCopy` in `packages/engine/src/guide/site-build.ts`, how a generated prompt states its requirement ids (the "Requirements:" line, e.g. REQ-PAGE-home, REQ-STRUCT-hero, REQ-FEAT-gallery, REQ-IMAGE-*, REQ-LAUNCH), and `packages/engine/test/desk-run11-244f.test.ts`. If the real cause differs, fix that and say so in the commit body.

## Deliverables

1. Ownership fix (preferred). Split the dist structure checks into two groups:
   - Page-content checks (placeholder contact, repeated sentence, concept image, duplicate block) keep the current owned-dist-file rule unchanged.
   - Feature checks (empty gallery, home listings) fail a prompt only when it owns that feature on an owned dist page, or it is a QA/launch prompt (full site, as today). A prompt owns the feature when its requirement ids include the gallery feature (REQ-FEAT-gallery or equivalent gallery/carousel requirement), a listing / card / image-set requirement (e.g. REQ-STRUCT-card, REQ-IMAGE-*, listing data), or the page's own page job (REQ-PAGE-<page>, which is the job that composes the whole page). A section-only prompt (REQ-STRUCT-<section> / REQ-ART-<section> such as the hero) is not failed by these two checks even though it lists the page file.
   - Derive this from the prompt's requirement ids with one small helper; do not hard-code site-c names, page names or prompt numbers.
2. The page-content checks still fail a hero/section prompt for its own owned page (a concept caption or duplicate block it writes is still its problem).
3. Smallest change that fits the existing code; update the doc comments above `surfaceCloseReason` and at the top of site-structure.ts to state the rule. Remove anything that becomes dead. Do not edit site-c or any generated site, srv.js, or app UI code.
4. Do not loosen, delete or change any existing assertion in any test (the 244f test's REQ-PAGE-home and REQ-PAGE-farm cases must keep failing exactly as they do, and REQ-LAUNCH must still fail on everything). Add new tests instead.

## Tests

Add `packages/engine/test/desk-run11-244g.test.ts` (reuse the 244f helpers pattern):
- a prompt with Requirements REQ-STRUCT-hero, REQ-ART-hero and Files src/components/SectionHero.astro, src/pages/index.astro, on a dist whose index.html has a "home-gallery" section with an empty gallery and listing pages with no home card links, passes (no Empty gallery, no Home listings in the reason);
- the same hero prompt still fails "Concept image failed" / "Duplicate block failed" when its owned index.html has a concept caption or a repeated spec block;
- a REQ-FEAT-gallery prompt owning index.html fails "Empty gallery failed" on that dist and passes once the gallery has three images;
- a REQ-PAGE-home prompt fails "Home listings failed" on that dist and passes with a farm card linking to /farms/pf-001/;
- a REQ-LAUNCH prompt fails both;
- all 244a-244f tests pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm typecheck`
- `pnpm lint`

If a fixture trips a check, fix the fixture so it is a correct example, never weaken the check.

## Commit

```
fix(engine): fail empty-gallery and home-listings close checks only for the prompt that owns the gallery or listings, not a section prompt sharing the page (244g)
```