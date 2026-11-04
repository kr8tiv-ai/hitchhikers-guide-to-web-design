---
id: 244i
title: Concept-image and duplicate-heading close checks only flag listing imagery and real repeated blocks
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 244h
---

# 244i - Concept-image and duplicate-heading close checks only flag listing imagery and real repeated blocks (BUG-132)

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c), running on main 108f158f (244h, CI/E2E/Audit green), failed prompt 034 "Build the live-on-the-land-main layout on Live on the Land." at close (site-c/.hitchhiker/build-run.json, 2026-11-02 7:59 AM MST):

    Concept image failed. dist/live-on-the-land/index.html: This picture is a concept, not a listed farm.
    Duplicate block failed. dist/live-on-the-land/index.html: heading "Caretaker program" appears 2 times

The recovery text for the same queue also shows dist/farms/index.html failing "Duplicate block failed" with each heading PF-001..PF-005 appearing 2 times, plus visible-copy hits from FeatureFavorites / FeatureFiltersSortAndUrlState / FeatureMap (data-copy-es="TODO", data-job attributes) that later prompts own.

Suspected causes (confirm by reading the code; if the real cause differs, fix that and say so in the commit body):
1. Concept image: BUG-127 (244f) is about listing imagery: a farm card or farm page must not use a concept still in place of the owner's hero crop. Every non-listing page layout (about, blog, contact, eco, how-buying-works, live-on-the-land, privacy, terms) honestly captions its art-directed still "This picture is a concept, not a listed farm." `conceptHits` in `packages/engine/src/spec/site-structure.ts` matches that phrase in a figure caption on a page that is not a listing page and not a card. A concept still on a non-listing page, honestly captioned, is allowed by the brief. Only flag concept imagery on listing pages (farm detail routes) or inside listing cards. Check that CONCEPT_PHRASE / the frame-text branch honour the same `listing || card` guard the alt/title branches use.
2. Duplicate heading: on live-on-the-land a "Caretaker program" heading appears twice. Find out whether this is (a) a real duplicate the page prompt wrote (then it is correct that it fails, and the prompt feedback must name the two source locations so the rerun can fix it), or (b) a heading counted twice because of a visually hidden / sr-only / `<template>` / `data-copy-es` / noscript / EN-ES dictionary script copy or a nav label, which must not count. Same question for the PF-00x headings on /farms: if the filters and favorites features each render the cards (the 244h ONE_BLOCK_PER_PAGE_RULE case), the failure belongs to the prompt that owns those features (use the 244g ownership helper), not a page-layout prompt for a different page.
3. Ownership: a page-content check must fail a prompt only for hits whose source is a file that prompt owns or wrote this session. Hits coming from features/components owned by later prompts must not fail an earlier layout prompt (same deadlock class as BUG-119/BUG-122/244g).

Read `packages/engine/src/spec/site-structure.ts`, `surfaceCloseReason` and the 244g ownership helper in `packages/engine/src/guide/site-build.ts`, and `packages/engine/test/desk-run11-244f.test.ts`, `-244g.test.ts`, `-244h.test.ts`.

## Deliverables

1. Concept check: flag concept stills only on listing pages and in listing cards. An honestly captioned concept still on any other page passes. Keep BUG-127 behaviour: a farm card or farm page with a concept image still fails.
2. Duplicate check: do not count headings that are hidden, inside template/noscript/script/JSON, translation dictionaries, or nav/footer chrome. A real visible repeated heading or block still fails. The failure detail names the source files when they can be found so the feedback rerun can act.
3. Ownership: page-content hits caused by components owned by a later prompt do not fail the current prompt; QA/launch prompts still get the full strict scan.
4. Smallest change that fits; update doc comments; remove dead code. Do not edit site-c, any generated site, srv.js, or app UI code. Generic: no site-c names, page names or prompt numbers hard-coded.
5. Do not loosen, delete or change any existing assertion in any test. Add new tests.

## Tests

Add `packages/engine/test/desk-run11-244i.test.ts` (failing first, then green):
- a layout prompt owning live-on-the-land/index.html whose figure caption is "This picture is a concept, not a listed farm." passes the concept check;
- a farm detail page or a listing card with a concept image still fails "Concept image failed";
- a page with one visible "Caretaker program" h2 plus the same string in an EN-ES dictionary script / data attribute / sr-only label passes the duplicate check; two visible h2 "Caretaker program" sections still fail and the detail names the page;
- a /farms page where a later-owned feature component renders PF-001 cards a second time does not fail an unrelated page-layout prompt, but fails the prompt owning that feature and a REQ-LAUNCH prompt;
- all 244a-244h tests pass unchanged.

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
fix(engine): concept-image check flags only listing imagery, duplicate-heading check ignores hidden and dictionary copy, and later-owned components do not fail an earlier layout prompt (244i)
```
